// Reusable price-import engine. Pulls Riftbound singles from AU Shopify stores'
// public products.json feeds, matches them to cards, and writes RetailerPrice
// rows + Card.lowestPriceCents. Called by scripts/import-prices.ts (CLI) and the
// scheduled /api/cron/refresh-prices route.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory, ensureHistoryCards } from "./db-history";
import { RETAILER_LIST, RetailerInfo } from "./retailers";
import { isEbayEnabled, isEbayRateLimited, searchEbayLowest, searchEbayAuctions, primeEbayBudget, ebaySpentThisRun, parseGrade, type EbayResult } from "./ebay";
import { importSealed } from "./sealed-import";
import { snapshotDemand } from "./demand-snapshot";
import { refreshTcgplayerPrices } from "./tcgplayer";
import { importMarketplaceListings } from "./marketplace";
import { refreshCardmarketPrices } from "./cardmarket";
import { AU_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS, pricePrioritySetCodes, PRICE_PRIORITY_WINDOW_DAYS, chasePrintRarity, isSignature, isOvernumbered } from "./constants";
import { currencyOf, isoCountry, priceField, type Country } from "./country";
import { USD_TO } from "./fx";
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "./scrape-http";

export interface ShopifyVariant { title: string; price: string; available: boolean }
export interface ShopifyProduct { title: string; handle: string; variants: ShopifyVariant[] }

// Calendar day (date-only) in Australia/Sydney, used as the price-history x-axis
// bucket so there's exactly one snapshot per card per local day.
function sydneyDay(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export interface ImportSummary {
  stores: { name: string; products: number; priced: number; matched: number; unmatched: number }[];
  totalMatched: number;
  totalUnmatched: number;
  cardsPriced: number;
}

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving\s*grounds|\bOGS\b/i, "OGS"],
  [/spirit\s*forged|\bSFD\b/i, "SFD"],
  [/unleashed|\bUNL\b/i, "UNL"],
  [/vendetta|vengeance|\bVEN\b/i, "VEN"],
  [/origins|\bOGN\b/i, "OGN"],
];

// Set/condition/qualifier tokens to strip when isolating the card name.
const STOP =
  /\b(riftbound|proving\s*grounds|spirit\s*forged|unleashed|vengeance|origins|showcase|signature|overnumbered|alternate\s*art|alt\s*art|foil|holo(foil)?|near mint|lightly played|moderately played|heavily played|damaged|main set|the game|tcg|single)\b/gi;

function numKey(seg: string): string {
  // Riftbound collector numbers come in two shapes, and BOTH have to normalise
  // here or the index and the title parser stop agreeing:
  //   * a plain sequence number — "007", "007a", "223*"
  //   * a LETTER-PREFIXED cycle number — "R01" / "R01a" / "R01b" for the six
  //     basic runes every set prints, "t01" for token cards. These carry no
  //     "/total" at all.
  // The prefix is part of the card's identity so it is kept; the digits are still
  // leading-zero normalised, so "R1" and "R01" resolve to the same card.
  const m = seg.match(/^([a-z]*)0*(\d+)([a-z]*)/i);
  const base = m ? m[1].toLowerCase() + m[2] + m[3].toLowerCase() : seg.toLowerCase();
  // A "*" marks a Signature print (e.g. "223*/221"), a DIFFERENT card from the
  // plain overnumbered "223/221" — keep their keys distinct so listings don't mix.
  return seg.includes("*") ? `${base}s` : base;
}
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function cleanProductName(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(STOP, " ");
}
// The rune cycle's collector number: "R01", "R02a", "R02b" — a letter prefix, one
// to three digits and an optional print letter, with NO "/total" after it. Only
// "R" is accepted, deliberately: this pattern is loose enough that opening it to
// any letter would start reading store SKUs ("B12", "S2") as collector numbers,
// and a wrong number is worse than no number — it makes resolveCardId reject the
// listing outright. Runes are the only letter-prefixed cycle stores actually list.
//
// There is deliberately NO set-prefixed variant ("[UNL - R02a]") to go with the
// `pref` branch below. It isn't needed — every set that prints runes is already
// recognisable from the title by SET_FROM_TITLE, which reads both the set name
// and its code — and a `([A-Za-z]{2,4})\s*-\s*` prefix would happily read the
// word "Rune" itself out of "Fury Rune - R01" and hand resolveCardId "RUNE" as a
// confident set code, which matches no set and drops the listing.
const RUNE_BARE = new RegExp(String.raw`\bR\d{1,3}[a-z]?\b`, "i");

// Parse a collector number from any store title format, e.g.:
//   "(299*/298)", "(053/219)", "OGN-128/298", "[OGN - 213/298]", "239*/221",
//   "(R02b) (R02b) - Unleashed Foil", "Calm Rune (R02a) [UNL - R02a]"
// Keys are normalised via numKey so "039" and "39" compare equal (the leading-zero
// bug that previously mis-assigned base cards to their alt-art printings).
//
// THE RUNE BRANCHES ARE NOT COSMETIC. Every set prints its six basic runes three
// times — base ("R02"), alt-art ("R02a") and a second special ("R02b") — and all
// three share one name, "Calm Rune". Because the rune number has no "/total",
// this function used to return null for every one of those listings, which skips
// the number-disambiguation guard in resolveCardId entirely and lets name-only
// matching collapse all three prints onto the base card. In a market where the
// only listings a store carried were the alt-arts, that is exactly what happened:
// base runes worth about ten cents were showing $13.70 in NZ and $15.00 in AU,
// carrying the alt-art's price, in the database and therefore in the pack sim too.
function parseNumber(title: string): { setCode: string | null; key: string; total: string } | null {
  const pref = title.match(/\b([A-Za-z]{2,4})\s*-\s*(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (pref) return { setCode: pref[1].toUpperCase(), key: numKey(pref[2] + pref[3]), total: pref[4] };
  const bare = title.match(/(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (bare) return { setCode: null, key: numKey(bare[1] + bare[2]), total: bare[3] };
  // No "/total" anywhere — the shape a rune number has. `total` stays "" so
  // setFromTotal() simply declines and the set still has to come from the title.
  const rune = title.match(RUNE_BARE);
  if (rune) return { setCode: null, key: numKey(rune[0]), total: "" };
  return null;
}

// Multi-card listings (playsets, lots, bundles) carry a SET price, not a per-card
// price — matching them to a single card would record a wildly wrong number. Stores
// like Cherry Collectables list "PLAYSET (3) 3x Watchful Sentry - 096/298". Mirror
// the bundle/lot guard the eBay matcher uses (EXCLUDE in src/lib/ebay.ts), scoped to
// the multi-quantity signals that actually appear in store titles.
export const MULTI_CARD =
  /\b(playset|lot|lots|bundle|joblot|job lot|x\s*\d+|\d+\s*x|set of|complete set|full set|bulk)\b/i;

// A promo printing shares the base card's collector number, so a listing is only a
// promo when its title says so. These markers route a listing to the promo card and
// keep it out of the base card's price.
export const PROMO_HINT = /\bpromo\b|promotional|pre-?release|gg\s*ez|organi[sz]ed\s*play|nexus\s*night|judge\s*promo/i;
const PROMO_WORDS = /\b(promo|promotional|pre-?release|gg\s*ez|organi[sz]ed\s*play|nexus\s*night|judge)\b/gi;

// Many TCG stores list a card with condition variants (Near Mint, Lightly Played,
// …). Picking the absolute cheapest variant records a played/damaged copy's price,
// which is LOWER than the Near-Mint price shoppers see on the product page (a card
// showed $33 when the store's NM price was $45). Rank by condition so we record the
// best available condition — matching the headline price on the listing.
function conditionRank(variantTitle: string): number {
  const t = (variantTitle || "").toLowerCase();
  if (/near\s*mint|\bnm\b|mint/.test(t)) return 0;
  if (/light(ly)?\s*play|\blp\b/.test(t)) return 1;
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return 2;
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return 3;
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return 4;
  return 0; // no condition in the title (e.g. "Default Title") → treat as standard/NM
}

// Realistic browser User-Agent + a From: contact header — see scrape-http.ts for
// why this isn't an identifying bot UA (some stores, e.g. Mint Collectables, serve
// a stale/cached price to obvious bot UAs but the fresh price to browsers).

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Collection handles that are clearly NOT singles (sealed, accessories, etc.).
const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

// Auto-discover a store's Riftbound singles collections from its Shopify sitemap,
// so we only need the store's domain (handles vary wildly between stores). This is
// how an aggregator like Google captures every store without hard-coding URLs.
async function discoverRiftboundCollections(base: string): Promise<string[]> {
  const allowed = await robotsAllows(base);
  if (!allowed("/sitemap.xml")) return [];
  const handles = new Set<string>();
  const index = await fetchText(`${base}/sitemap.xml`);
  let sitemaps = index
    ? Array.from(index.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];

  for (const [i, sm] of sitemaps.slice(0, 8).entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      // Require "riftbound" (not just "rift" — avoids Pokémon "Paradox Rift"),
      // and skip sealed/accessory collections and image URLs.
      if (/riftbound/i.test(h) && !NON_SINGLE.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) {
        handles.add(h);
      }
    }
  }
  return Array.from(handles);
}

async function fetchCollection(store: RetailerInfo, handle: string): Promise<ShopifyProduct[]> {
  const cc = store.country ?? "AU";
  const path = `/collections/${handle}/products.json`;
  const allowed = await robotsAllows(store.base);
  if (!allowed(path)) {
    console.warn(`${store.name}: robots.txt disallows ${path} — skipping.`);
    return [];
  }
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    // country=XX is CRITICAL: Shopify Markets serves a different price per visitor
    // country, and our (US) server was getting US/default prices — e.g. $33 when the
    // real AU price is $45. Forcing the store's market gives the local shopper price
    // (AUD for AU stores, NZD for NZ stores).
    const url = `${store.base}/collections/${handle}/products.json?limit=250&page=${page}&country=${isoCountry(cc)}&_=${Date.now()}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { ...UA, "Cache-Control": "no-cache", Pragma: "no-cache" }, cache: "no-store" });
    } catch {
      break;
    }
    if (isRateLimited(res)) {
      console.warn(`${store.name}: rate-limited (429, e.g. Cloudflare 1015) on page ${page} — backing off, not retrying this run.`);
      break;
    }
    if (!res.ok) break;
    // A store can return HTTP 200 with an HTML body — a moved/renamed collection,
    // a WAF/challenge page, a maintenance page — none of which raise on `res.ok`.
    // res.json() throws SyntaxError in that case ("Unexpected token '<'"), and left
    // uncaught that crashed the ENTIRE import run (every store queued after this one
    // silently never ran), not just this one store's page. Treat a parse failure the
    // same as a non-ok response: stop paginating this store, keep whatever was
    // already collected, and let every other store still run.
    let data: { products: ShopifyProduct[] };
    try {
      data = (await res.json()) as { products: ShopifyProduct[] };
    } catch {
      console.warn(`${store.name}: non-JSON response on page ${page} (likely an HTML error/challenge page) — skipping rest of this store.`);
      break;
    }
    if (!data.products?.length) break;
    all.push(...data.products);
    if (data.products.length < 250) break;
  }
  return all;
}

// Best-condition (then cheapest) price among a product's variants. NOTE: the
// individual /products/<handle>.json endpoint does NOT reliably report `available`
// (it's often null there), so this only derives the PRICE — availability is taken
// from the collection feed, which does report it correctly.
function bestVariantPrice(variants: ShopifyVariant[]): { priceCents: number } | null {
  const priced = variants.filter((v) => parseFloat(v.price) > 0);
  if (!priced.length) return null;
  const best = priced.reduce((a, b) => {
    const ra = conditionRank(a.title);
    const rb = conditionRank(b.title);
    if (ra !== rb) return ra < rb ? a : b;
    return parseFloat(a.price) <= parseFloat(b.price) ? a : b;
  });
  return { priceCents: Math.round(parseFloat(best.price) * 100) };
}

// Re-verify each card's CHEAPEST in-stock store listing against its authoritative
// product.json. The collection products.json feed we scrape can lag the live
// product page (a card showed $33 when the product page was $45), so we confirm the
// one price we actually display per card. Updates the row if it has drifted.
async function verifyCheapestListings(onlyCountry?: string): Promise<number> {
  const rows = await prisma.retailerPrice.findMany({
    where: { inStock: true, NOT: { retailer: { startsWith: "ebay" } }, ...(onlyCountry ? { country: onlyCountry } : {}) },
    select: { id: true, cardId: true, priceCents: true, url: true, country: true },
    orderBy: { priceCents: "asc" },
  });
  // Cheapest in-stock listing per card PER MARKET (AU and NZ are verified separately).
  const cheapest = new Map<string, { id: string; priceCents: number; url: string; country: string }>();
  for (const r of rows) {
    const k = `${r.cardId}|${r.country}`;
    if (!cheapest.has(k)) cheapest.set(k, r);
  }
  const targets = Array.from(cheapest.values());

  // Fetch a product's authoritative price. Uses the CLEAN product.json URL (no
  // cache-bust query param — that returned a stale/blocked response from the runner;
  // the plain URL returns the live price) with a browser UA, and one retry.
  async function fetchProductPrice(url: string, country: string): Promise<{ priceCents: number } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${url}.json?country=${isoCountry(country as Country)}`, {
          headers: { ...UA, "Cache-Control": "no-cache", Pragma: "no-cache" },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { product?: { variants?: ShopifyVariant[] } };
        const variants = data.product?.variants;
        if (!variants?.length) return null;
        return bestVariantPrice(variants);
      } catch {
        /* retry */
      }
    }
    return null;
  }

  let corrected = 0;
  const BATCH = 6;
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map(async (t) => {
        try {
          const v = await fetchProductPrice(t.url, t.country);
          if (!v) return;
          // Only correct the PRICE — never flip availability from this endpoint
          // (its `available` is unreliable). Guard against absurd values too.
          if (v.priceCents !== t.priceCents && v.priceCents > 0) {
            await prisma.retailerPrice.update({
              where: { id: t.id },
              data: { priceCents: v.priceCents },
            });
            corrected++;
          }
        } catch {
          /* leave the feed price as-is on any failure */
        }
      })
    );
  }
  return corrected;
}

// Refresh eBay prices for the AU (AUD) and US (USD) markets. Returns the total rows
// written. Each market is buffered then atomically replaced, scoped by country, so a
// rate-limited (0-result) market keeps its existing rows and never wipes the other.
// Promos are matched by promo-wording in the listing title (they share base numbers).
/**
 * Put the priority sets at the front of the eBay queue, popularity order intact.
 *
 * The quota cannot cover every market × every card every day, so whatever sits at
 * the tail of this list is what silently goes unpriced. Callers hand cards over
 * already sorted by search demand — but a set that launched last week has no
 * demand recorded yet (zero searches, zero views, no price), so its cards sort
 * dead last precisely while their prices are the ones people are looking for.
 *
 * A STABLE partition, not a re-sort: within each group the caller's popularity
 * order is preserved exactly, so this promotes the new set without flattening
 * "most-wanted first" inside it. Everything still gets queried on a day with
 * budget to spare; this only decides who gets cut when there isn't.
 *
 * Exported for tests — the ordering is the whole behaviour, and it is invisible
 * in a passing import run.
 */
export function orderCardsForEbay<T extends { setCode: string }>(
  cards: T[],
  prioritySetCodes: readonly string[] = pricePrioritySetCodes(),
): T[] {
  if (!prioritySetCodes.length) return cards;
  const priority = new Set(prioritySetCodes.map((c) => c.toUpperCase()));
  const first: T[] = [];
  const rest: T[] = [];
  for (const c of cards) (priority.has((c.setCode ?? "").toUpperCase()) ? first : rest).push(c);
  return [...first, ...rest];
}

// ── Which cards are worth an eBay call ───────────────────────────────────────
// Base-rarity Commons and Uncommons are skipped in EVERY market. They are ~45%
// of the catalogue and the least likely single to be bought through an
// affiliate link: a $0.30 common is stocked by nearly every tracked store, so
// eBay rarely wins the price, and nobody clicks out to a marketplace for one.
// At 3 markets a day that is the largest block of Browse quota we spend on the
// lowest-value half of the catalogue.
//
// They do NOT lose their eBay path. Both the card page and the QuickView show
// the "no live eBay price — search eBay" panel whenever a market has no eBay
// row for a card (`!hasEbay`), which is now always true for these, so every one
// of them keeps an affiliate-tagged search link. The listing data goes away;
// the buy path does not.
//
// EFFECTIVE rarity, not the stored column — this is the trap. A Signature or
// overnumbered print of a Common is stored as "Common" (import-vendetta stores
// the rarity of the card it re-prints; only alt-arts were ever reclassified —
// see chasePrintRarity's note). Filtering the raw column would therefore skip
// exactly the chase prints most worth searching. chasePrintRarity resolves
// those to Showcase, so they are kept.
const EBAY_SKIP_RARITIES = new Set(["Common", "Uncommon"]);

/**
 * Value floor, in TCGplayer US market cents. A card below this is not worth a
 * Browse call: nobody clicks out to a marketplace for a $3 single, and eBay
 * almost never beats a tracked store on one.
 *
 * TCGplayer's US market price is the reference on purpose — it is the one
 * figure that exists for the same card in the same currency across the whole
 * catalogue, so the threshold means the same thing for every card. A local
 * cheapest price would make the floor mean different things in different
 * markets, and a card would drift in and out of the search set as exchange
 * rates moved.
 */
export const EBAY_MIN_VALUE_USD_CENTS = Number(process.env.EBAY_MIN_VALUE_CENTS ?? 2000);

export function eBayWorthSearching(
  c: {
    rarity: string;
    collectorNumber: string;
    variant?: string | null;
    isPromo?: boolean;
  },
  // TCGplayer US market price in USD cents. `null`/undefined means we have no
  // TCGplayer row for this card.
  tcgUsCents?: number | null,
): boolean {
  // UNKNOWN VALUE IS NOT LOW VALUE. A card with no TCGplayer price is kept, and
  // this is the most important line in the function: the cards that lack one are
  // overwhelmingly the ones that JUST released. A brand-new set's chase cards
  // have no market price on day one — which is exactly when their eBay price is
  // most wanted, and exactly what pricePrioritySetCodes() exists to prioritise.
  // Treating "no price" as "cheap" would blank the launch window every time.
  if (tcgUsCents != null && tcgUsCents < EBAY_MIN_VALUE_USD_CENTS) return false;

  // Promos are never skipped on RARITY grounds, whatever the base card's is.
  //
  // chasePrintRarity deliberately leaves a promo on its base rarity — that is
  // the /browse filter convention and not this code's business to change — so a
  // promo of a Common resolves to "Common" and would be skipped by the rule
  // below. For eBay that is the wrong call: a promo is a separate, limited
  // printing that collectors buy as such, and its price is unrelated to the bulk
  // common it re-prints. Handled here rather than by altering chasePrintRarity
  // so the browse-filter convention stays untouched.
  //
  // The value floor above still applies to promos: a promo genuinely worth $2 is
  // no more worth a call than any other $2 card.
  if (c.isPromo) return true;
  return !EBAY_SKIP_RARITIES.has(chasePrintRarity(c));
}

/** TCGplayer US market price per card, in USD cents — the value-floor reference. */
export async function tcgplayerUsValues(): Promise<Map<string, number>> {
  const rows = await prisma.retailerPrice.findMany({
    where: { retailer: "tcgplayer", country: "US" },
    select: { cardId: true, priceCents: true },
  });
  const out = new Map<string, number>();
  // A card can have several TCGplayer rows (foil/condition variants); the
  // cheapest is the right reference, so a card is only skipped when even its
  // cheapest printing is under the floor.
  for (const r of rows) {
    const cur = out.get(r.cardId);
    if (cur == null || r.priceCents < cur) out.set(r.cardId, r.priceCents);
  }
  return out;
}

/**
 * The printings refreshed TWICE a day rather than once: promos, Signature
 * prints and overnumbered prints.
 *
 * These are the cards whose prices actually move within a day. They are thin —
 * often one or two live listings in a market — so a single sale changes the
 * cheapest price outright, where a Rare with fifteen listings barely moves. They
 * are also the most expensive things we track, so a stale figure on one is the
 * most costly kind of wrong.
 *
 * Alt-art/Showcase prints are NOT included. They are chase-adjacent but far more
 * numerous, and adding them would roughly double the pass for a much weaker
 * freshness argument. One flag away if that changes.
 */
export function isTwiceDailyPrinting(c: {
  collectorNumber: string;
  isPromo?: boolean;
}): boolean {
  return Boolean(c.isPromo) || isSignature(c.collectorNumber) || isOvernumbered(c.collectorNumber);
}

/** How many slabs we keep per card per market — best grades first. */
const GRADED_PER_CARD = 6;

/**
 * Turn captured graded listings into rows.
 *
 * Ordered by GRADE first and price second, not price alone: a PSA 10 at $400
 * and a PSA 8 at $120 are not two prices for one thing, they are different
 * products, and a buyer looking at slabs is choosing a grade before a price.
 * Ungraded-but-slabbed listings (a title saying "PSA" with no number) sort last
 * — they are the least useful and we refuse to guess their grade.
 *
 * Deduped on itemId because the strict and broad queries can both return the
 * same listing, and the table is uniquely keyed on it.
 */
function gradedRowsFor(
  found: EbayResult[],
  cardId: string,
  country: string,
  currency: string,
): Prisma.EbayGradedListingCreateManyInput[] {
  const seen = new Set<string>();
  return found
    .filter((l) => l.itemId && !seen.has(l.itemId) && seen.add(l.itemId))
    .map((l) => ({ l, g: parseGrade(l.title) }))
    .sort((a, b) => (b.g.grade ?? -1) - (a.g.grade ?? -1) || a.l.priceCents - b.l.priceCents)
    .slice(0, GRADED_PER_CARD)
    .map(({ l, g }) => ({
      cardId,
      country,
      itemId: l.itemId as string,
      priceCents: l.priceCents,
      shippingCents: l.shippingCents,
      currency,
      url: l.url,
      title: l.title,
      imageUrl: l.imageUrl ?? null,
      grader: g.grader,
      grade: g.grade,
    }));
}

export interface EbayMarketCfg { country: string; marketplace: string; currency: string; retailer: string }

/**
 * Searched on EVERY run.
 *
 * ── WHY UK AND SG CAME BACK (2026-08-08) ────────────────────────────────────
 * They were demoted to a rotation on 2026-08-03 for one reason: 4 markets ×
 * ~1,400 cards = 5,600 Browse calls did not fit a ~4,280 budget, and a run that
 * overspent had its last market discarded whole. The fix then was to search
 * fewer markets.
 *
 * The $20 value floor (see eBayWorthSearching) removed the cause instead: the
 * searched catalogue is now ~240 cards, not ~1,400, so 4 × ~240 ≈ 960 calls —
 * roughly a fifth of what forced the demotion. UK and SG no longer have to take
 * turns, and neither is ever ~48h stale again.
 *
 * THIS LIST IS LOAD-BEARING IN THREE PLACES, not one. The catalogue pass builds
 * from ebayMarketsForDay, but refreshEbayChasePrintings and refreshEbayAuctions
 * are handed EBAY_ALWAYS_MARKETS directly — and the auction pass runs TWICE a
 * day (once per pass). Adding a market here multiplies all three, so a fifth
 * market costs far more than one catalogue sweep. tests/affiliate-priority.test.ts
 * models the whole day rather than the catalogue alone, for exactly that reason.
 */
export const EBAY_ALWAYS_MARKETS: EbayMarketCfg[] = [
  { country: "AU", marketplace: "EBAY_AU", currency: "AUD", retailer: "ebay" },
  { country: "US", marketplace: "EBAY_US", currency: "USD", retailer: "ebay_us" },
  { country: "UK", marketplace: "EBAY_GB", currency: "GBP", retailer: "ebay_uk" },
  { country: "SG", marketplace: "EBAY_SG", currency: "SGD", retailer: "ebay_sg" },
];

/**
 * Rotated one per day, in this order — EMPTY, because every market we search is
 * now a daily one. Kept rather than deleted: the rotation is the release valve
 * if the searched catalogue grows back (a large set launches with no TCGplayer
 * prices, and "unknown ≠ cheap" keeps all of them), and re-adding a market here
 * needs no other change. ebayMarketsForDay handles the empty case explicitly.
 */
export const EBAY_ROTATING_MARKETS: EbayMarketCfg[] = [];

/**
 * The markets a run on `dayIndex` will search, IN THE ORDER IT WILL SEARCH THEM.
 * Pure, so the budget is testable.
 *
 * ── WHY THE ALWAYS-MARKETS ALTERNATE (2026-08-05) ───────────────────────────
 * Order is not cosmetic. refreshEbayMarkets walks this array and `break`s the
 * moment the Browse budget latches, and a market cut off partway has its ENTIRE
 * pass discarded rather than written as a partial (see the truncation guard at
 * the write site — a partial set would shrink coverage). So whichever market is
 * last in the array is the one that loses everything when a run overspends.
 *
 * With a fixed [AU, US] order that made starvation systematic rather than
 * shared: AU had first claim on quota every single day and was never once
 * dropped, while US — the default market and the larger share of traffic — took
 * the loss every time, silently, along with CA (derived from the US pass). That
 * is a plausible contributor to US eBay coverage looking thin in reporting.
 *
 * Rotating by day makes the loser different each day instead of always the same
 * market. It does not create quota; it stops one market monopolising it.
 *
 * ── WHY A ROTATION AND NOT A REVERSE (2026-08-08) ───────────────────────────
 * This used to alternate with `reverse()` on odd days, which was sufficient for
 * exactly two always-markets. With four it would produce only two orderings —
 * [AU,US,UK,SG] and [SG,UK,US,AU] — so US and UK could NEVER lead, and the
 * starvation this function exists to prevent would simply move to a new pair.
 * Rotating by dayIndex gives every market the lead, and the last (first to be
 * dropped) slot, once every n days.
 */
export function ebayMarketsForDay(dayIndex: number): EbayMarketCfg[] {
  const n = EBAY_ALWAYS_MARKETS.length;
  // `% n` twice with an added n: dayIndex is derived from a clock and is always
  // positive today, but a negative index would otherwise produce a negative
  // slice offset and silently return a SHORTER market list — a dropped market,
  // not an error.
  const offset = n === 0 ? 0 : ((dayIndex % n) + n) % n;
  const always = [...EBAY_ALWAYS_MARKETS.slice(offset), ...EBAY_ALWAYS_MARKETS.slice(0, offset)];
  // No rotating markets today. Indexing an empty array here would yield
  // `undefined` and append it, and the pass would crash on `mkt.marketplace`
  // rather than simply searching the always-markets.
  if (EBAY_ROTATING_MARKETS.length === 0) return always;
  return [...always, EBAY_ROTATING_MARKETS[dayIndex % EBAY_ROTATING_MARKETS.length]];
}

/** eBay CA rows are derived from the US pass — see the note at the write site. */
export const EBAY_CA_RETAILER = "ebay_ca";

// ── Chase-tier auctions ──────────────────────────────────────────────────────
// Auctions are searched for a SMALL, high-value subset, never the whole
// catalogue. Three reasons, in order of importance:
//
//  1. Quota. The singles pass runs 4 markets against a shared daily budget, and
//     this pass runs TWICE a day (once per singles pass) across all four — so a
//     card added here costs 8 calls/day, not one. A per-card auction call across
//     the whole catalogue would not fit, and the market that lost would be a
//     real coverage gap rather than a missing widget.
//  2. Inventory. Nobody auctions a common. Auctions exist for the tier where
//     price discovery actually happens.
//  3. Value. A bid on a $2 card tells a reader nothing. A bid at 51% of the
//     cheapest Buy It Now on a $180 Signature, closing in five hours, is the
//     whole point of the feature.
//
// The tier is defined the same way the site already defines "chase" for display
// (see getChaseCards): signature prints first, then by value.
//
// ── WHY 120 (2026-08-08) ────────────────────────────────────────────────────
// Doubled from 60 once the value floor freed the budget. The ceiling that
// matters is not quota but INVENTORY: the eligible pool is cards at or above
// AUCTION_MIN_VALUE_CENTS in that market's own currency, measured on 2026-08-08
// as AU 200 / US 204 / UK 156 / SG 174. Past roughly 150 the extra calls query a
// tier that has no more cards in it, so they buy nothing.
//
// Held at 120 rather than pushed to the pool size because of a cross-pass
// interaction that is easy to miss: the quota is DAILY, not per-run, so the
// auction pass that runs after the 07:00 import is spending the same allowance
// the 19:00 chase pass needs. "Auctions run last and yield" is true within a
// run — it does not protect the evening pass from the morning's auctions. At 120
// a day models to ~79% of the spendable budget, leaving real room for a set
// launch, when every unpriced new card is kept by design (unknown ≠ cheap) and
// the searched catalogue roughly doubles.
export const AUCTION_CARDS_PER_MARKET = Number(process.env.EBAY_AUCTION_CARDS ?? 120);
/** Auctions on cards below this (in the market's own cents) aren't worth a call. */
export const AUCTION_MIN_VALUE_CENTS = Number(process.env.EBAY_AUCTION_MIN_CENTS ?? 2000);
/** Live auctions kept per card per market. */
const AUCTIONS_PER_CARD = 3;

export async function refreshEbayMarkets(
  cards: { id: string; name: string; setCode: string; collectorNumber: string; isPromo: boolean }[]
): Promise<number> {
  // Applied HERE rather than in the callers' `orderBy` so no caller can forget
  // it: both the scheduled importer and scripts/refresh-ebay.ts go through this
  // function, and a third one would too.
  const priorityCodes = pricePrioritySetCodes();
  cards = orderCardsForEbay(cards, priorityCodes);
  if (priorityCodes.length) {
    const n = cards.filter((c) => priorityCodes.includes(c.setCode)).length;
    console.log(
      `eBay queue: ${n} ${priorityCodes.join("/")} card(s) at the front of ${cards.length} ` +
        `(launch-window priority, expires ${PRICE_PRIORITY_WINDOW_DAYS}d after release); ` +
        `popularity order preserved within each group.`,
    );
  } else {
    console.log(`eBay queue: ${cards.length} cards in popularity order (no set in its launch window).`);
  }
  // Each market has its own retailer key so eBay AU + US rows for the same card never
  // collide on the unique [cardId, retailer, condition, isFoil] key.
  //
  // ── QUOTA BUDGET: WHY SG AND CA ALTERNATE BY DAY ────────────────────────────
  // Every market costs ~1 Browse call per card (~1.1k cards), and the real spendable
  // budget is `liveRemaining − QUOTA_RESERVE` ≈ 4,400 on a clean day. Six markets
  // would need ~6.6k and five ~5.5k, so a single pass covering every market EVERY
  // day is arithmetically impossible — it would always run out partway and leave the
  // trailing market(s) unrefreshed. Rather than let that happen implicitly (which
  // silently starves whichever market sorts last), the two newest/smallest markets
  // take turns: AU/US/UK refresh daily, and SG and CA get every other day. That
  // fits ~4×1.1k ≈ 4.4k inside the budget, and each rotating market is at most ~24h
  // staler than the others — far better than one of them being permanently skipped.
  const ALWAYS = EBAY_ALWAYS_MARKETS;
  // Empty today — every market we search is a daily one. See the note on
  // EBAY_ROTATING_MARKETS for why UK and SG left the rotation on 2026-08-08 and
  // why the mechanism is kept rather than deleted.
  const ROTATING = EBAY_ROTATING_MARKETS;
  const ALL = [...ALWAYS, ...ROTATING];

  // EBAY_ONLY_MARKET=SG restricts the pass to one marketplace (~1k calls) — used
  // for new-market rollouts, or to refresh a rotating market off-cycle. It bypasses
  // the rotation entirely, so `EBAY_ONLY_MARKET=CA` works on an SG day.
  const onlyMarket = (process.env.EBAY_ONLY_MARKET || "").toUpperCase();
  let markets: typeof ALL;
  if (onlyMarket) {
    markets = ALL.filter((m) => m.country === onlyMarket);
    console.log(`EBAY_ONLY_MARKET=${onlyMarket} — restricting the eBay pass to ${markets.length} market(s).`);
  } else {
    // Keyed off the Australia/Sydney calendar day (the same day boundary the price
    // history uses), so which market is "today's" is STABLE for the whole day: the
    // 07:00 and 19:00 UTC runs, a deploy-triggered run and a manual re-run all pick
    // the same one instead of ping-ponging and double-spending quota.
    const dayIndex = Math.floor(sydneyDay().getTime() / 86_400_000);
    // Built by ebayMarketsForDay rather than assembled here. This line used to
    // be its own copy of the same expression, which meant the pure function the
    // budget tests assert against was NOT the one production ran — the two could
    // drift silently, and the ordering fix below would have landed only in the
    // tested copy. One source of truth for both.
    markets = ebayMarketsForDay(dayIndex);
    console.log(
      `eBay market rotation: ${markets.map((m) => m.country).join(" → ")} ` +
        `(search order; the LAST market is the one dropped if the budget runs out. ` +
        `${ALWAYS.map((m) => m.country).join("/")} daily, priority rotating by Sydney day` +
        // Empty today: every market is daily. Without this the line printed a
        // dangling ", alternate by Sydney day" with nothing named in front of it.
        (ROTATING.length ? `; ${ROTATING.map((m) => m.country).join("/")} alternate by Sydney day` : "") +
        `; use EBAY_ONLY_MARKET=<code> to refresh one off-cycle).`
    );
  }
  // Check the live quota and set a spend budget (leaves a reserve) so this can never
  // exhaust eBay's 5,000/day limit, however many times the importer runs.
  await primeEbayBudget();
  let written = 0;
  // Cards the pass actually queried (before the budget/quota cut it off). Used to
  // tell "no eBay listing because none exist" apart from "we never got to check".
  const checkedIds = new Set<string>();
  for (const mkt of markets) {
    if (isEbayRateLimited()) break;
    console.log(`eBay ${mkt.country}: searching ${cards.length} cards…`);
    // Reference value per card = cheapest tracked STORE price in this market (eBay
    // excluded). Stores are imported before this pass, so it's current. Lets
    // searchEbayLowest drop mismatched listings priced far above the card's value.
    const storeLows = await prisma.retailerPrice
      .groupBy({ by: ["cardId"], where: { country: mkt.country, inStock: true, NOT: { retailer: { startsWith: "ebay" } } }, _min: { priceCents: true } })
      .catch(() => [] as { cardId: string; _min: { priceCents: number | null } }[]);
    const refByCard = new Map<string, number>();
    for (const s of storeLows) if (s._min.priceCents != null) refByCard.set(s.cardId, s._min.priceCents);

    const rows: Prisma.RetailerPriceCreateManyInput[] = [];
    // "eBay Ad" carousel rows for the card page — captured for free from the same
    // Browse API call above (see searchEbayLowest's captureAdListings param).
    const adRows: Prisma.EbayAdListingCreateManyInput[] = [];
    // Graded (slabbed) listings, captured free from the same calls — the Browse
    // response always contained them, the price path just discarded them.
    const gradedRows: Prisma.EbayGradedListingCreateManyInput[] = [];
    // Cards THIS market queried. Deliberately separate from the run-wide
    // `checkedIds`, which accumulates across markets — clearing this market's
    // carousel must only ever touch cards this market actually reached.
    const queriedThisMarket = new Set<string>();
    for (const c of cards) {
      if (isEbayRateLimited()) break;
      checkedIds.add(c.id); // we have budget and are about to query this card
      queriedThisMarket.add(c.id);
      const [rawNum, total] = c.collectorNumber.split("/");
      const captured: EbayResult[] = [];
      const gradedFound: EbayResult[] = [];
      const r = await searchEbayLowest(
        {
          name: c.name,
          setCode: c.setCode,
          number: rawNum.replace(/\*/g, ""),
          total: total ?? "",
          isSignature: c.collectorNumber.includes("*"),
          isPromo: c.isPromo,
          marketplace: mkt.marketplace,
          referenceCents: refByCard.get(c.id),
        },
        captured,
        undefined,
        gradedFound
      );
      gradedRows.push(...gradedRowsFor(gradedFound, c.id, mkt.country, mkt.currency));
      captured.forEach((l, i) => {
        adRows.push({
          cardId: c.id,
          country: mkt.country,
          rank: i,
          priceCents: l.priceCents,
          shippingCents: l.shippingCents,
          currency: mkt.currency,
          url: l.url,
          title: l.title,
          imageUrl: l.imageUrl ?? null,
        });
      });
      // The budget can run out INSIDE the call (its own spend() check), meaning this
      // card was never actually queried — don't leave it stamped as checked.
      if (!r && isEbayRateLimited()) { checkedIds.delete(c.id); queriedThisMarket.delete(c.id); break; }
      if (!r) continue;
      rows.push({
        cardId: c.id,
        retailer: mkt.retailer,
        retailerName: "eBay",
        title: r.title,
        url: r.url,
        condition: r.condition ?? null,
        isFoil: /foil/i.test(r.title),
        priceCents: r.priceCents,
        shippingCents: r.shippingCents,
        currency: mkt.currency,
        country: mkt.country,
        inStock: true,
      });
    }
    // A market is only safe to REPLACE wholesale if the pass actually covered every
    // card. If the Browse budget ran out partway through (isEbayRateLimited), `rows`
    // holds a PARTIAL result — and the old code's `rows.length > 0` check happily
    // deleted every existing row for this retailer and wrote the partial set back,
    // silently shrinking that market's eBay coverage with no error and no warning.
    // (This became reachable once the pass grew past 4 markets: 5 markets × ~1.1k
    // cards ≈ 5.5k calls against a real budget of 5000 − QUOTA_RESERVE.) A partial
    // refresh is worth less than a complete stale one, so treat truncation exactly
    // like the 0-results case: keep what's there and say so loudly.
    const truncated = isEbayRateLimited();
    if (rows.length > 0 && !truncated) {
      await prisma.retailerPrice.deleteMany({ where: { retailer: mkt.retailer } });
      await prisma.retailerPrice.createMany({ data: rows });
      written += rows.length;
    } else if (truncated) {
      console.warn(
        `eBay ${mkt.country}: budget ran out after ${rows.length} of ${cards.length} cards — ` +
          `NOT replacing rows (a partial set would shrink coverage). Keeping existing rows. ` +
          `Run this market on its own with EBAY_ONLY_MARKET=${mkt.country} to refresh it fully.`
      );
    } else {
      console.warn(`eBay ${mkt.country}: 0 results (rate-limited?) — keeping existing rows.`);
    }
    // Replace the carousel for every card this market actually QUERIED — not
    // just the ones that came back with listings.
    //
    // THE BUG THIS FIXES: the delete list used to be derived from `adRows`, i.e.
    // only cards that produced listings on this run. A card we queried and got
    // NOTHING for was therefore never cleared, so its carousel kept yesterday's
    // listings — forever, since every later run also produced no adRows for it
    // and so never cleared it either. Meanwhile the PRICE rows for that card
    // were correctly dropped (they are replaced wholesale per retailer). The
    // result is the state a user reported: a card page showing "no in-stock
    // listings" and "no live eBay price" directly above an eBay carousel headed
    // "LIVE LISTINGS ON EBAY" — with affiliate links to listings that may have
    // sold weeks ago. Stale is worse than empty here, because the carousel
    // claims to be live.
    //
    // Scoped to cards queried IN THIS MARKET (not the run-wide `checkedIds`), so
    // a budget that runs out partway through still cannot wipe the carousel for
    // cards this market never reached.
    const queriedIds = [...queriedThisMarket];
    for (let i = 0; i < queriedIds.length; i += 1000) {
      await prisma.ebayAdListing.deleteMany({
        where: { country: mkt.country, cardId: { in: queriedIds.slice(i, i + 1000) } },
      });
    }
    if (adRows.length > 0) await prisma.ebayAdListing.createMany({ data: adRows });

    // Graded slabs, scoped to the same reached-cards set and for the same reason:
    // a budget that ran out partway must not clear the graded panel for cards
    // this market never looked at. skipDuplicates because the strict and broad
    // queries can surface one listing twice within a run.
    for (let i = 0; i < queriedIds.length; i += 1000) {
      await prisma.ebayGradedListing.deleteMany({
        where: { country: mkt.country, cardId: { in: queriedIds.slice(i, i + 1000) } },
      });
    }
    if (gradedRows.length > 0) {
      await prisma.ebayGradedListing.createMany({ data: gradedRows, skipDuplicates: true });
      console.log(`eBay graded ${mkt.country}: ${gradedRows.length} slabs across ${queriedIds.length} cards (0 extra Browse calls).`);
    }

    // ── CANADA IS DERIVED FROM THE US PASS, NOT SEARCHED ────────────────────
    // eBay CA used to be its own marketplace query — a full ~1,400 extra Browse
    // calls for the smallest market, on a budget that no longer covers even the
    // markets we search. It is also the most redundant: eBay US ships to Canada
    // as a matter of course (eBay International Shipping), so the listings a
    // Canadian buyer sees substantially ARE the US ones.
    //
    // So CA now reuses the US result set, converted to CAD, at zero quota cost.
    //
    // Two honesty constraints, both load-bearing:
    //   • shippingCents is NULLED. The figure eBay returned is US DOMESTIC
    //     postage; a Canadian buyer pays international postage instead. null
    //     means "unknown / at checkout" in the UI, which is true — carrying the
    //     US number over would understate the delivered cost and make these rows
    //     beat genuine Canadian listings they might well lose to.
    //   • retailerName says "eBay US", so the row is visibly a cross-border buy
    //     rather than a local one.
    // Unlike the converted TCGplayer references (see ALL_FALLBACK_RETAILERS),
    // this stays a REAL comparison row, because it is a real purchasable listing
    // — the price is genuine and the item genuinely ships to Canada. What is
    // unknown is the postage, and the UI already has a way to say that.
    if (mkt.country === "US" && rows.length > 0 && !truncated) {
      const caRows: Prisma.RetailerPriceCreateManyInput[] = rows.map((r) => ({
        ...r,
        retailer: EBAY_CA_RETAILER,
        retailerName: "eBay US",
        priceCents: Math.round((r.priceCents as number) * USD_TO.CAD),
        shippingCents: null,
        currency: "CAD",
        country: "CA",
      }));
      await prisma.retailerPrice.deleteMany({ where: { retailer: EBAY_CA_RETAILER } });
      await prisma.retailerPrice.createMany({ data: caRows });
      written += caRows.length;
      console.log(`eBay CA: ${caRows.length} rows derived from the US pass (0 extra Browse calls).`);
    }
  }
  // Sweep carousel rows for cards this pass no longer covers.
  //
  // The per-market delete above is scoped to the cards a market actually
  // QUERIED — deliberately, so a truncated run can't wipe the carousel for
  // cards it never reached. The side effect is that a card which LEAVES the
  // search set is never cleared by it again, because it is never queried again.
  // Dropping Common/Uncommon base prints (see eBayWorthSearching) moves ~45% of
  // the catalogue into exactly that state at once, so without this they would
  // keep serving their last captured listings indefinitely.
  //
  // Expressed as an age sweep rather than a NOT IN over the skipped ids: it is a
  // small bounded delete instead of a ~600-id exclusion, and it self-heals any
  // other way a card can fall out of the set (renamed, deleted, de-prioritised).
  // 7 days is well clear of the rotating markets' ~48h cycle, so a market that
  // simply had a slow week is never swept.
  const staleAdCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const sweptAds = await prisma.ebayAdListing.deleteMany({ where: { updatedAt: { lt: staleAdCutoff } } });
  if (sweptAds.count > 0) console.log(`eBay carousel: swept ${sweptAds.count} rows not refreshed in 7 days.`);

  // Stamp every card the pass reached so the card page can distinguish a genuine
  // "no eBay listing" from a budget-skipped one. Done in chunks to avoid a giant IN.
  if (checkedIds.size > 0) {
    const ids = [...checkedIds];
    const now = new Date();
    for (let i = 0; i < ids.length; i += 1000) {
      await prisma.card.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { ebayCheckedAt: now } });
    }
  }
  console.log(`eBay singles: spent ${ebaySpentThisRun()} Browse calls this run (checked ${checkedIds.size} cards).`);
  return written;
}

/**
 * The SECOND daily refresh: promos, Signature prints and overnumbered prints
 * only (see isTwiceDailyPrinting).
 *
 * A separate function rather than a reuse of refreshEbayMarkets, and that is not
 * a style choice — it is the one thing that would have silently destroyed data.
 * refreshEbayMarkets replaces a market's rows WHOLESALE:
 *
 *     await prisma.retailerPrice.deleteMany({ where: { retailer: mkt.retailer } });
 *     await prisma.retailerPrice.createMany({ data: rows });
 *
 * Handing it a 150-card subset would therefore delete every eBay row in that
 * market and write back only the subset — silently dropping ~600 cards' prices
 * twice a day, with no error and no warning. This pass scopes its delete to the
 * cardIds it actually refreshed, exactly as the ad-carousel and auction writes
 * already do.
 *
 * Returns the number of price rows written.
 */
export async function refreshEbayChasePrintings(markets: EbayMarketCfg[]): Promise<number> {
  if (!isEbayEnabled() || isEbayRateLimited()) return 0;

  const all = await prisma.card.findMany({
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    select: {
      id: true, name: true, setCode: true, collectorNumber: true, isPromo: true,
      rarity: true, variant: true,
    },
  });
  // Both filters: a printing must be twice-daily-worthy AND still pass the
  // catalogue rule. They agree today (promos are force-kept and signature /
  // overnumbered resolve to Showcase), but stacking them means a later change to
  // either cannot quietly reintroduce a card the other excludes.
  const tcgValues = await tcgplayerUsValues();
  const cards = all
    .filter(isTwiceDailyPrinting)
    .filter((c) => eBayWorthSearching(c, tcgValues.get(c.id)));
  if (cards.length === 0) return 0;
  console.log(
    `eBay chase set: ${cards.length} promo/signature/overnumbered printings ` +
      `at or above $${(EBAY_MIN_VALUE_USD_CENTS / 100).toFixed(0)} TCGplayer US ` +
      `(of ${all.filter(isTwiceDailyPrinting).length} such printings in total).`,
  );

  let written = 0;
  for (const mkt of markets) {
    if (isEbayRateLimited()) break;
    const storeLows = await prisma.retailerPrice
      .groupBy({
        by: ["cardId"],
        where: { country: mkt.country, inStock: true, NOT: { retailer: { startsWith: "ebay" } } },
        _min: { priceCents: true },
      })
      .catch(() => [] as { cardId: string; _min: { priceCents: number | null } }[]);
    const refByCard = new Map<string, number>();
    for (const s of storeLows) if (s._min.priceCents != null) refByCard.set(s.cardId, s._min.priceCents);

    const rows: Prisma.RetailerPriceCreateManyInput[] = [];
    const adRows: Prisma.EbayAdListingCreateManyInput[] = [];
    const gradedRows: Prisma.EbayGradedListingCreateManyInput[] = [];
    const reached = new Set<string>();

    for (const c of cards) {
      if (isEbayRateLimited()) break;
      reached.add(c.id);
      const [rawNum, total] = c.collectorNumber.split("/");
      const captured: EbayResult[] = [];
      const gradedFound: EbayResult[] = [];
      const status = { ok: true };
      const r = await searchEbayLowest(
        {
          name: c.name,
          setCode: c.setCode,
          number: rawNum.replace(/\*/g, ""),
          total: total ?? "",
          isSignature: c.collectorNumber.includes("*"),
          isPromo: c.isPromo,
          marketplace: mkt.marketplace,
          referenceCents: refByCard.get(c.id),
        },
        captured,
        undefined,
        gradedFound,
        status,
      );
      // A card whose search never COMPLETED must leave `reached`, because
      // `reached` is the delete scope below. searchEbayLowest returns null for
      // both "no listing exists" and "the call failed", and treating a transient
      // 5xx as the former deletes a live price — twice a day, on the most
      // valuable cards on the site. Only a completed search may clear a row.
      if (!status.ok) {
        reached.delete(c.id);
        if (isEbayRateLimited()) break; // budget gone — stop, keep what's stored
        continue; // transient failure on one card — try the rest
      }
      gradedRows.push(...gradedRowsFor(gradedFound, c.id, mkt.country, mkt.currency));
      captured.forEach((l, i) => {
        adRows.push({
          cardId: c.id, country: mkt.country, rank: i,
          priceCents: l.priceCents, shippingCents: l.shippingCents, currency: mkt.currency,
          url: l.url, title: l.title, imageUrl: l.imageUrl ?? null,
        });
      });
      if (!r) continue; // searched successfully, genuinely no listing — row clears
      rows.push({
        cardId: c.id,
        retailer: mkt.retailer,
        retailerName: "eBay",
        title: r.title,
        url: r.url,
        condition: r.condition ?? null,
        isFoil: /foil/i.test(r.title),
        priceCents: r.priceCents,
        shippingCents: r.shippingCents,
        currency: mkt.currency,
        country: mkt.country,
        inStock: true,
      });
    }

    const reachedIds = [...reached];
    if (reachedIds.length === 0) continue;

    // SCOPED to the cards this pass refreshed. Every delete below carries the
    // cardId filter — that is the whole safety property of this function.
    for (let i = 0; i < reachedIds.length; i += 1000) {
      const slice = reachedIds.slice(i, i + 1000);
      await prisma.retailerPrice.deleteMany({ where: { retailer: mkt.retailer, cardId: { in: slice } } });
      await prisma.ebayAdListing.deleteMany({ where: { country: mkt.country, cardId: { in: slice } } });
      await prisma.ebayGradedListing.deleteMany({ where: { country: mkt.country, cardId: { in: slice } } });
    }
    if (rows.length > 0) {
      await prisma.retailerPrice.createMany({ data: rows });
      written += rows.length;
    }
    if (adRows.length > 0) await prisma.ebayAdListing.createMany({ data: adRows });
    if (gradedRows.length > 0) await prisma.ebayGradedListing.createMany({ data: gradedRows, skipDuplicates: true });
    console.log(
      `eBay chase ${mkt.country}: refreshed ${reachedIds.length} promo/signature/overnumbered printings ` +
        `(${rows.length} priced, ${gradedRows.length} slabs).`,
    );
  }
  return written;
}

/**
 * Live auctions on the chase tier, per market.
 *
 * Runs AFTER the singles pass on purpose. Both draw on the same Browse budget,
 * and if there is only enough quota for one of them it must be the price
 * comparison: a market missing its prices is a broken product, a market missing
 * its auction widget is a missing widget. `isEbayRateLimited()` is already
 * latched by then if singles used everything up, so this simply does nothing.
 *
 * Returns the number of auction rows written.
 */
export async function refreshEbayAuctions(markets: EbayMarketCfg[]): Promise<number> {
  if (!isEbayEnabled() || isEbayRateLimited()) return 0;
  let written = 0;
  // Read once, outside the market loop — the value floor is a USD figure and
  // does not vary by marketplace, so re-reading the whole RetailerPrice table
  // per market would buy nothing.
  const tcgValues = await tcgplayerUsValues();

  for (const mkt of markets) {
    if (isEbayRateLimited()) break;

    // The chase tier for THIS market: signature prints first (the site's own
    // definition of chase — see getChaseCards), then by local value. Cards with
    // no local price at all are excluded rather than ranked last: with no
    // reference price there is nothing to compare a bid against, which is the
    // only reason the auction is worth showing.
    const priceCol = priceField(mkt.country as Country);
    const cards = await prisma.card.findMany({
      where: {
        // The value floor doubles as the release filter: an unreleased set has
        // no priced cards in any market, so it cannot reach this threshold.
        [priceCol]: { gte: AUCTION_MIN_VALUE_CENTS },
      },
      orderBy: [
        { collectorNumber: "desc" }, // "*" sorts high — signature prints lead
        { [priceCol]: { sort: "desc", nulls: "last" } },
      ],
      // Over-fetch, because the rarity filter below runs in JS (effective rarity
      // isn't a column). Without headroom a run of skipped cards would silently
      // return fewer than AUCTION_CARDS_PER_MARKET chase cards.
      take: AUCTION_CARDS_PER_MARKET * 3,
      select: {
        id: true, name: true, setCode: true, collectorNumber: true, isPromo: true,
        rarity: true, variant: true,
      },
    });
    // Same exclusion as the price pass, for the same reason — and it costs
    // nothing here, since a Common almost never clears the value floor anyway.
    // Applying it explicitly means "no eBay for Commons" holds across every
    // surface rather than depending on a threshold that could later move.
    const targets = cards
      .filter((c) => eBayWorthSearching(c, tcgValues.get(c.id)))
      .slice(0, AUCTION_CARDS_PER_MARKET);
    if (targets.length === 0) continue;

    const rows: Prisma.EbayAuctionCreateManyInput[] = [];
    const reached = new Set<string>();
    let truncated = false;
    for (const c of targets) {
      if (isEbayRateLimited()) {
        truncated = true;
        break;
      }
      reached.add(c.id);
      const [rawNum, total] = c.collectorNumber.split("/");
      const found = await searchEbayAuctions(
        {
          name: c.name,
          setCode: c.setCode,
          number: rawNum.replace(/\*/g, ""),
          total: total ?? "",
          isSignature: c.collectorNumber.includes("*"),
          isPromo: c.isPromo,
          marketplace: mkt.marketplace,
        },
        AUCTIONS_PER_CARD,
      );
      for (const a of found) {
        rows.push({
          cardId: c.id,
          country: mkt.country,
          itemId: a.itemId,
          currentBidCents: a.currentBidCents,
          bidCount: a.bidCount,
          buyItNowCents: a.buyItNowCents,
          currency: a.currency,
          endsAt: a.endsAt,
          url: a.url,
          title: a.title,
          imageUrl: a.imageUrl,
          condition: a.condition ?? null,
          isGraded: a.isGraded,
        });
      }
    }

    // Scoped to the cards this market actually REACHED, so a budget that ran out
    // partway cannot clear auctions for cards it never checked — the same rule
    // the ad-carousel write above learned the hard way. Ended auctions are swept
    // separately below, so a card that legitimately has none is still cleared.
    const reachedIds = [...reached];
    for (let i = 0; i < reachedIds.length; i += 1000) {
      await prisma.ebayAuction.deleteMany({
        where: { country: mkt.country, cardId: { in: reachedIds.slice(i, i + 1000) } },
      });
    }
    if (rows.length > 0) {
      await prisma.ebayAuction.createMany({ data: rows, skipDuplicates: true });
      written += rows.length;
    }
    console.log(
      `eBay auctions ${mkt.country}: ${rows.length} live across ${reached.size} chase cards` +
        (truncated ? " (budget ran out — partial)" : ""),
    );
  }

  // Sweep anything that has closed since the last pass, in every market. A row
  // that outlives its auction is the failure this feature most has to avoid: it
  // carries a live affiliate link to a listing nobody can bid on. The renderer
  // hides them too, but the read side should not be serving them at all.
  const swept = await prisma.ebayAuction.deleteMany({ where: { endsAt: { lte: new Date() } } });
  if (swept.count > 0) console.log(`eBay auctions: swept ${swept.count} ended.`);

  return written;
}

// ── Title → card resolution (extracted to module scope so it's independently
// testable — see scripts/test-parsing.ts — without needing a live DB) ──────────
export type CardLite = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
};

export interface CardIndex {
  byNum: Map<string, string[]>;
  byNumAny: Map<string, string[]>;
  byName: Map<string, CardLite[]>;
  starIds: Set<string>;
  overIds: Set<string>;
  promoByName: Map<string, string>;
  promoByNum: Map<string, string>;
  promoByNumAny: Map<string, string>;
}

// Build the lookup structures resolveCardId() needs from a flat card list (base +
// promo rows together, same shape as `prisma.card.findMany`). Pure function, no DB
// access — same logic previously inlined at the top of importPrices().
export function buildCardIndex(allCardRows: CardLite[]): CardIndex {
  // Base (non-promo) pool drives the normal matching, unchanged.
  const cards = allCardRows.filter((c) => !c.isPromo);
  // Promo pool: a promo shares the base card's number, so it's matched ONLY when a
  // listing title explicitly says "promo" (etc.) — see PROMO_HINT below.
  const promoRows = allCardRows.filter((c) => c.isPromo);
  const promoByName = new Map<string, string>();
  const promoByNum = new Map<string, string>();
  const promoByNumAny = new Map<string, string>();
  for (const c of promoRows) {
    const nk = numKey(c.collectorNumber.split("/")[0]);
    const nameK = nameKey(c.name);
    if (!promoByName.has(nameK)) promoByName.set(nameK, c.id);
    if (!promoByNum.has(`${c.setCode}|${nk}`)) promoByNum.set(`${c.setCode}|${nk}`, c.id);
    if (!promoByNumAny.has(nk)) promoByNumAny.set(nk, c.id);
  }

  const byNum = new Map<string, string[]>();
  const byNumAny = new Map<string, string[]>();
  const byName = new Map<string, CardLite[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  // Track which card ids are Signature ("*") or Overnumbered so number-only
  // matches can be constrained to the right print type.
  const starIds = new Set<string>();
  const overIds = new Set<string>();
  for (const c of cards) {
    const nk = numKey(c.collectorNumber.split("/")[0]);
    push(byNum, `${c.setCode}|${nk}`, c.id);
    push(byNumAny, nk, c.id);
    push(byName, nameKey(c.name), c);
    const [d, tt] = c.collectorNumber.split("/");
    if (c.collectorNumber.includes("*")) starIds.add(c.id);
    else if (parseInt(d, 10) > parseInt(tt ?? "0", 10)) overIds.add(c.id);
  }

  return { byNum, byNumAny, byName, starIds, overIds, promoByName, promoByNum, promoByNumAny };
}

// The collector-number TOTAL uniquely identifies the set, so a title like
// "Existential Dread - 134/219" (no set code) is unambiguously UNL — never the
// OGN card numbered 134/298. This is authoritative and prevents cross-set bleed.
function setFromTotal(total?: string): string | null {
  switch (parseInt(total ?? "", 10)) {
    case 298: return "OGN";
    case 221: return "SFD";
    case 219: return "UNL";
    case 24: return "OGS";
    case 166: return "VEN";
    default: return null;
  }
}

export function resolveCardId(p: ShopifyProduct, idx: CardIndex): string | null {
  const { byNum, byNumAny, byName, starIds, overIds, promoByName, promoByNum, promoByNumAny } = idx;
  const t = p.title;
  // Never match a multi-card listing (playset/lot/bundle) to a single card — its
  // price is for the whole group, not one card.
  if (MULTI_CARD.test(t)) return null;
  const num = parseNumber(t);
  // Only a real signal in the title (an explicit number/total, or a set-name
  // hint) counts as "confident" — the "OGN" tail is a fallback default for the
  // number-only path below, NOT evidence the listing is actually OGN, so it must
  // never be used to pick between same-named cards from different sets.
  const confidentSetCode =
    num?.setCode ?? setFromTotal(num?.total) ?? SET_FROM_TITLE.find(([re]) => re.test(t))?.[1] ?? null;
  const setCode = confidentSetCode ?? "OGN";

  // Promo listing → resolve against the PROMO pool only (a promo shares the base
  // card's number, so a promo-marked listing must never price the base card).
  if (PROMO_HINT.test(t)) {
    const promoName = nameKey(cleanProductName(t).replace(PROMO_WORDS, " "));
    const byNameHit = promoByName.get(promoName);
    if (byNameHit) return byNameHit;
    if (num) {
      const bySet = promoByNum.get(`${setCode}|${num.key}`);
      if (bySet) return bySet;
      // THE ANY-SET FALLBACK NEEDS A SET-UNIQUE NUMBER. It reaches across every
      // set for a number, which is only defensible when the number itself can
      // only belong to one of them — and a "/total" is exactly what makes that
      // true ("134/219" is UNL and nothing else). A rune-cycle number has no
      // total and is not unique at all: every set prints R01–R06, in base, "a"
      // and "b" prints. Without this guard an Organized-Play rune listing that
      // names no set (or names Unleashed, whose "b" runes we hold as ordinary
      // Showcase cards rather than promos) fell through to whichever set's
      // promo happened to be indexed first — reliably Vendetta's, because those
      // are the only R-numbered promos in the catalogue. Leave it unmatched
      // instead; a promo we cannot place is not a promo we should price.
      if (confidentSetCode || !num.total) return null;
      return promoByNumAny.get(num.key) ?? null;
    }
    return null;
  }
  // NOTE: "Foil" is NOT an alt-art signal — nearly every listing (incl. base
  // cards) says Foil. Only these markers (or a lettered number like 039a) mean
  // an alt-art/special printing.
  const isAlt =
    /showcase|signature|overnumbered|alternate\s*art|alt\s*art/i.test(t) ||
    /\d+[a-z]/.test(num?.key ?? "");

  // Special-print signals in the title. Signature ("*"/signed) and Overnumbered
  // (number beyond the set count) are SEPARATE cards from the base/alt printings
  // and must never be mixed with them — nor with each other.
  const titleSig = /\bsignature\b|\bsigned\b/i.test(t) || /\d\s*\*/.test(t);
  const titleOver = !titleSig && /\bovernumber\w*/i.test(t);
  const isStar = (c: CardLite) => c.collectorNumber.includes("*");
  const isOverCard = (c: CardLite) => {
    if (isStar(c)) return false;
    const [d, tt] = c.collectorNumber.split("/");
    return parseInt(d, 10) > parseInt(tt ?? "0", 10);
  };
  const pickByNum = <T extends { collectorNumber: string }>(arr: T[]): T | undefined =>
    num ? arr.find((c) => numKey(c.collectorNumber.split("/")[0]) === num.key) : undefined;

  // 1) name match, disambiguated by special-print → number → variant.
  let cand = byName.get(nameKey(cleanProductName(t)));
  if (cand && cand.length) {
    // A name can legitimately repeat across sets — e.g. a VEN pre-release reveal
    // (no collector number yet) sharing a name with its later-catalogued printing
    // in another set. Never let a same-named card from the WRONG set win just
    // because it happened to come first in DB order: narrow to the set we have
    // real evidence for, or leave the listing unmatched rather than mis-attach a
    // real price to the wrong printing.
    const distinctSets = new Set(cand.map((c) => c.setCode));
    if (distinctSets.size > 1) {
      if (!confidentSetCode) return null;
      const bySet = cand.filter((c) => c.setCode === confidentSetCode);
      if (!bySet.length) return null;
      cand = bySet;
    }
    // A Signature listing belongs ONLY to a "*" card of that name. If we don't
    // have one, leave it unmatched rather than mis-attaching to a sibling.
    if (titleSig) {
      const sigs = cand.filter(isStar);
      if (!sigs.length) return null;
      return (pickByNum(sigs) ?? sigs[0]).id;
    }
    // Likewise an Overnumbered listing belongs only to an overnumbered card.
    if (titleOver) {
      const overs = cand.filter(isOverCard);
      if (!overs.length) return null;
      return (pickByNum(overs) ?? overs[0]).id;
    }
    // A PLAIN listing (no special-print signal) that carries an explicit collector
    // number must not be forced onto a same-named candidate whose number disagrees.
    // That candidate is a DIFFERENT, not-yet-catalogued printing sharing this name —
    // e.g. a store's ordinary Rare print of a Legend whose only row in our DB today
    // is its Signature/chase entry ("Kennen, Heart of the Tempest" 155/166 Rare vs.
    // our sole 197*/166 Signature row). Without this guard the very next line
    // (cand.length === 1 → return cand[0].id) mis-attached the Rare print's $1.10
    // price to the Signature card's page. Trust the number over the name here: keep
    // only candidates it actually matches, or leave the listing unmatched rather
    // than mis-attach its price.
    if (num) {
      const byNumMatch = cand.filter((c) => numKey(c.collectorNumber.split("/")[0]) === num.key);
      if (byNumMatch.length) cand = byNumMatch;
      else return null;
    }
    if (cand.length === 1) return cand[0].id;
    const exact = pickByNum(cand);
    if (exact) return exact.id;
    // A plain (non-special) listing must never resolve to a "*" Signature or an
    // overnumbered chase card — those only match explicit special-print titles.
    const pool = cand.filter((c) => !isStar(c) && !isOverCard(c));
    const search = pool.length ? pool : cand;
    const v = search.find((c) => (isAlt ? c.variant || c.rarity === "Showcase" : !c.variant && c.rarity !== "Showcase"));
    if (v) return v.id;
    return search[0].id;
  }

  // 2) number-only match (name didn't resolve — e.g. store titles like
  // "Vayne - Hunter — Signature - 223*/221" where the number/keywords pollute the
  // name). The number key is print-aware: numKey("223*") = "223s" maps only to the
  // signature card, so a starred number routes correctly. For special prints we
  // CONSTRAIN the hit to the matching print type, so a signature title whose number
  // is written WITHOUT the star (e.g. "225/221 (Signature)") won't wrongly grab the
  // plain overnumbered sibling — it stays unmatched instead.
  if (num) {
    const setHit = byNum.get(`${setCode}|${num.key}`) ?? [];
    const anyHit = byNumAny.get(num.key) ?? [];
    const hits = setHit.length ? setHit : anyHit;
    if (titleSig) {
      return hits.find((id) => starIds.has(id)) ?? null;
    }
    if (titleOver) {
      return hits.find((id) => overIds.has(id)) ?? null;
    }
    // Plain listing: prefer a plain (non-special) card of that number.
    const plainSet = setHit.filter((id) => !starIds.has(id) && !overIds.has(id));
    if (plainSet.length) return plainSet[0];
    const plainAny = anyHit.filter((id) => !starIds.has(id) && !overIds.has(id));
    if (plainAny.length === 1) return plainAny[0];
    if (setHit.length) return setHit[0];
  }
  return null;
}

export async function importPrices(): Promise<ImportSummary> {
  const allCardRows = await prisma.card.findMany({
    select: { id: true, name: true, setCode: true, collectorNumber: true, rarity: true, variant: true, isPromo: true },
  });
  const idx = buildCardIndex(allCardRows);

  const summary: ImportSummary = { stores: [], totalMatched: 0, totalUnmatched: 0, cardsPriced: 0 };

  // IMPORT_ONLY_COUNTRY=SG restricts the run to one market's stores — used by the
  // preview build to populate a new market's prices in the PREVIEW database quickly
  // (minutes, not the full multi-market crawl). External per-market sources (eBay,
  // TCGplayer, Cardmarket, sealed) are skipped in this mode; the scheduled full
  // import owns those. The lowest-price/history recompute below still covers every
  // market (it reads the DB, not this run's scrapes), so nothing is clobbered.
  const onlyCountry = (process.env.IMPORT_ONLY_COUNTRY || "").toUpperCase();
  if (onlyCountry) console.log(`IMPORT_ONLY_COUNTRY=${onlyCountry} — restricting to ${onlyCountry} stores.`);

  for (const store of RETAILER_LIST) {
    const cc = store.country ?? "AU";
    if (onlyCountry && cc !== onlyCountry) continue;
    // Auto-discover the store's Riftbound collections; fall back to any handles
    // configured explicitly in retailers.ts.
    let handles = await discoverRiftboundCollections(store.base);
    if (!handles.length) handles = store.collections ?? [];
    handles = Array.from(new Set([...handles, ...(store.collections ?? [])]));

    const products: ShopifyProduct[] = [];
    const seen = new Set<string>();
    for (const handle of handles) {
      for (const p of await fetchCollection(store, handle)) {
        if (seen.has(p.handle)) continue; // de-dup across overlapping collections
        seen.add(p.handle);
        products.push(p);
      }
    }
    if (!products.length) {
      summary.stores.push({ name: store.name, products: 0, priced: 0, matched: 0, unmatched: 0 });
      continue;
    }

    await prisma.retailerPrice.deleteMany({ where: { retailer: store.key } });

    const rows = new Map<string, any>();
    let matched = 0;
    let unmatched = 0;
    // Sample a few unmatched titles per store. WHY: the per-store summary only ever
    // printed COUNTS, so a store that returns a big healthy-looking catalogue but
    // matches none of it is indistinguishable from a store with no stock — both just
    // read "0 cards priced". That's how Bento Gaming sat at "964 products → 0 priced,
    // 964 unmatched" on the CA launch with nothing in the log to explain why. The
    // TCGplayer importer already samples its unmatched titles for exactly this
    // reason; this gives the Shopify path the same diagnostic.
    const unmatchedSample: string[] = [];
    for (const p of products) {
      const cardId = resolveCardId(p, idx);
      if (!cardId) {
        unmatched++;
        if (unmatchedSample.length < 5) unmatchedSample.push(p.title.slice(0, 70));
        continue;
      }
      matched++;
      // Prefer in-stock variants. If none are available but the store still LISTS
      // the card with a price, record it as out-of-stock so the card page can show
      // "Store had it — currently sold out" (useful demand/availability signal).
      const priced = p.variants.filter((v) => parseFloat(v.price) > 0);
      if (!priced.length) continue;
      const avail = priced.filter((v) => v.available);
      const inStock = avail.length > 0;
      const pool = inStock ? avail : priced;
      // Best available CONDITION first (NM over LP over …), then cheapest within that
      // condition — so the price matches the listing's headline, not a played copy.
      const best = pool.reduce((a, b) => {
        const ra = conditionRank(a.title);
        const rb = conditionRank(b.title);
        if (ra !== rb) return ra < rb ? a : b;
        return parseFloat(a.price) <= parseFloat(b.price) ? a : b;
      });
      const priceCents = Math.round(parseFloat(best.price) * 100);
      const prev = rows.get(cardId);
      // Keep the best listing per store+card: in-stock beats out-of-stock, then
      // cheaper beats dearer.
      if (prev) {
        if (prev.inStock && !inStock) continue;
        if (prev.inStock === inStock && prev.priceCents <= priceCents) continue;
      }
      rows.set(cardId, {
        cardId,
        retailer: store.key,
        retailerName: store.name,
        title: p.title,
        url: `${store.base}/products/${p.handle}`,
        condition: best.title && best.title !== "Default Title" ? best.title : null,
        isFoil: /foil/i.test(p.title),
        priceCents,
        // Derived from the market registry, not a hand-maintained ternary chain —
        // the old chain's `else` was "AUD", so any market added without editing it
        // would have silently stamped Australian-dollar rows in the DB.
        currency: currencyOf(cc),
        country: cc,
        inStock,
      });
    }
    await prisma.retailerPrice.createMany({ data: Array.from(rows.values()) });
    summary.stores.push({ name: store.name, products: products.length, priced: rows.size, matched, unmatched });
    // Only shout when the ratio says something is actually wrong: a real catalogue
    // came back but little/none of it resolved. A handful of unmatched titles is
    // normal everywhere (sealed and accessories slip into singles collections).
    if (unmatchedSample.length && unmatched > 20 && unmatched > matched) {
      console.warn(
        `  ⚠ ${store.name}: ${unmatched} of ${products.length} products unmatched (only ${matched} matched) — ` +
          `sample: ${unmatchedSample.join(" | ")}`
      );
    }
    summary.totalMatched += matched;
    summary.totalUnmatched += unmatched;
  }

  // Confirm each card's displayed (cheapest) price against the live product page,
  // since the collection feed can lag it. In single-market mode only that market's
  // rows are verified (the others weren't rescraped this run).
  const corrected = await verifyCheapestListings(onlyCountry || undefined);
  if (corrected) console.log(`Verified cheapest listings — corrected ${corrected} stale prices.`);

  // ---- eBay AU + US (optional; only when EBAY_CLIENT_ID/SECRET are set) ---------
  // eBay covers EVERY card per market, but only ONCE a day, and NEVER on a deploy
  // (push). AU/US/UK/SG/CA ≈ 5×~1k calls; primeEbayBudget() reads the LIVE remaining
  // quota and reserves QUOTA_RESERVE, so this can never exhaust eBay's ~5,000/day
  // Browse limit — it just stops early, dropping the last market(s) in the array
  // (CA first, by design — see refreshEbayMarkets). NZ is store-only (no eBay).
  // Cards are ordered by search demand so the most-wanted are covered first if the
  // quota is ever hit.
  //  - ebayDue:     last eBay refresh was > 20h ago (so it runs ~once a day).
  //  - ebayAllowed: the workflow sets EBAY_REFRESH=false for push/deploy runs.
  // Staleness is asked PER MARKET, not across all eBay rows at once.
  //
  // This used to be a single findFirst ordered by lastSeen desc over every
  // `ebay*` retailer, i.e. "did ANY market refresh recently?" — which is the
  // wrong question, and it turned a one-run miss into a multi-day outage. A run
  // where AU wrote rows and US was dropped by the budget still stamps a fresh
  // lastSeen (RetailerPrice.lastSeen defaults to now()), so the next run reads
  // "not due" and skips eBay entirely. The starved market therefore could not be
  // repaired by the second daily run; it stayed stale until AU itself aged out.
  //
  // Asking per market means a market that missed its turn is due again on the
  // very next run — which, combined with the alternating search order in
  // ebayMarketsForDay, is what actually lets it recover. Running more often is
  // safe: primeEbayBudget re-reads the LIVE remaining quota each run, so a
  // same-day retry spends only what today's limit actually has left.
  const alwaysRetailers = EBAY_ALWAYS_MARKETS.map((m) => m.retailer);
  const lastPerMarket = await prisma.retailerPrice.groupBy({
    by: ["retailer"],
    where: { retailer: { in: alwaysRetailers } },
    // BOTH aggregates, because the two passes need opposite questions answered.
    //
    // _min = "how stale is the OLDEST row?". The full pass replaces a market's
    // rows wholesale, so this is precisely the full pass's own timestamp, and a
    // chase write cannot move it (it never touches the other ~600 rows). That is
    // what stops a nightly chase run masking a stale catalogue.
    //
    // _max = "when did ANYTHING here last refresh?" — which any write advances,
    // including the chase pass's own. That is what stops the chase pass firing
    // repeatedly, and it is a bug I shipped: gating chase on _min made it a latch
    // the chase pass could not clear, so it stayed due for the whole 10-20h
    // window. There are THREE daily invocations of this import, not two —
    // .github/workflows/refresh-prices.yml at 07:00 and 19:00, and vercel.json's
    // own cron at 18:00 — so it fired at 18:00 and again at 19:00, roughly 420
    // wasted Browse calls, with each primeEbayBudget() also clearing a
    // rate-limit latch the morning pass had set.
    _min: { lastSeen: true },
    _max: { lastSeen: true },
  });
  const oldestPerMarket = new Map(lastPerMarket.map((r) => [r.retailer, r._min.lastSeen]));
  const newestPerMarket = new Map(lastPerMarket.map((r) => [r.retailer, r._max.lastSeen]));
  const HOUR = 60 * 60 * 1000;
  const fullCutoff = Date.now() - 20 * HOUR;
  // 10h after the LAST eBay write of any kind. With the full pass at 07:00 that
  // clears at 18:00 (the Vercel cron), and the 19:00 run then sees a 1h-old
  // write and correctly does nothing.
  const chaseCutoff = Date.now() - 10 * HOUR;
  // EBAY_FORCE=1 bypasses the once-a-day gate, e.g. to push out an eBay matching fix
  // (like the Chinese-listing exclusion) the same day instead of waiting ~20h.
  const ebayForced = process.env.EBAY_FORCE === "1";
  const olderThan = (stamps: Map<string, Date | null>, cutoff: number) =>
    alwaysRetailers.filter((r) => {
      const seen = stamps.get(r);
      return !seen || seen.getTime() < cutoff; // never written counts as stale
    });
  const staleMarkets = olderThan(oldestPerMarket, fullCutoff);
  const ebayDue = ebayForced || staleMarkets.length > 0;
  // Only when the full pass is NOT running: it already refreshes these printings,
  // so running both in one invocation would query them twice for nothing.
  const chaseDue = !ebayDue && olderThan(newestPerMarket, chaseCutoff).length > 0;
  if (staleMarkets.length > 0 && !ebayForced) {
    console.log(`eBay due: ${staleMarkets.join(", ")} last refreshed >20h ago.`);
  }
  const ebayAllowed = process.env.EBAY_REFRESH !== "false" && !onlyCountry;
  if (isEbayEnabled() && ebayDue && ebayAllowed) {
    const ebayCards = await prisma.card.findMany({
      orderBy: [
        { searchCount: "desc" },
        { viewCount: "desc" },
        // Value, as the tiebreak among cards with no recorded demand yet — which
        // is every card of a set that launched this week, so for a launch set
        // this is effectively THE sort. AU first (the baseline market), then US:
        // stores in one market list a new set before the other, and a chase card
        // priced in only one of them would otherwise tie at null with the bulk
        // and land in the tail. Prisma has no COALESCE in orderBy, so this is
        // expressed as successive keys, which gives the same ordering.
        { lowestPriceCents: { sort: "desc", nulls: "last" } },
        { lowestPriceCentsUs: { sort: "desc", nulls: "last" } },
      ],
      select: {
        id: true, name: true, setCode: true, collectorNumber: true, isPromo: true,
        // Needed only to compute effective rarity for the filter below.
        rarity: true, variant: true,
      },
    });
    // Value floor reference. Read once for the whole pass — TCGplayer is imported
    // AFTER this block, so these are yesterday's figures; that is fine for a
    // threshold (a card does not cross $20 and back inside a day) and it avoids
    // reordering the import for a filter.
    const tcgValues = await tcgplayerUsValues();
    const ebayTargets = ebayCards.filter((c) => eBayWorthSearching(c, tcgValues.get(c.id)));
    const skipped = ebayCards.length - ebayTargets.length;
    const belowFloor = ebayCards.filter((c) => {
      const v = tcgValues.get(c.id);
      return v != null && v < EBAY_MIN_VALUE_USD_CENTS;
    }).length;
    // Counted on the KEPT set, not the whole catalogue: a Common with no
    // TCGplayer price was dropped on rarity, and reporting it as "kept" would
    // overstate what the unknown-value rule is costing.
    const noValue = ebayTargets.filter((c) => tcgValues.get(c.id) == null).length;
    console.log(
      `eBay catalogue: ${ebayTargets.length} of ${ebayCards.length} cards searched — ` +
        `${skipped} skipped (${belowFloor} under $${(EBAY_MIN_VALUE_USD_CENTS / 100).toFixed(0)} TCGplayer US, ` +
        `rest Common/Uncommon base prints); ${noValue} kept with no TCGplayer price (unknown ≠ cheap). ` +
        `~${skipped * 3} calls/day saved.`,
    );
    const n = await refreshEbayMarkets(ebayTargets);
    summary.stores.push({ name: "eBay (AU/US/UK/SG/CA)", products: ebayTargets.length, priced: n, matched: n, unmatched: 0 });

    // Chase-tier auctions, on whatever budget the price pass left. Deliberately
    // last and deliberately unguarded by its own quota check — refreshEbayAuctions
    // no-ops when the budget is already latched, so prices always win the tie.
    // Only the always-markets: the rotating market is at most ~48h stale by
    // design, which is fine for a price and useless for an auction countdown.
    try {
      const a = await refreshEbayAuctions(EBAY_ALWAYS_MARKETS);
      if (a > 0) summary.stores.push({ name: "eBay auctions (chase)", products: a, priced: a, matched: a, unmatched: 0 });
    } catch (e) {
      // An auction widget must never fail the price import.
      console.warn("eBay auction pass failed:", e);
    }
  } else if (chaseDue && isEbayEnabled() && ebayAllowed) {
    // The evening pass: promo / Signature / overnumbered printings only. These
    // are thin markets — often one or two live listings — so a single sale moves
    // the cheapest price outright, and they are the most expensive cards we
    // track, which makes a stale figure on one the most costly kind of wrong.
    await primeEbayBudget();
    try {
      const n = await refreshEbayChasePrintings(EBAY_ALWAYS_MARKETS);
      summary.stores.push({ name: "eBay chase (2nd daily)", products: n, priced: n, matched: n, unmatched: 0 });
      // Auctions ride along: their whole value is a deadline, so a 12-hourly
      // countdown is worth far more than a daily one, and the cards are the same.
      const a = await refreshEbayAuctions(EBAY_ALWAYS_MARKETS);
      if (a > 0) summary.stores.push({ name: "eBay auctions (chase)", products: a, priced: a, matched: a, unmatched: 0 });
    } catch (e) {
      console.warn("eBay chase pass failed:", e);
    }
  }

  // ---- TCGplayer (US market price) ---------------------------------------------
  // TCGplayer is the dominant US marketplace. We add its MARKET price (not the
  // lowest listing, which is often a different-language card) as a US source.
  // Isolated so a TCGplayer hiccup never fails the rest of the import.
  try {
    if (!onlyCountry || onlyCountry === "US") {
      const n = await refreshTcgplayerPrices();
      if (n > 0) summary.stores.push({ name: "TCGplayer (US)", products: n, priced: n, matched: n, unmatched: 0 });
    }
  } catch (e) {
    console.warn("TCGplayer import failed:", e);
  }

  // ---- Cardmarket (UK fallback price) ------------------------------------------
  // Flag-gated OFF (CARDMARKET_ENABLED) and pending a ToS sign-off — see cardmarket.ts.
  // When enabled it adds an EUR→GBP-converted marketplace "from" price as a UK
  // FALLBACK source (UK_FALLBACK_RETAILERS). Isolated so it never fails the import.
  try {
    if (!onlyCountry || onlyCountry === "UK") {
      const r = await refreshCardmarketPrices();
      if (!r.skipped && r.written > 0) {
        summary.stores.push({ name: "Cardmarket (UK)", products: r.written, priced: r.written, matched: r.written, unmatched: 0 });
      } else if (r.skipped) {
        console.log(`Cardmarket: skipped (${r.reason}).`);
      }
    }
  } catch (e) {
    console.warn("Cardmarket import failed:", e);
  }

  // ---- RiftCompare Marketplace (our own verified-seller listings) --------------
  // Surface verified sellers' cheapest active listing per market as a source, so
  // marketplace cards show up in the comparison. Isolated so it never fails the run.
  try {
    const n = await importMarketplaceListings();
    if (n > 0) summary.stores.push({ name: "RiftCompare Marketplace", products: n, priced: n, matched: n, unmatched: 0 });
  } catch (e) {
    console.warn("Marketplace import failed:", e);
  }

  // Recompute each card's lowest live price PER MARKET from IN-STOCK listings only,
  // so the catalogue "from" price never reflects a sold-out listing. (Out-of-stock
  // rows still exist and are shown on the card page, just not used for the headline.)
  // Converted reference prices (TCGplayer-AU/UK/SG, Cardmarket — see
  // AU/UK/SG_FALLBACK_RETAILERS) are EXCLUDED here entirely, not just deprioritized:
  // they aren't real local retailers (e.g. TCGplayer doesn't operate as an AU
  // store), so a "$X from" badge backed by one would promise a price the card page
  // then refuses to show as a store (computeMarket in lib/market-rows.ts excludes
  // them from the comparison too). A card with no real local listing gets null here
  // — "no price yet" — rather than a misleading converted figure.
  // CA has no converted-reference source of its own (no tcgplayer_ca — see the
  // note in constants.ts), so like NZ it takes every in-stock row for the market
  // with no fallback-retailer exclusion.
  const [pricedAuReal, pricedNz, pricedUs, pricedSgReal, pricedUkReal, pricedCa] = await Promise.all([
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "AU", retailer: { notIn: [...AU_FALLBACK_RETAILERS] } }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "NZ" }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "US" }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "SG", retailer: { notIn: [...SG_FALLBACK_RETAILERS] } }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "UK", retailer: { notIn: [...UK_FALLBACK_RETAILERS] } }, _min: { priceCents: true } }),
    prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true, country: "CA" }, _min: { priceCents: true } }),
  ]);
  const lowAuReal = new Map(pricedAuReal.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const lowNz = new Map(pricedNz.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const lowUs = new Map(pricedUs.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const lowSgReal = new Map(pricedSgReal.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const lowUkReal = new Map(pricedUkReal.map((r) => [r.cardId, r._min.priceCents ?? null]));
  const lowCa = new Map(pricedCa.map((r) => [r.cardId, r._min.priceCents ?? null]));
  // Diff-based update: write each card STRAIGHT to its new lowest only when it
  // changed. We must NOT reset every card to null first (the old approach) — that
  // briefly showed "No price yet" for the whole catalogue on every import/deploy
  // while the per-card repopulation loop caught up. Now each card transitions
  // old → new atomically and is never transiently null.
  const existing = await prisma.card.findMany({
    select: {
      id: true,
      lowestPriceCents: true,
      lowestPriceCentsNz: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
    },
  });
  let changed = 0;
  for (const c of existing) {
    // Real listings only — a converted reference price (TCGplayer-AU/UK/SG,
    // Cardmarket) is never surfaced as THE card's price: it isn't a real local
    // retailer, so a browse-grid "$X from" badge backed by it would promise a
    // price the card page then can't show (computeMarket excludes these rows
    // from the comparison entirely — see lib/market-rows.ts). Reference prices
    // stay queryable for the Deal Finder via AU/UK/SG_FALLBACK_RETAILERS directly.
    const nAu = lowAuReal.get(c.id) ?? null;
    const nNz = lowNz.get(c.id) ?? null;
    const nUs = lowUs.get(c.id) ?? null;
    const nUk = lowUkReal.get(c.id) ?? null;
    const nSg = lowSgReal.get(c.id) ?? null;
    const nCa = lowCa.get(c.id) ?? null;
    if (
      nAu !== c.lowestPriceCents ||
      nNz !== c.lowestPriceCentsNz ||
      nUs !== c.lowestPriceCentsUs ||
      nUk !== c.lowestPriceCentsUk ||
      nSg !== c.lowestPriceCentsSg ||
      nCa !== c.lowestPriceCentsCa
    ) {
      await prisma.card.update({
        where: { id: c.id },
        data: {
          lowestPriceCents: nAu,
          lowestPriceCentsNz: nNz,
          lowestPriceCentsUs: nUs,
          lowestPriceCentsUk: nUk,
          lowestPriceCentsSg: nSg,
          lowestPriceCentsCa: nCa,
        },
      });
      changed++;
    }
  }
  console.log(`Lowest recompute: ${changed} cards changed (no null-reset window).`);
  summary.cardsPriced = lowAuReal.size;

  // Snapshot today's lowest price per card PER MARKET for the price-over-time chart
  // (each market in its own currency). One point per card per market per Sydney day;
  // a same-day re-run (e.g. a deploy) replaces the day's rows.
  try {
    const day = sydneyDay();
    // Split-history setups: make sure every card exists in the history DB first
    // (PriceHistory has an FK to Card there too). No-op on single-DB setups.
    await ensureHistoryCards(existing.map((c) => c.id));
    const rows: { cardId: string; country: string; day: Date; lowestPriceCents: number }[] = [];
    for (const c of existing) {
      const au = lowAuReal.get(c.id) ?? null;
      const nz = lowNz.get(c.id) ?? null;
      const us = lowUs.get(c.id) ?? null;
      const uk = lowUkReal.get(c.id) ?? null;
      const sg = lowSgReal.get(c.id) ?? null;
      const ca = lowCa.get(c.id) ?? null;
      if (au != null) rows.push({ cardId: c.id, country: "AU", day, lowestPriceCents: au });
      if (nz != null) rows.push({ cardId: c.id, country: "NZ", day, lowestPriceCents: nz });
      if (us != null) rows.push({ cardId: c.id, country: "US", day, lowestPriceCents: us });
      if (uk != null) rows.push({ cardId: c.id, country: "UK", day, lowestPriceCents: uk });
      if (sg != null) rows.push({ cardId: c.id, country: "SG", day, lowestPriceCents: sg });
      if (ca != null) rows.push({ cardId: c.id, country: "CA", day, lowestPriceCents: ca });
    }
    await dbHistory.priceHistory.deleteMany({ where: { day } });
    if (rows.length > 0) await dbHistory.priceHistory.createMany({ data: rows });
    console.log(`Price history: recorded ${rows.length} points (AU/NZ/US/UK/SG/CA) for ${day.toISOString().slice(0, 10)}.`);
  } catch (e) {
    console.warn("Price-history snapshot failed:", e);
  }

  // Snapshot today's cumulative demand counters (search/view) alongside the price
  // history — the daily diff is the demand-velocity signal the rise predictor uses.
  // Self-guarded; never fails the import.
  const demandRows = await snapshotDemand();
  if (demandRows) console.log(`Demand snapshot: ${demandRows} cards.`);

  // Also refresh sealed / non-single products (booster boxes, packs, …). Isolated
  // in try/catch so a hiccup here never fails the singles import. Skipped in
  // single-market mode (the scheduled full import owns sealed).
  try {
    if (!onlyCountry) {
      const n = await importSealed();
      console.log(`Sealed products: ${n} listings.`);
    }
  } catch (e) {
    console.warn("Sealed import failed:", e);
  }

  return summary;
}
