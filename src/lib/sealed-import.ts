// Imports SEALED / non-single Riftbound products (booster boxes, packs, Proving
// Grounds, bundles, …) from the same AU Shopify stores, into SealedListing. The
// singles importer (price-import.ts) deliberately skips these; this complements it.
import { prisma } from "./db";
import { RETAILER_LIST, type RetailerInfo } from "./retailers";
import { decodeEntities, discoverWooRiftboundCategories, fetchWooCategory, productUrl, wooVariants } from "./woocommerce";
import { isEbayEnabled, isEbayRateLimited, searchEbaySealed, primeEbayBudget, sealedFloorCents } from "./ebay";
import { fetchTcgplayerSealed, tcgProductUrl, tcgImageUrl, setCodeFromSetName } from "./tcgplayer";
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "./scrape-http";
import { DEFAULT_COUNTRY, currencyOf, type Country } from "./country";
import { isPreorderSetCode, EBAY_CA_RETAILER } from "./constants";
import { convertCents } from "./fx";

interface ShopifyImg { src?: string }
interface ShopifyVar { price: string; available: boolean }
// `url` is the product's real page URL — see ShopifyProduct.url in
// price-import.ts for why a WooCommerce product must carry one and a Shopify
// product need not.
interface ShopifyProd { title: string; handle: string; variants: ShopifyVar[]; images?: ShopifyImg[]; url?: string }

const SET_FROM_TITLE: [RegExp, string][] = [
  [/proving\s*grounds|\bOGS\b/i, "OGS"],
  [/spirit\s*forged|\bSFD\b/i, "SFD"],
  [/unleashed|\bUNL\b/i, "UNL"],
  [/vendetta|\bVEN\b/i, "VEN"],
  // MUST stay ahead of Origins: Radiance products are titled e.g. "Riftbound:
  // League of Legends - Radiance Booster Box (Pre-Order)", which contains no
  // other set word, but ordering it late costs nothing and guards against a
  // future title carrying both.
  [/\bradiance\b|\bRAD\b/i, "RAD"],
  [/origins|\bOGN\b/i, "OGN"],
];
const SET_NAMES: Record<string, string> = {
  OGN: "Origins", OGS: "Proving Grounds", SFD: "Spiritforged", UNL: "Unleashed", VEN: "Vendetta",
  RAD: "Radiance",
};

// A sealed product must be identifiably RIFTBOUND. Other games slip in when a store
// files them under a shared/mismatched collection — e.g. Gundam "… [Starter Deck 06:
// Clan Unity]" matches "starter deck" — so we require an explicit Riftbound/League
// marker (set name, "Riftbound", "League of Legends", Proving Grounds, Nexus Night).
const RIFTBOUND_HINT =
  /riftbound|league\s*of\s*legends|proving\s*grounds|nexus\s*night|spirit\s*forged|spiritforged|\borigins\b|\bunleashed\b|\bvendetta\b|\b(?:OGN|OGS|SFD|UNL|VEN)\b/i;

// The Riftbound × T1 2025 Worlds Champion Collection — Riot's first single-team
// collaboration, sold ONLY through a Riot Merch Store drawing (English Signature
// Edition registration 14-17 Aug 2026; Player Bundle later in the year). It carries
// no set code and none of the usual product words, so without this it is invisible
// to every filter below: "T1 2025 Worlds Champion Signature Edition" matches neither
// SEALED_TITLE nor RIFTBOUND_HINT, and the Player Bundle would land in the generic
// "Bundle" bucket next to gift boxes.
//
// ANCHORED ON "worlds champion" (or a nearby "T1"), never on "signature" alone.
// "Signature" by itself is a CARD treatment ("Zed, Master of Shadows Signature
// 191*/166"), and matching it here would scrape singles into the sealed table. The
// second branch exists because Riot's own posts shorten the product to "T1 Worlds
// Signature Set", dropping the word "Champion" that the first branch needs.
const T1_COLLECTION =
  /worlds\s*champion\s*(?:collection|signature\s*edition|player\s*bundle)|\bt1\b[\s\S]{0,30}?(?:signature\s*(?:edition|set)|player\s*bundle)/i;

// Riftbound's unreleased sets ARE imported now — as pre-orders. They used to be
// dropped here wholesale, which was right while nothing could tell a pre-order from
// stock on a shelf: an unshipped box listed beside real inventory reads as buyable,
// and its price would have fed "cheapest sealed" and an InStock offer for a product
// no store can post you.
//
// That separation now exists downstream instead of at the door: setCode carries the
// set, constants.isPreorderSetCode() derives "hasn't shipped yet" FROM THE RELEASE
// DATE, and getSealedGroups() keeps pre-orders out of the normal sealed pages while
// getPreorderGroups() serves the dedicated, clearly-labelled pre-order page. So the
// listings are captured while the pre-order window is the whole story, and they
// graduate into the ordinary pages by themselves on release day.
//
// POKÉMON "ASTRAL RADIANCE" IS THE TRAP HERE. Searching tracked stores for
// "radiance" returns Pokémon Astral Radiance boxes, packs and singles far more often
// than Riftbound's set. isRiftboundSealed() already demands a Riftbound marker, which
// is the real guard, but this is the exact collision class that put booster-box
// photos on pack listings once before — so it is also excluded by name, because two
// independent guards is the difference between a bug and a bad headline.
const FOREIGN_RADIANCE = /\bastral\s*radiance\b/i;

function isRiftboundSealed(title: string): boolean {
  return (RIFTBOUND_HINT.test(title) || T1_COLLECTION.test(title)) && !FOREIGN_RADIANCE.test(title);
}

/**
 * Would a store listing with this title be captured as Riftbound sealed?
 *
 * Exported for tests only — it composes the two private gates every scrape path
 * runs (`isRiftboundSealed` + `looksSealed`) without re-stating their regexes,
 * which a test that copied them would silently stop checking the moment either
 * changed. This is the gate that decides whether a real pre-order on a real
 * storefront reaches the site at all, so it is worth being able to assert on.
 */
export function isTrackableSealedTitle(title: string): boolean {
  return isRiftboundSealed(title) && looksSealed(title);
}

// "Does this title describe a sealed PRODUCT (rather than a single/accessory)?"
// SEALED_TITLE keyed off product words the T1 collection simply doesn't use, so it
// gets its own clause here rather than another alternation nobody can read.
function looksSealed(title: string): boolean {
  return (SEALED_TITLE.test(title) || T1_COLLECTION.test(title)) && !SEALED_EXCLUDE.test(title);
}

// A sealed product title looks like one of these. "nexus night ... pack" (the real
// product is titled e.g. "Origins Nexus Night Promo Pack" — night, then an optional
// number/"promo", then "pack") — not bare "nexus night", which also matches a store
// listing an individual promo card pulled FROM a Nexus Night pack, e.g. "Stalwart
// Poro Promo Nexus Night 1" — that's a single card, not the sealed pack, and must
// never be scraped as sealed.
const SEALED_TITLE =
  /booster\s*box|booster\s*pack|booster\s*display|display\s*box|display\s*case|booster\s*bundle|\bbundle\b|box\s*set|champion\s*deck|showdown\s*decks?|pre-?rift|event\s*kit|elite|collector|gift\s*box|blister|proving\s*grounds|nexus\s*night\s*(?:\d+\s*)?(?:promo\s*)?pack|promo\s*pack|two[-\s]?player|starter\s*(deck|set)|precon|\bcase\b|mega\s*box|\btin\b|\bvault\b|sealed/i;
// …but never these. Singles / accessories / bulk / break slots / non-English slip
// through otherwise. Condition codes (NM/LP/…) and a set name in parentheses
// (e.g. "(Origins: Proving Grounds)") are tell-tale signs of a single card.
const SEALED_EXCLUDE =
  /\bsingle\b|playmat|deck\s*box|binder|toploader|top\s*loader|dice|counter|\btoken\b|card\s*\d|\/\d{2,3}\b|chinese|japanese|korean|simplified|traditional|\bbulk\s+(?:lot|cards|commons?|singles?)\b|\bopened\b|live\s*break|\bticket\b|protector|acrylic|magnetic|\bempty\b|box\s*only|storage|\bstand\b|\bholder\b|divider|topper|\binsert\b|\b(?:nm|lp|mp|hp|dmg)\b|near\s*mint|lightly\s*played|moderately\s*played|heavily\s*played|\([^)]*\b(?:origins|spirit\s*forged|spiritforged|unleashed|vendetta|proving\s*grounds)\b[^)]*\)/i;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Discover ALL riftbound collections (including sealed-only ones, which the singles
// importer skips) so we can find boxes/packs wherever the store files them.
async function discoverCollections(base: string): Promise<string[]> {
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
      if (/riftbound/i.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) handles.add(h);
    }
  }
  return Array.from(handles);
}

async function fetchProducts(base: string, handle: string, country: string): Promise<ShopifyProd[]> {
  const path = `/collections/${handle}/products.json`;
  const allowed = await robotsAllows(base);
  if (!allowed(path)) return [];
  const all: ShopifyProd[] = [];
  for (let page = 1; page <= 10; page++) {
    if (page > 1) await sleep(REQUEST_DELAY_MS);
    // country=XX forces the store's market price (Shopify Markets serves a different
    // price per country): AUD for AU stores, USD for US stores, etc.
    const url = `${base}${path}?limit=250&page=${page}&country=${country}&_=${Date.now()}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { ...UA, "Cache-Control": "no-cache" }, cache: "no-store" });
    } catch {
      break;
    }
    if (isRateLimited(res)) break;
    if (!res.ok) break;
    const data = await res.json().catch(() => null);
    const products: ShopifyProd[] = data?.products ?? [];
    if (!products.length) break;
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}

function detectSet(title: string): string | null {
  return SET_FROM_TITLE.find(([re]) => re.test(title))?.[1] ?? null;
}

// Classify a sealed product into a specific type. Shared by store scraping and the
// TCGplayer catalogue so the same product groups together. Champion Decks keep the
// champion name so each is distinct (e.g. "Champion Deck (Viktor)").
// Champions that have Champion Decks (parens form on TCGplayer; free-form in store
// titles like "… Champion Deck - Vex" or "Jinx Champion Deck"). Longest names first
// so "Viktor"/"Vex" win before the short "Vi".
const CHAMPIONS = /\b(Lee\s*Sin|Viktor|Rumble|Fiora|Garen|Annie|Lux|Master\s*Yi|Jinx|Vex|Vi)\b/i;

export function classifySealed(title: string): string {
  const t = title.toLowerCase();
  const rawChamp = title.match(/champion\s*deck\s*\(([^)]+)\)/i)?.[1]?.trim() || title.match(CHAMPIONS)?.[1];
  const champ = rawChamp ? rawChamp.toLowerCase().replace(/\s+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : null;
  if (/proving\s*grounds/.test(t)) return /\bcase\b/.test(t) ? "Proving Grounds Case" : "Proving Grounds";
  if (/nexus\s*night\s*(?:\d+\s*)?(?:promo\s*)?pack/.test(t)) return "Nexus Night Pack";
  if (/champion\s*deck/.test(t)) { const n = champ ? ` (${champ})` : ""; return /\bdisplay\b/.test(t) ? `Champion Deck${n} Display` : `Champion Deck${n}`; }
  // MUST stay ahead of the `\bdisplay\b` catch-all below. "Vendetta - Showdown
  // Decks: Zed vs Shen Display" is a display of DECKS, but that catch-all read the
  // word "Display" and typed it as a Booster Box — so it landed in VEN|Booster Box
  // alongside the real Vendetta Booster Display and, being first in the canonical
  // image map, put a picture of two decks on the booster-box tile. Any future
  // "<something> Display" that isn't a booster display needs a rule up here too.
  if (/showdown\s*decks?/.test(t)) return /\bdisplay\b/.test(t) ? "Showdown Decks Display" : "Showdown Decks";
  if (/sleeved\s*booster/.test(t)) return /\[set of|art\s*bundle/.test(t) ? "Sleeved Booster (Art Set)" : "Sleeved Booster";
  if (/(?:display|booster\s*box|sealed)\s*case|booster\s*display\s*case/.test(t)) return "Booster Case";
  if (/booster\s*box|booster\s*display|display\s*box|\bdisplay\b/.test(t)) return "Booster Box";
  if (/pre-?rift\s*event\s*kit/.test(t)) return "Pre-Rift Event Kit";
  if (/pre-?rift|event\s*kit|pre-?release\s*kit/.test(t)) return "Pre-Rift Kit";
  if (/bulk\s*runes/.test(t)) return /\bcase\b/.test(t) ? "Bulk Runes Case" : "Bulk Runes";
  if (/arcane\s*box\s*set|box\s*set/.test(t)) return "Box Set";
  // BEFORE the generic Bundle rule below, which would otherwise swallow the Player
  // Bundle on its bare "bundle" and file the two halves of one collection under
  // different product types. Two distinct types, not one: they are different
  // products at different prices ($360 vs $70) with different contents, and the
  // Signature Edition is the serialised/signed one people are actually searching for.
  if (T1_COLLECTION.test(t) && /signature\s*edition|signature\s*set/.test(t)) return "T1 Signature Edition";
  if (T1_COLLECTION.test(t) && /player\s*bundle/.test(t)) return "T1 Player Bundle";
  if (/vault\s*bundle|worlds\s*bundle|booster\s*bundle|\bbundle\b|gift\s*box/.test(t)) return "Bundle";
  // AFTER the Bundle rule, never before it: "Vault Bundle" is an existing product
  // that must keep typing as "Bundle". This catches the BARE "Vault" — a separate
  // SKU introduced with Radiance ("Riftbound … - Radiance Vault"), which until now
  // matched no product word at all and so was dropped at the door rather than
  // mis-typed. Found by testing the gate against real storefront titles.
  if (/\bvault\b/.test(t)) return "Vault";
  if (/two[-\s]?player|starter|precon/.test(t)) return "Starter Set";
  if (/\btin\b/.test(t)) return "Tin";
  if (/promo\s*pack/.test(t)) return "Promo Pack";
  if (/booster\s*pack|\bblister\b|\bpack\b/.test(t)) return "Booster Pack";
  return "Sealed";
}

/**
 * Does this URL actually serve an image? A HEAD is enough (the CDN answers 403 for
 * a product it has no asset for) and costs no bandwidth. Anything other than a 2xx
 * with an image content-type counts as missing — including a network error, since
 * "we could not confirm a real photo" and "there is no real photo" should both fall
 * back to the on-brand graphic rather than ship a broken tile.
 */
export async function imageExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", headers: UA });
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// Map a TCGplayer setName to our set code (null for cross-set promo products).
// Canonical implementation lives in lib/tcgplayer.ts — imported, not re-declared,
// so the two can't drift apart when a new set is added.

/**
 * Riftbound products from a WOOCOMMERCE store, in the Shopify shape this file
 * already parses (see lib/woocommerce.ts for why the adapter speaks that shape
 * rather than adding a second pipeline).
 *
 * Unlike the singles importer's equivalent this does NOT filter out sealed
 * categories — sealed is what this importer wants, so it takes every Riftbound
 * category the store has and lets looksSealed()/isRiftboundSealed() below do the
 * selecting, exactly as they do for a Shopify store's collections.
 */
async function fetchWooSealedProducts(store: RetailerInfo): Promise<ShopifyProd[]> {
  const allowed = await robotsAllows(store.base);
  if (!allowed("/wp-json/wc/store/v1/products")) return [];
  const categories = await discoverWooRiftboundCategories(store.base, store.collections ?? []);
  const out: ShopifyProd[] = [];
  const seen = new Set<number>();
  for (const [i, id] of categories.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    for (const p of await fetchWooCategory(store.base, id)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ title: decodeEntities(p.name), handle: p.slug, variants: wooVariants(p), url: p.permalink } as ShopifyProd);
    }
  }
  return out;
}

export async function importSealed(): Promise<number> {
  let count = 0;
  for (const store of RETAILER_LIST) {
    const cc = store.country ?? "AU";
    const seen = new Set<string>();
    const rows = new Map<string, any>(); // groupKey+store -> row (cheapest per store/product)
    let scraped = false; // did we actually read products (vs an empty/failed fetch)?

    // WooCommerce stores are read through the Store API instead of Shopify
    // collections — and for THIS importer they are the whole reason the adapter
    // exists. The 2026-08-23 eurozone sweep found the EU's WooCommerce shops
    // carry Riftbound SEALED and essentially no singles (one shop, one card,
    // across 41 stores with a Riftbound category), so the singles importer gets
    // almost nothing from them while this one gets a real EUR sealed market.
    //
    // Batched into ONE list rather than per-handle because the Store API is
    // queried by category id, and category discovery already de-duplicates.
    const batches: ShopifyProd[][] = [];
    if (store.platform === "woocommerce") {
      batches.push(await fetchWooSealedProducts(store));
    } else {
      // Auto-discover from the sitemap, but fall back to the store's configured
      // collections (some stores' sitemaps don't expose their collection handles —
      // some sealed stores were being skipped). Mirrors price-import.ts.
      let handles = await discoverCollections(store.base);
      handles = Array.from(new Set([...handles, ...(store.collections ?? [])]));
      if (!handles.length) continue;
      for (const handle of handles) batches.push(await fetchProducts(store.base, handle, cc));
    }

    for (const products of batches) {
      if (products.length) scraped = true;
      for (const p of products) {
        if (seen.has(p.handle)) continue;
        seen.add(p.handle);
        const title = p.title ?? "";
        if (!looksSealed(title)) continue;
        if (!isRiftboundSealed(title)) continue; // drop non-Riftbound + unreleased sets
        const priced = p.variants.filter((v) => parseFloat(v.price) > 0);
        if (!priced.length) continue;
        const avail = priced.filter((v) => v.available);
        const inStock = avail.length > 0;
        const pool = inStock ? avail : priced;
        const setCode = detectSet(title);
        const type = classifySealed(title);
        // Price-sanity: ignore variants priced implausibly low for the product type —
        // a $1 "deposit"/sample/add-on variant on a real Booster Case, or an outright
        // mis-listing. Taking the raw MIN across all variants otherwise surfaces e.g. a
        // $1.08 "Booster Case" at the top of the homepage's cheapest-sealed column.
        // If NO variant clears the per-type floor, the product is dropped entirely.
        const floor = sealedFloorCents(type);
        const inFloor = pool.filter((v) => Math.round(parseFloat(v.price) * 100) >= floor);
        if (!inFloor.length) continue;
        const priceCents = Math.round(Math.min(...inFloor.map((v) => parseFloat(v.price))) * 100);
        const groupKey = setCode ? `${setCode}|${type}` : title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
        const key = `${groupKey}|${store.key}`;
        const prev = rows.get(key);
        if (prev && (prev.inStock || !inStock) && prev.priceCents <= priceCents) continue;
        rows.set(key, {
          groupKey,
          title,
          productType: type,
          setCode,
          retailer: store.key,
          retailerName: store.name,
          priceCents,
          url: productUrl(store.base, p),
          imageUrl: p.images?.[0]?.src ?? null,
          country: cc,
          inStock,
        });
      }
    }
    // Refresh when the scrape succeeded — this also CLEARS stale rows when a
    // previously mis-detected single no longer matches (rows.size can be 0). If
    // the fetch failed entirely (no products at all), keep the existing rows.
    if (scraped) {
      await prisma.sealedListing.deleteMany({ where: { retailer: store.key } });
      if (rows.size) await prisma.sealedListing.createMany({ data: Array.from(rows.values()) });
      count += rows.size;
    }
  }

  // eBay sealed prices per market (best-effort; skips when rate-limited).
  //
  // This used to search the AU marketplace only and hardcode `country: "AU"` on
  // every row, which meant the US — our DEFAULT market and the largest share of
  // traffic — had NO eBay sealed listings at all. Its sealed comparison was
  // TCGplayer plus US Shopify stores, on the highest-value category we carry:
  // booster boxes are the biggest baskets on the site. That was a structural
  // zero, not a ranking problem, and no amount of placement work could reach it.
  //
  // Cost is not the reason it was AU-only: sealed is a few dozen product groups,
  // not the ~1,400-card singles catalogue, so a full market sweep across all
  // six markets (AU/US/UK/SG/CA/EU) is ~160 Browse calls against a ~4,400
  // budget. It is rounding error — which is why this list does not rotate the
  // way the singles pass now does (see EBAY_SEALED_MARKETS below).
  //
  // Deploys (push) set EBAY_REFRESH=false so they never spend eBay quota; only
  // scheduled / manual runs search eBay (and even then, within the live budget).
  //
  // ONCE A DAY, NOT EVERY RUN (2026-08-20). This import runs on every scheduled
  // invocation (twice daily, 07:00/19:00 UTC), unlike the singles pass which
  // gates itself on staleness. Sealed inventory does not move twice a day, so
  // the second run was pure waste — real Browse calls spent re-searching the
  // same ~30 product groups per market a few hours after the first pass already
  // refreshed them. Gated the same way singles is: due if the newest eBay-sealed
  // row is over 20h old, or EBAY_FORCE=1 bypasses it. The store-scrape and
  // TCGplayer halves above are UNCHANGED — they cost no Browse quota, so there is
  // no reason to make those any staler than the schedule already gives them.
  if (isEbayEnabled() && process.env.EBAY_REFRESH !== "false") {
    const newestEbaySealed = await prisma.sealedListing.findFirst({
      where: { retailer: { startsWith: "ebay" } },
      orderBy: { lastSeen: "desc" },
      select: { lastSeen: true },
    });
    const staleCutoff = new Date(Date.now() - 20 * 3600_000);
    const forced = process.env.EBAY_FORCE === "1";
    const due = forced || !newestEbaySealed || newestEbaySealed.lastSeen < staleCutoff;
    if (due) {
      await primeEbayBudget(); // respect the live daily quota for sealed searches too
      // Cross-market trusted-reference fallback (2026-09-01): a market with NO
      // local store/TCGplayer listing for a product — e.g. no current AU
      // stockist for an older set's booster box — used to fall back to the
      // flat per-type SEALED_MIN_CENTS floor alone, with no real price to
      // anchor against. That floor is a generic "not obviously an accessory"
      // sanity check, not a "not obviously a different, far-cheaper foreign
      // printing" one — a genuine Chinese-print box, undisclosed in an
      // all-English title from a seller eBay doesn't flag as China-based,
      // clears a flat $40 floor easily while trading for a fraction of what
      // the real English product does. Building this map ONCE, before the
      // market loop, and reusing getSealedGroups' own 15-minute memo (each
      // market gets fetched again inside refreshEbaySealedMarket below, for
      // its own market's search — same cache, no extra DB cost) means every
      // market can borrow another market's real reference price instead.
      const marketRefs = new Map<string, Map<string, { cents: number; currency: string }>>();
      for (const m of EBAY_SEALED_MARKETS) {
        const groups = await getSealedGroups(m.country);
        const currency = currencyOf(m.country);
        for (const g of groups) {
          const nonEbay = g.listings.filter((l) => !l.retailer.startsWith("ebay")).map((l) => l.priceCents);
          if (!nonEbay.length) continue;
          const byCountry = marketRefs.get(g.groupKey) ?? new Map<string, { cents: number; currency: string }>();
          byCountry.set(m.country, { cents: Math.min(...nonEbay), currency });
          marketRefs.set(g.groupKey, byCountry);
        }
      }
      for (const mkt of EBAY_SEALED_MARKETS) {
        if (isEbayRateLimited()) break;
        count += await refreshEbaySealedMarket(mkt, marketRefs);
      }
    } else {
      console.log("eBay sealed: skipped (refreshed within the last 20h).");
    }
  }

  // TCGplayer's official sealed catalogue (US market prices) — adds products the
  // store scrape misses (Champion Decks, cases, sleeved boosters, Pre-Rift kits,
  // Nexus Night packs). Isolated so a hiccup never fails the rest.
  try {
    count += await refreshTcgplayerSealed();
  } catch (e) {
    console.warn("TCGplayer sealed import failed:", e);
  }

  // Self-heal: drop any stored rows that no longer qualify (e.g. a store that
  // failed to re-scrape this run still holds an old mis-detected single, or rows
  // from before the filters tightened).
  await cleanupStaleSealed();

  // AFTER cleanup, not before: recording first-seen for a row cleanupStaleSealed
  // is about to delete would leave a permanent tracking entry for a product that
  // never actually qualified.
  await recordSealedFirstSeen();

  return count;
}

// Insert a first-seen row for every (groupKey, country) currently in
// SealedListing that doesn't already have one — see SealedGroupFirstSeen's
// schema comment for why this can't just be a column on SealedListing itself.
// skipDuplicates makes every already-tracked group a no-op, so a group's
// firstSeenAt is written exactly once and never moves again.
//
// GROUP BY via $queryRaw, deliberately not `findMany({ distinct: [...] })`:
// Prisma's `distinct` dedupes in the CLIENT, so the emitted SQL has no DISTINCT
// and no LIMIT — it drags back every SealedListing row just to compute a
// two-column pair list (see tests/prisma-client-side-distinct.test.ts for the
// 2026-08-22 incident this guards against; that test would fail this file).
export async function recordSealedFirstSeen(): Promise<void> {
  const pairs = await prisma.$queryRaw<{ groupKey: string; country: string }[]>`
    SELECT "groupKey", "country" FROM "SealedListing" GROUP BY "groupKey", "country"
  `;
  if (!pairs.length) return;
  await prisma.sealedGroupFirstSeen.createMany({ data: pairs, skipDuplicates: true });
}

// Sealed product types NOT worth an eBay call.
//
// A single booster pack is the one sealed product where an eBay listing tells a
// buyer nothing useful. The whole category on eBay is resellers breaking boxes,
// weighed/mapped packs and repacks — prices sit far above the per-pack cost of a
// box and bear no relation to the sealed-product market we are actually
// comparing. Every other type (boxes, cases, Proving Grounds, Champion Decks,
// bundles, Nexus Night packs, tins, starter sets) is a discrete product with a
// real secondary market, and those all keep their eBay search.
//
// "Sleeved Booster" is deliberately NOT here — classifySealed gives it its own
// type, it is a distinct collectable product, and it is not what this excludes.
const EBAY_SEALED_SKIP_TYPES = new Set(["Booster Pack"]);

export function ebaySealedWorthSearching(productType: string): boolean {
  return !EBAY_SEALED_SKIP_TYPES.has(productType);
}

/** The marketplaces sealed is searched on, in priority order. */
const EBAY_SEALED_MARKETS = [
  { country: "US", marketplace: "EBAY_US", retailer: "ebay_us" },
  { country: "AU", marketplace: "EBAY_AU", retailer: "ebay" },
  { country: "UK", marketplace: "EBAY_GB", retailer: "ebay_uk" },
  { country: "SG", marketplace: "EBAY_SG", retailer: "ebay_sg" },
  // Added 2026-08-20 — CA was the only tracked market with no eBay sealed
  // presence (singles derive CA from the US pass to skip a ~1,400-card
  // catalogue sweep, but sealed is only ~30 product groups here, so a REAL
  // native search is cheap enough — see the cost note above — and simpler
  // than an FX-converted synthetic like TCG_CA). Reuses EBAY_CA_RETAILER so
  // this shares an identity with the singles importer's "ebay_ca" retailer key
  // even though the derivation differs; both tables are independent, so
  // there's no collision risk in reusing the name.
  { country: "CA", marketplace: "EBAY_CA", retailer: EBAY_CA_RETAILER },
  // Added 2026-08-23 with the EU market, for the same reason CA was added above
  // and on the same cost argument: sealed is ~30 product groups, not a ~350-card
  // catalogue sweep, so a native EUR search is cheap. Note this list does NOT
  // rotate — unlike the singles pass, where EU takes turns with UK and SG (see
  // EBAY_ROTATING_MARKETS in price-import.ts). At ~30 groups a market it does
  // not need to; if that ever changes, this is the list to rotate, not that one.
  { country: "EU", marketplace: "EBAY_ES", retailer: "ebay_eu" },
] as const;

/**
 * One market's eBay sealed pass. Returns the number of rows written.
 *
 * Retailer keys match the singles importer (`ebay`, `ebay_us`, `ebay_uk`,
 * `ebay_sg`, `ebay_ca`) so every existing `retailer.startsWith("ebay")` test —
 * brand colouring, buy-button labels, affiliate tagging, the admin breakdown —
 * classifies these rows without a change.
 */
async function refreshEbaySealedMarket(
  mkt: (typeof EBAY_SEALED_MARKETS)[number],
  // Cross-market trusted-reference fallback — see its own build site in
  // importSealed() for why this exists. groupKey -> country -> that market's
  // OWN trusted (non-eBay) reference in ITS OWN currency; converted into
  // this market's currency only where it's actually borrowed, below.
  marketRefs: Map<string, Map<string, { cents: number; currency: string }>>,
): Promise<number> {
  let count = 0;
  // Groups are read for THIS market: the reference price below is compared
  // against listings priced in this marketplace's currency, and SealedListing
  // has no currency column — an AUD reference against a USD listing would
  // reject good listings and admit bad ones.
  const groups = await getSealedGroups(mkt.country);
  const mktCurrency = currencyOf(mkt.country);
  // Always attempt eBay for the per-set promo (Nexus Night) packs — even ones no
  // AU store currently lists (e.g. the Unleashed pack) — so they appear once
  // available, with an image pulled from the eBay listing.
  const NEXUS_SEEDS = [
    { groupKey: "OGN|Nexus Night Pack", setCode: "OGN", name: "Origins Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
    { groupKey: "SFD|Nexus Night Pack", setCode: "SFD", name: "Spiritforged Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
    { groupKey: "UNL|Nexus Night Pack", setCode: "UNL", name: "Unleashed Nexus Night Promo Pack", productType: "Nexus Night Pack", imageUrl: null as string | null },
  ];
  // The T1 Signature Edition, drawing-only via a Riot Merch Store giveaway (see
  // T1_COLLECTION's comment up top) — no store or TCGplayer will ever list it, so
  // like the Nexus seeds above, the ONLY way any of its three language editions
  // ever gets an eBay search run against it is by being seeded here explicitly.
  //
  // LANGUAGE IS PART OF THE GROUP KEY, deliberately: these are three physically
  // distinct products (different print runs inside an identical outer box, and
  // — because the drawing pool sizes differed — very different resale values).
  // Merging them under one groupKey would show, say, a Korean buyer's resale
  // price as though it were what the English edition goes for.
  //
  // setCode is null, NOT "T1S", even though the DB row for the base T1S CARDS
  // uses that code (prisma/manual-cards.json) — searchEbaySealed's setName
  // filter falls back to the raw code when SET_NAMES has no entry for it, which
  // would then require a real listing to literally say "T1S" (something no
  // seller ever writes). SET_NAMES has no T1S entry on purpose; leaving setCode
  // null here just skips that filter rather than mis-arming it.
  //
  // language activates searchEbaySealed's CN/KR override (see ebay.ts) —
  // WITHOUT it, the EN search's normal "reject anything foreign-looking" guards
  // (SEALED_EXCLUDE_EBAY's chinese|japanese|korean words, isForeignListing's
  // CJK/CN-location check) would throw out the Chinese and Korean listings
  // exactly as they're designed to for every OTHER product's search.
  const T1_SEEDS: { groupKey: string; setCode: string | null; name: string; productType: string; imageUrl: string | null; language?: "CN" | "KR" }[] = [
    { groupKey: "T1S|T1 Signature Edition|EN", setCode: null, name: "T1 2025 Worlds Champion Signature Edition", productType: "T1 Signature Edition", imageUrl: T1_GROUP_IMAGE["T1S|T1 Signature Edition|EN"] },
    // CN/KR query wording checked against real live listings on 2026-08-30 (e.g.
    // "Presale Chinese Riftbound x T1 2025 Worlds Champion Signature edition Box
    // Sealed", "2025 Riftbound Korean Worlds Champion T1 Signature Edition Box
    // Sealed Presale") — the language word leads (right after "Riftbound", which
    // searchEbaySealed prepends) and "Box" is added, both matching how sellers
    // actually title these, to help eBay's own relevance ranking surface them
    // within the 50-result window. The post-filters below (LANGUAGE_SIGNAL etc.)
    // are order-independent regexes, so this is query-side only.
    { groupKey: "T1S|T1 Signature Edition|CN", setCode: null, name: "Chinese T1 2025 Worlds Champion Signature Edition Box", productType: "T1 Signature Edition", imageUrl: T1_GROUP_IMAGE["T1S|T1 Signature Edition|CN"], language: "CN" },
    { groupKey: "T1S|T1 Signature Edition|KR", setCode: null, name: "Korean T1 2025 Worlds Champion Signature Edition Box", productType: "T1 Signature Edition", imageUrl: T1_GROUP_IMAGE["T1S|T1 Signature Edition|KR"], language: "KR" },
  ];
  const haveKeys = new Set(groups.map((g) => g.groupKey));
  // Trusted reference = cheapest NON-eBay (store/TCGplayer) price for the product, so
  // the eBay search can reject listings priced implausibly below the real product.
  const trustedRef = (g: SealedGroup): number | null => {
    // startsWith, not an exact match: now that eBay writes per-market retailer
    // keys, an exact `!== "ebay"` test would treat this market's own ebay_us /
    // ebay_uk / ebay_sg rows as a trusted reference and let last run's eBay
    // price validate this run's — exactly the self-reinforcing loop the
    // "trusted = non-eBay" rule exists to prevent.
    const nonEbay = g.listings.filter((l) => !l.retailer.startsWith("ebay")).map((l) => l.priceCents);
    if (nonEbay.length) return Math.min(...nonEbay);
    // No local reference for this market — borrow another market's, in
    // EBAY_SEALED_MARKETS' own priority order (US first, the dominant
    // TCGplayer-covered market), FX-converted into this market's currency.
    // Without this a market with zero local stockists for a product fell
    // back to the flat per-type floor alone, with nothing to catch a
    // realistically-priced-but-wrong listing — e.g. an undisclosed Chinese
    // print clearing a flat $40 AUD "Booster Box" floor with room to spare.
    const byCountry = marketRefs.get(g.groupKey);
    if (!byCountry) return null;
    for (const m of EBAY_SEALED_MARKETS) {
      if (m.country === mkt.country) continue;
      const ref = byCountry.get(m.country);
      if (ref) return convertCents(ref.cents, ref.currency, mktCurrency);
    }
    return null;
  };
  const searchList = [
    ...groups.map((g) => ({ groupKey: g.groupKey, setCode: g.setCode, name: g.name, productType: g.productType, imageUrl: g.imageUrl, language: undefined as "CN" | "KR" | undefined, referenceCents: trustedRef(g) })),
    ...NEXUS_SEEDS.filter((s) => !haveKeys.has(s.groupKey)).map((s) => ({ ...s, language: undefined as "CN" | "KR" | undefined, referenceCents: null as number | null })),
    ...T1_SEEDS.filter((s) => !haveKeys.has(s.groupKey)).map((s) => ({ ...s, referenceCents: null as number | null })),
  ].filter((g) => ebaySealedWorthSearching(g.productType));
  const ebayRows: any[] = [];
  let truncated = false;
  for (const g of searchList) {
    if (isEbayRateLimited()) {
      truncated = true;
      break;
    }
    const r = await searchEbaySealed(g.name, g.productType, g.setCode, g.referenceCents, mkt.marketplace, g.language);
    if (!r) continue;
    ebayRows.push({
      groupKey: g.groupKey,
      title: r.title,
      productType: g.productType,
      setCode: g.setCode,
      retailer: mkt.retailer,
      retailerName: "eBay",
      priceCents: r.priceCents,
      url: r.url,
      imageUrl: r.imageUrl ?? g.imageUrl,
      country: mkt.country,
      inStock: true,
    });
  }
  // Delete is scoped to THIS market's retailer key. A single
  // `deleteMany({ retailer: "ebay" })` would now wipe another market's rows.
  // And, as in the singles pass, a run cut off by the budget keeps what is
  // already there rather than writing a partial set — a shrunken comparison
  // reads as "eBay has nothing" rather than "we ran out of quota".
  if (ebayRows.length > 0 && !truncated) {
    await prisma.sealedListing.deleteMany({ where: { retailer: mkt.retailer } });
    await prisma.sealedListing.createMany({ data: ebayRows });
    count += ebayRows.length;
    console.log(`eBay sealed ${mkt.country}: ${ebayRows.length} listings.`);
  } else if (truncated) {
    console.warn(
      `eBay sealed ${mkt.country}: budget ran out after ${ebayRows.length} of ${searchList.length} ` +
        `products — keeping existing rows rather than writing a partial set.`,
    );
  }
  return count;
}

// Pull TCGplayer's official sealed catalogue (US market prices) into SealedListing.
// TCGplayer is the dominant US marketplace and lists the full sealed line-up
// (booster displays/cases, Champion Decks, Nexus Night packs, Pre-Rift kits,
// sleeved boosters), so this fills the gaps the store scrape misses for the US.
export async function refreshTcgplayerSealed(): Promise<number> {
  let products;
  try {
    products = await fetchTcgplayerSealed();
  } catch (e) {
    console.warn("TCGplayer sealed fetch failed:", (e as Error).message);
    return 0;
  }
  // TCGplayer's image CDN is addressed BY PRODUCT ID, so tcgImageUrl() happily
  // builds a URL for a product it has no photo of — the CDN then answers 403
  // AccessDenied. Those fabricated URLs are non-null, so they beat the on-brand
  // type-correct fallback in getSealedGroups() and render as a broken tile
  // (observed on Origins Proving Grounds Box Set Case, Unleashed Nexus Night
  // Promo Pack and Riftbound Bulk Runes Case — case and promo SKUs are the usual
  // gaps). Probe once per product at import time and store null when there is no
  // real asset, so the fallback graphic can do its job.
  const imageUrls = new Map<number, string | null>();
  await mapLimit(products, 8, async (p) => {
    const url = tcgImageUrl(p.productId);
    imageUrls.set(p.productId, (await imageExists(url)) ? url : null);
  });
  const missing = [...imageUrls.values()].filter((v) => v === null).length;
  if (missing) console.log(`TCGplayer sealed: ${missing} product(s) have no CDN image — using type fallbacks.`);

  const rows: any[] = [];
  for (const p of products) {
    const title = (p.productName ?? "").trim();
    const market = p.marketPrice;
    if (!title || market == null || market <= 0) continue;
    // Pokémon's Astral Radiance, not Riftbound's Radiance — see FOREIGN_RADIANCE.
    if (FOREIGN_RADIANCE.test(title)) continue;
    const setCode = setCodeFromSetName(p.setName ?? "");
    const type = classifySealed(title);
    const groupKey = setCode ? `${setCode}|${type}` : title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    rows.push({
      groupKey,
      title,
      productType: type,
      setCode,
      retailer: "tcgplayer",
      retailerName: "TCGplayer",
      priceCents: Math.round(market * 100),
      url: tcgProductUrl(p),
      imageUrl: imageUrls.get(p.productId) ?? null,
      country: "US",
      inStock: true,
    });
  }
  await prisma.sealedListing.deleteMany({ where: { retailer: "tcgplayer" } });
  if (rows.length) await prisma.sealedListing.createMany({ data: rows });
  console.log(`TCGplayer sealed: ${rows.length} products.`);
  return rows.length;
}

// Delete stored sealed rows whose title should now be excluded — independent of
// scraping, so stale data gets cleaned even when a store didn't refresh.
export async function cleanupStaleSealed(): Promise<number> {
  const rows = await prisma.sealedListing.findMany({
    select: { id: true, title: true, retailer: true, productType: true, groupKey: true, country: true, priceCents: true },
  });
  // Trusted reference per market+product: the cheapest NON-eBay (store/TCGplayer) price.
  const trusted = new Map<string, number>();
  for (const r of rows) {
    if (r.retailer === "ebay") continue;
    const k = `${r.country}|${r.groupKey}`;
    const cur = trusted.get(k);
    if (cur == null || r.priceCents < cur) trusted.set(k, r.priceCents);
  }
  const ids = rows
    .filter((r) => {
      // Title filters — TCGplayer's official catalogue is trusted, never title-filter it.
      if (r.retailer !== "tcgplayer" && (!looksSealed(r.title) || !isRiftboundSealed(r.title))) return true;
      // Price-sanity (every source except TCGplayer's trusted catalogue): drop listings
      // priced implausibly below the trusted price / per-type floor — an accessory, a $1
      // deposit/sample variant, or a mis-listing that escaped the title filter.
      if (r.retailer !== "tcgplayer" && r.priceCents < sealedFloorCents(r.productType, trusted.get(`${r.country}|${r.groupKey}`) ?? null)) return true;
      return false;
    })
    .map((r) => r.id);
  if (ids.length) await prisma.sealedListing.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

import { msrpCents, isAtMsrp, overMsrpPct } from "@/lib/msrp";

export interface SealedGroup {
  groupKey: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  storeCount: number;
  // Availability-at-MSRP (A4): the RRP in the viewer's market (null if none
  // published), whether the cheapest in-stock listing is at/below it, and how
  // far over RRP that price sits (positive = scalped).
  msrpCents: number | null;
  atMsrp: boolean;
  overMsrpPct: number | null;
  // From SealedGroupFirstSeen (see that model's schema comment) — null only for a
  // group this table's own writer (recordSealedFirstSeen) hasn't caught up to yet,
  // which self-heals on the next import run. Powers /sealed's "Recently Added" sort.
  firstSeenAt: Date | null;
  listings: {
    retailer: string;
    retailerName: string;
    priceCents: number;
    url: string;
    inStock: boolean;
  }[];
}

// Group sealed listings by product for the /sealed page, for one market (AU/US).
//
// CACHED IN PROCESS MEMORY: this pulls the market's entire sealed table on
// every call — fetching it from Neon per request is the network-transfer
// pattern that burned through dexcompare's free-tier allowance. unstable_cache
// can't hold large items (2 MB limit fails silently — verified in the Next.js
// source; and because the payload is double-encoded on the way in, the real
// safe ceiling is nearer 1.2 MB raw, see the note in lib/db.ts), so it uses the
// same globalThis memo pattern as the games pool: one DB pull per market per
// warm lambda per TTL.
type SealedMemo = Map<string, { at: number; data: SealedGroup[] }>;
const sealedMemo: SealedMemo = ((globalThis as unknown as { __sealedGroups?: SealedMemo }).__sealedGroups ??= new Map());
const SEALED_MEMO_TTL_MS = 15 * 60_000;

// Authoritative product image per groupKey, from TCGplayer's official catalogue.
// Stores frequently reuse the BOOSTER BOX photo on their booster-PACK (and other)
// listings, so the cheapest listing's image is often wrong. TCGplayer publishes a
// correct per-product image, and the art is market-agnostic (a Spiritforged pack looks
// the same in every currency) — so we key it by groupKey and prefer it for all markets.
// Memoized (one small query per warm lambda per TTL) alongside the group memo.
type ImgMemo = { at: number; data: Map<string, string> };
async function getCanonicalSealedImages(): Promise<Map<string, string>> {
  const slot = globalThis as unknown as { __sealedCanonImg?: ImgMemo };
  const cached = slot.__sealedCanonImg;
  if (cached && Date.now() - cached.at < SEALED_MEMO_TTL_MS) return cached.data;
  const map = new Map<string, string>();
  try {
    const rows = await prisma.sealedListing.findMany({
      where: { retailer: "tcgplayer", imageUrl: { not: null } },
      select: { groupKey: true, imageUrl: true },
    });
    for (const r of rows) if (r.imageUrl && !map.has(r.groupKey)) map.set(r.groupKey, r.imageUrl);
  } catch {
    /* best-effort — fall back to per-listing images */
  }
  slot.__sealedCanonImg = { at: Date.now(), data: map };
  return map;
}

// First-seen timestamps from SealedGroupFirstSeen (see that model's schema
// comment for why this lives in its own table rather than a column on
// SealedListing). Keyed by `${groupKey}|${country}` to match how every group is
// already scoped per market. Memoized the same way as the canonical-image map.
type FirstSeenMemo = { at: number; data: Map<string, Date> };
async function getSealedFirstSeen(): Promise<Map<string, Date>> {
  const slot = globalThis as unknown as { __sealedFirstSeen?: FirstSeenMemo };
  const cached = slot.__sealedFirstSeen;
  if (cached && Date.now() - cached.at < SEALED_MEMO_TTL_MS) return cached.data;
  const map = new Map<string, Date>();
  try {
    const rows = await prisma.sealedGroupFirstSeen.findMany({
      select: { groupKey: true, country: true, firstSeenAt: true },
    });
    for (const r of rows) map.set(`${r.groupKey}|${r.country}`, r.firstSeenAt);
  } catch {
    /* best-effort — a group with no row just sorts as null, not an error */
  }
  slot.__sealedFirstSeen = { at: Date.now(), data: map };
  return map;
}

// Image-source preference within a market: official catalogue > eBay > store photo.
const imageSourceRank = (retailer: string) => (retailer === "tcgplayer" ? 0 : retailer === "ebay" ? 1 : 2);

// On-brand, type-correct fallback thumbnails (original RiftCompare graphics in
// public/sealed/). Used ONLY when we lack an authoritative photo — see below. Keyed
// by productType; Champion Decks (which carry a name, e.g. "Champion Deck (Vex)") and
// any unmapped type fall through to the sensible defaults in sealedTypeImage().
const SEALED_TYPE_IMAGE: Record<string, string> = {
  "Booster Pack": "/sealed/sealed-pack.png",
  "Nexus Night Pack": "/sealed/sealed-pack.png",
  "Promo Pack": "/sealed/sealed-pack.png",
  "Sleeved Booster": "/sealed/sealed-pack.png",
  "Sleeved Booster (Art Set)": "/sealed/sealed-pack.png",
  "Booster Box": "/sealed/sealed-box.png",
  "Box Set": "/sealed/sealed-box.png",
  "Booster Case": "/sealed/sealed-case.png",
  "Proving Grounds Case": "/sealed/sealed-case.png",
  "Bulk Runes Case": "/sealed/sealed-case.png",
  "Proving Grounds": "/sealed/sealed-deck.png",
  "Starter Set": "/sealed/sealed-deck.png",
  // The one entry here that is a PHOTO of the real product rather than a RiftCompare
  // graphic. The T1 Signature Edition is drawing-only, so no store or TCGplayer
  // catalogue photo exists to out-rank it — a generic grey box would be the permanent
  // thumbnail otherwise. Self-hosted from Riot's own reveal render (public/
  // t1-worlds-cards/, same approach as the T1 card images in prisma/manual-cards.json).
  "T1 Signature Edition": "/t1-worlds-cards/t1-worlds-signature-edition.jpg",
  "Showdown Decks": "/sealed/sealed-deck.png",
  "Showdown Decks Display": "/sealed/sealed-box.png",
};
function sealedTypeImage(productType: string): string {
  if (/^Champion Deck/.test(productType)) return "/sealed/sealed-deck.png";
  return SEALED_TYPE_IMAGE[productType] ?? "/sealed/sealed-generic.png";
}
// Product types where stores routinely reuse the BOOSTER BOX photo on the listing, so
// a store-sourced image is untrustworthy — we replace it with our type-correct graphic
// (box/case/deck store photos are usually the real product, so those we keep).
const DISTRUST_STORE_IMAGE = new Set([
  "Booster Pack", "Nexus Night Pack", "Promo Pack", "Sleeved Booster", "Sleeved Booster (Art Set)",
]);

// Curated, verified thumbnails for the T1 Signature Edition's three language
// editions (see T1_SEEDS in refreshEbaySealedMarket below) — keyed by groupKey,
// not productType, because all three share one productType ("T1 Signature
// Edition") and must NOT share one image. Unlike SEALED_TYPE_IMAGE above, this
// ALWAYS wins over whatever photo a given eBay row carries (applied after the
// TCGplayer-canonical override in getAllSealedGroups, and nothing else can ever
// supply a row for these groupKeys — no store or catalogue sells a drawing-only
// product). A drawing-only collectible's eBay photos are exactly the kind this
// guards against: a reseller's own low-quality photo, an accessory-only shot, or
// — the one that actually matters here — the WRONG language's box.
//
// EN reuses the same official Riot Merch Store render SEALED_TYPE_IMAGE already
// falls back to (self-hosted, never hotlinked — see that entry's comment) but as
// a clean flattened product shot rather than the multi-item composite. CN is a
// self-hosted copy of a real listing photo for the Chinese edition. KR has no
// separate press photo available, so scripts/gen-t1-korean-thumbnail.ts composites
// a "한국어판" (Korean edition) ribbon onto the EN shot — the box itself carries no
// language marking, only the cards inside differ.
const T1_GROUP_IMAGE: Record<string, string> = {
  "T1S|T1 Signature Edition|EN": "/t1-worlds-cards/t1-signature-edition-box-en.jpg",
  "T1S|T1 Signature Edition|CN": "/t1-worlds-cards/t1-signature-edition-box-cn.jpg",
  "T1S|T1 Signature Edition|KR": "/t1-worlds-cards/t1-signature-edition-box-kr.jpg",
};
// Same rationale, for the tile NAME: without this a group's name is whatever the
// winning eBay listing happened to be titled (see the override loop below), which
// for a resold collectible is rarely a clean product name.
const T1_GROUP_NAME: Record<string, string> = {
  "T1S|T1 Signature Edition|EN": "T1 2025 Worlds Champion Signature Edition",
  "T1S|T1 Signature Edition|CN": "T1 2025 Worlds Champion Signature Edition (Chinese)",
  "T1S|T1 Signature Edition|KR": "T1 2025 Worlds Champion Signature Edition (Korean)",
};

// Every sealed group in a market, pre-orders included. Not exported: callers pick a
// side via getSealedGroups() (shipped) or getPreorderGroups() (not yet), so nothing
// can accidentally price an unshipped box as though it were on a shelf.
async function getAllSealedGroups(country: Country = DEFAULT_COUNTRY): Promise<SealedGroup[]> {
  const hit = sealedMemo.get(country);
  if (hit && Date.now() - hit.at < SEALED_MEMO_TTL_MS) return hit.data;
  // Only the fields the grouping uses — no point hauling unused columns.
  const rows = await prisma.sealedListing.findMany({
    where: { country },
    orderBy: { priceCents: "asc" },
    select: {
      groupKey: true, title: true, productType: true, setCode: true, imageUrl: true,
      retailer: true, retailerName: true, priceCents: true, url: true, inStock: true,
    },
  });
  const canonicalImg = await getCanonicalSealedImages();
  const firstSeen = await getSealedFirstSeen();
  const groups = new Map<string, SealedGroup>();
  const imgRank = new Map<string, number>(); // groupKey -> source rank of the chosen image
  for (const r of rows) {
    // Price-sanity guard: drop any listing priced implausibly low for its type (e.g. a
    // $1 "Booster Case"). Defends the live site against mis-priced rows already in the
    // DB — takes effect on the next memo refresh, before the importer re-cleans them.
    if (r.priceCents < sealedFloorCents(r.productType)) continue;
    let g = groups.get(r.groupKey);
    if (!g) {
      const setName = r.setCode ? SET_NAMES[r.setCode] ?? r.setCode : null;
      const name = !setName
        ? r.title
        : setName === r.productType
        ? setName
        : `${setName} ${r.productType}`;
      g = {
        groupKey: r.groupKey,
        name,
        productType: r.productType,
        setCode: r.setCode,
        imageUrl: null,
        lowestPriceCents: null,
        storeCount: 0,
        msrpCents: null,
        atMsrp: false,
        overMsrpPct: null,
        firstSeenAt: firstSeen.get(`${r.groupKey}|${country}`) ?? null,
        listings: [],
      };
      groups.set(r.groupKey, g);
    }
    // Pick the group thumbnail from the most authoritative source (TCGplayer > eBay >
    // store), not just the cheapest listing — stores reuse the box photo on pack
    // listings, so the cheapest image is often the wrong product.
    if (r.imageUrl) {
      const rank = imageSourceRank(r.retailer);
      const cur = imgRank.get(r.groupKey);
      if (cur == null || rank < cur) {
        g.imageUrl = r.imageUrl;
        imgRank.set(r.groupKey, rank);
      }
    }
    g.listings.push({ retailer: r.retailer, retailerName: r.retailerName, priceCents: r.priceCents, url: r.url, inStock: r.inStock });
  }
  // Override with the official TCGplayer catalogue image where we have one — correct
  // per-product art, market-agnostic, so it fixes markets (AU/UK) whose only
  // listings are store photos of the wrong product.
  for (const g of groups.values()) {
    const canon = canonicalImg.get(g.groupKey);
    if (canon) {
      g.imageUrl = canon;
      imgRank.set(g.groupKey, 0);
    }
  }
  // Same idea, stronger: the T1 Signature Edition groups (see T1_GROUP_IMAGE's
  // comment) have no catalogue to draw from at all, so THIS overrides even a
  // real eBay photo — a drawing-only collectible's eBay listings are exactly
  // where a wrong-language or accessory-only photo would otherwise slip through.
  // The name gets the same treatment for the same reason: without it, the tile
  // shows whatever a specific eBay seller happened to title their listing
  // ("Riftbound T1 Sig Ed CHINESE NEW SEALED Ships Fast!!") instead of a name
  // consistent with every other tile on the page.
  for (const g of groups.values()) {
    const img = T1_GROUP_IMAGE[g.groupKey];
    if (img) {
      g.imageUrl = img;
      imgRank.set(g.groupKey, 0);
    }
    const name = T1_GROUP_NAME[g.groupKey];
    if (name) g.name = name;
  }
  // Type-correct branded fallback: if the only image is a STORE photo of a pack-family
  // product (stores reuse the box photo on pack listings → the reported "pack shows a
  // box" bug), or we have no image at all, use our own on-brand, type-correct graphic
  // instead of a wrong/blank thumbnail. Authoritative photos (TCGplayer/eBay) are kept.
  for (const g of groups.values()) {
    const rank = imgRank.get(g.groupKey);
    const storeOnly = rank == null || rank >= 2;
    if (g.imageUrl == null || (storeOnly && DISTRUST_STORE_IMAGE.has(g.productType))) {
      g.imageUrl = sealedTypeImage(g.productType);
    }
  }
  const out = Array.from(groups.values()).map((g) => {
    g.listings.sort((a, b) => a.priceCents - b.priceCents);
    const inStock = g.listings.filter((l) => l.inStock);
    // Headline price comes from IN-STOCK listings only (null = sold out everywhere).
    g.lowestPriceCents = inStock[0]?.priceCents ?? null;
    g.storeCount = new Set(inStock.map((l) => l.retailerName)).size;
    // Availability-at-MSRP for this market — but NEVER for a set that hasn't
    // shipped. lib/msrp.ts is keyed by productType alone, so an unreleased set's
    // Booster Box would silently inherit the CURRENT set's published RRP and render
    // "at RRP" / "12% over RRP" badges about a product whose RRP nobody has
    // announced. That table's own header promises it "never guesses"; leaving these
    // null is how that promise is kept until a real Radiance RRP exists.
    const preorder = isPreorderSetCode(g.setCode);
    g.msrpCents = preorder ? null : msrpCents(g.productType, country);
    g.atMsrp = !preorder && g.lowestPriceCents != null && isAtMsrp(g.lowestPriceCents, g.productType, country);
    g.overMsrpPct =
      !preorder && g.lowestPriceCents != null ? overMsrpPct(g.lowestPriceCents, g.productType, country) : null;
    return g;
  });
  // Boxes/cases first, then by price.
  const order = [
    "Booster Box", "Booster Case", "Proving Grounds", "Proving Grounds Case", "Box Set",
    "Pre-Rift Event Kit", "Pre-Rift Kit", "Vault", "Bundle", "Starter Set",
    "Nexus Night Pack", "Promo Pack", "Sleeved Booster (Art Set)", "Sleeved Booster",
    "Booster Pack", "Bulk Runes Case", "Bulk Runes", "Tin", "Sealed",
  ];
  // Champion Decks slot between bundles and packs (display boxes before singles).
  const rank = (t: string) => {
    if (/champion deck/i.test(t)) return /display/i.test(t) ? 8.4 : 8.6;
    if (/showdown decks/i.test(t)) return /display/i.test(t) ? 8.3 : 8.5;
    const i = order.indexOf(t);
    return i < 0 ? 99 : i;
  };
  out.sort((a, b) => {
    const ra = rank(a.productType), rb = rank(b.productType);
    if (ra !== rb) return ra - rb;
    return (a.lowestPriceCents ?? 9e9) - (b.lowestPriceCents ?? 9e9);
  });
  sealedMemo.set(country, { at: Date.now(), data: out });
  return out;
}

/**
 * Sealed products a store can actually post you today — pre-orders excluded.
 *
 * This is the drop-in every existing caller already had: /sealed, the set pages and
 * the sealed JSON-LD keep behaving exactly as before, because a set that hasn't
 * shipped is filtered out here rather than at import. On release day
 * isPreorderSetCode() flips on the date alone and the set's listings appear in all
 * of them with no code change.
 */
export async function getSealedGroups(country: Country = DEFAULT_COUNTRY): Promise<SealedGroup[]> {
  const all = await getAllSealedGroups(country);
  return all.filter((g) => !isPreorderSetCode(g.setCode));
}

/**
 * The mirror image: ONLY products for sets that haven't shipped yet.
 *
 * Feeds /radiance-preorders. Returns [] the moment the set releases — the page then
 * says so and points at the live prices, rather than showing stale "pre-order" rows.
 */
export async function getPreorderGroups(country: Country = DEFAULT_COUNTRY): Promise<SealedGroup[]> {
  const all = await getAllSealedGroups(country);
  return all.filter((g) => isPreorderSetCode(g.setCode));
}
