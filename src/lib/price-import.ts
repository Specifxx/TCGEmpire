// Reusable price-import engine. Pulls Riftbound singles from AU Shopify stores'
// public products.json feeds, matches them to cards, and writes RetailerPrice
// rows + Card.lowestPriceCents. Called by scripts/import-prices.ts (CLI) and the
// scheduled /api/cron/refresh-prices route.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory, ensureHistoryCards } from "./db-history";
import { RETAILER_LIST, RetailerInfo } from "./retailers";
import { isEbayEnabled, isEbayRateLimited, searchEbayLowest, primeEbayBudget, ebaySpentThisRun, type EbayResult } from "./ebay";
import { importSealed } from "./sealed-import";
import { snapshotDemand } from "./demand-snapshot";
import { refreshTcgplayerPrices } from "./tcgplayer";
import { importMarketplaceListings } from "./marketplace";
import { refreshCardmarketPrices } from "./cardmarket";
import { AU_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS } from "./constants";
import { currencyOf, isoCountry, type Country } from "./country";
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
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
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
// Parse a collector number from any store title format, e.g.:
//   "(299*/298)", "(053/219)", "OGN-128/298", "[OGN - 213/298]", "239*/221"
// Keys are normalised via numKey so "039" and "39" compare equal (the leading-zero
// bug that previously mis-assigned base cards to their alt-art printings).
function parseNumber(title: string): { setCode: string | null; key: string; total: string } | null {
  const pref = title.match(/\b([A-Za-z]{2,4})\s*-\s*(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (pref) return { setCode: pref[1].toUpperCase(), key: numKey(pref[2] + pref[3]), total: pref[4] };
  const bare = title.match(/(\d+)([a-z*]*)\s*\/\s*(\d+)/);
  if (bare) return { setCode: null, key: numKey(bare[1] + bare[2]), total: bare[3] };
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
    const data = (await res.json()) as { products: ShopifyProduct[] };
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
export async function refreshEbayMarkets(
  cards: { id: string; name: string; setCode: string; collectorNumber: string; isPromo: boolean }[]
): Promise<number> {
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
  const ALWAYS = [
    { country: "AU", marketplace: "EBAY_AU", currency: "AUD", retailer: "ebay" },
    { country: "US", marketplace: "EBAY_US", currency: "USD", retailer: "ebay_us" },
    { country: "UK", marketplace: "EBAY_GB", currency: "GBP", retailer: "ebay_uk" },
  ];
  // Rotated one-per-day, in this order. Add a third market here and the rotation
  // just becomes every-third-day — no other change needed.
  const ROTATING = [
    { country: "SG", marketplace: "EBAY_SG", currency: "SGD", retailer: "ebay_sg" },
    { country: "CA", marketplace: "EBAY_CA", currency: "CAD", retailer: "ebay_ca" },
  ];
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
    const todays = ROTATING[dayIndex % ROTATING.length];
    markets = [...ALWAYS, todays];
    console.log(
      `eBay market rotation: ${ALWAYS.map((m) => m.country).join("/")} daily + ${todays.country} today ` +
        `(${ROTATING.map((m) => m.country).join("/")} alternate by Sydney day; ` +
        `use EBAY_ONLY_MARKET=<code> to refresh the other one off-cycle).`
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
    for (const c of cards) {
      if (isEbayRateLimited()) break;
      checkedIds.add(c.id); // we have budget and are about to query this card
      const [rawNum, total] = c.collectorNumber.split("/");
      const captured: EbayResult[] = [];
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
        captured
      );
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
      if (!r && isEbayRateLimited()) { checkedIds.delete(c.id); break; }
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
    if (adRows.length > 0) {
      // Only replace the cards we actually re-queried this pass — a rate-limited
      // run that skips most cards must not wipe out yesterday's carousel for them.
      const queriedIds = [...new Set(adRows.map((r) => r.cardId))];
      for (let i = 0; i < queriedIds.length; i += 1000) {
        await prisma.ebayAdListing.deleteMany({ where: { country: mkt.country, cardId: { in: queriedIds.slice(i, i + 1000) } } });
      }
      await prisma.ebayAdListing.createMany({ data: adRows });
    }
  }
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
    if (num) return promoByNum.get(`${setCode}|${num.key}`) ?? promoByNumAny.get(num.key) ?? null;
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
    for (const p of products) {
      const cardId = resolveCardId(p, idx);
      if (!cardId) { unmatched++; continue; }
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
  const lastEbay = await prisma.retailerPrice.findFirst({
    where: { retailer: { startsWith: "ebay" } },
    orderBy: { lastSeen: "desc" },
    select: { lastSeen: true },
  });
  // EBAY_FORCE=1 bypasses the once-a-day gate, e.g. to push out an eBay matching fix
  // (like the Chinese-listing exclusion) the same day instead of waiting ~20h.
  const ebayForced = process.env.EBAY_FORCE === "1";
  const ebayDue = ebayForced || !lastEbay || Date.now() - lastEbay.lastSeen.getTime() > 20 * 60 * 60 * 1000;
  const ebayAllowed = process.env.EBAY_REFRESH !== "false" && !onlyCountry;
  if (isEbayEnabled() && ebayDue && ebayAllowed) {
    const ebayCards = await prisma.card.findMany({
      orderBy: [
        { searchCount: "desc" },
        { viewCount: "desc" },
        { lowestPriceCents: { sort: "desc", nulls: "last" } },
      ],
      select: { id: true, name: true, setCode: true, collectorNumber: true, isPromo: true },
    });
    const n = await refreshEbayMarkets(ebayCards);
    summary.stores.push({ name: "eBay (AU/US/UK/SG/CA)", products: ebayCards.length, priced: n, matched: n, unmatched: 0 });
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
