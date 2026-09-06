// WooCommerce Store API adapter — the second storefront platform this importer
// can read, alongside Shopify's /collections/<handle>/products.json.
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// The 2026-08-23 eurozone sweep found that Spain's Riftbound retail is
// overwhelmingly NOT on Shopify: ~150 Spanish shops surfaced, 9 were usable, and
// WooCommerce was the largest blocked bucket by a wide margin. Until this file
// existed those shops could not be added at all — see lib/pending-platforms.ts's
// header for why adding an unreadable store is WORSE than not listing it (a
// store page that never shows a price, failing silently).
//
// ── THE ENDPOINT ─────────────────────────────────────────────────────────────
// WordPress ships the Store API at /wp-json/wc/store/v1/*. It is the read half
// of WooCommerce's headless surface and is unauthenticated by design — the
// direct equivalent of Shopify's products.json, not a private admin API (that is
// /wp-json/wc/v3, which needs a key and is NOT what this uses). Individual shops
// can disable it; the probe checks that separately, because a 404 there is
// otherwise indistinguishable from "no stock".
//
// ── WHAT IT GIVES US THAT SHOPIFY DOESN'T ────────────────────────────────────
// The currency, on every product (`prices.currency_code`). Shopify's
// products.json carries no currency at all, which is why probe-eu-stores.ts has
// to re-fetch a product PAGE and read the currency back out of its JSON-LD. Here
// the feed states it, so a store serving the wrong currency is caught on the
// same call that reads the price.
//
// ── AND WHAT IT DOESN'T ──────────────────────────────────────────────────────
// Per-VARIATION prices. A `variable` product (the shape a shop uses when one
// listing carries Near Mint / Lightly Played / … as options) returns only a
// `price_range` {min,max}; getting each condition's real price needs one extra
// request per product. That matters because recording the minimum means
// recording a played copy's price where the store's headline price is the NM one
// — the exact bug conditionRank() exists to prevent on the Shopify path (a card
// showed $33 against a real $45). So variable products are handled explicitly in
// wooVariants() below rather than silently flattened.
import { SCRAPE_HEADERS as UA } from "./scrape-http";

export const WOO_STORE_API = "/wp-json/wc/store/v1";

export interface WooPrices {
  price: string;              // MINOR units, as a string: "420" = €4.20 at minor_unit 2
  regular_price: string;
  sale_price: string;
  price_range: { min_amount: string; max_amount: string } | null;
  currency_code: string;
  currency_minor_unit: number;
}

export interface WooProduct {
  id: number;
  name: string;               // may contain HTML entities — run through decodeEntities
  slug: string;
  type?: string;              // "simple" | "variable" | …
  is_in_stock: boolean;
  is_purchasable?: boolean;
  // The product's real page URL, per the shop's WordPress permalink structure.
  // Never construct one from the slug: these shops use /producto/<slug>/,
  // /tienda/<category>/<slug>/ and others, so a guessed path 404s.
  permalink: string;
  prices: WooPrices;
  variations?: { id: number; attributes: { name: string; value: string }[] }[];
}

// Product names come back HTML-escaped ("Riftbound &#8211; Vendetta"), and the
// card matcher reads titles character by character — an undecoded "&#8211;" is a
// literal in the middle of a collector number's surroundings and breaks matching
// for the whole store. Deliberately a small fixed table plus numeric escapes
// rather than a parser: this runs over tens of thousands of titles per import.
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

/**
 * A Woo minor-unit price string as the MAJOR-unit decimal string the rest of the
 * importer speaks ("420" @ minor_unit 2 → "4.20").
 *
 * minor_unit is read per product rather than assumed to be 2. It is 2 for every
 * currency this site prices in, but the field exists precisely because that is
 * not universal, and hard-coding it would turn a zero-decimal currency into a
 * 100× price rather than an error anyone would notice.
 */
export function wooPriceString(p: WooProduct): string {
  const minor = p.prices?.currency_minor_unit ?? 2;
  const raw = Number(p.prices?.price ?? "0");
  if (!Number.isFinite(raw)) return "0";
  return (raw / Math.pow(10, minor)).toFixed(minor);
}

/**
 * Does this product title look like a SINGLE card rather than sealed product?
 *
 * ── THIS IS THE STORE-QUALITY BAR, NOT A REPORTING NICETY ────────────────────
 * A store earns its place in RETAILERS by contributing PRICES, and the singles
 * importer only ever writes a price row when resolveCardId() matches a listing
 * to a card — which requires a collector number (or a name it can disambiguate).
 * A store with 200 in-stock "listings" that are all booster boxes, playmats and
 * tournament tickets contributes exactly zero to the comparison while counting
 * as a tracked store everywhere a human reads a number.
 *
 * That is not hypothetical: the first eurozone pass ranked candidates by RAW
 * in-stock product count and shipped 96 stores on it. Most of those counts were
 * sealed. Ranking on THIS function instead is what separates a store that prices
 * cards from a store that stocks boxes.
 *
 * Mirrors the collector-number shapes parseNumber() understands in
 * price-import.ts — "123/298", "OGN-181", the bare rune numbers "R01"/"R02a" —
 * and applies the same MULTI_CARD guard, because a playset or a lot carries a
 * SET price and the importer refuses it too. Deliberately a touch LOOSER than
 * resolveCardId (it cannot check the number against the real catalogue), so it
 * over-counts slightly; a bar set on an over-count is the safe direction.
 */
const SINGLE_NUMBER = /\d+[a-z*]*\s*\/\s*\d+|\b(OGN|OGS|SFD|UNL|VEN)\s*-\s*\d+|\bR\d{1,3}[a-z]?\b/i;
// Kept in step with MULTI_CARD in price-import.ts — a bundle is not a single.
const MULTI = /\b(playset|lot|lots|bundle|joblot|job lot|x\s*\d+|\d+\s*x|set of|complete set|full set|bulk)\b/i;

export function isSinglesTitle(title: string): boolean {
  return SINGLE_NUMBER.test(title) && !MULTI.test(title);
}

/**
 * The minimum number of in-stock SINGLES a store must carry to be worth adding.
 *
 * Below this a store is not a price source, it is a directory entry: it adds a
 * row to /stores/tracked, a store page thin enough to be noindexed, and one HTTP
 * request per import, in exchange for a handful of prices that any of the deep
 * catalogues already beat. Ten is the line because it is roughly where a store
 * starts to have more than a couple of sets' worth of chase cards — enough that
 * it can actually win a comparison on some card.
 *
 * Enforced by scripts/probe-eu-stores.ts, which is how a store gets added, and
 * pinned by tests/eu-store-quality.test.ts so the bar cannot be quietly lowered
 * by adding a store that never cleared it.
 */
export const MIN_SINGLES_FOR_STORE = 10;

/**
 * Collection handles a Riftbound singles catalogue is generated under, tried
 * DIRECTLY rather than waiting for sitemap discovery to name them.
 *
 * BinderPOS — the Shopify point-of-sale most TCG shops with a real singles
 * inventory run — generates one collection per game with a fixed handle and a
 * `product_type` of "<Game> Single". Every deep eurozone singles catalogue found
 * so far is one of these: Mana Market, Universe TCG, End Turn, El Duelista,
 * GS-GameOn, Trinket Mage, T-REX TCG, Timetwister, Nordic Legends.
 *
 * WHY THIS LIST HAS TO EXIST. discoverRiftboundCollections() reads
 * sitemap_collections, and a BinderPOS collection is frequently absent from it —
 * four of the nine stores above were REJECTED by a sitemap-only probe as having
 * no Riftbound collection, while serving 250 singles at a handle anyone could
 * have guessed. Sitemap discovery finding nothing is not evidence a store has
 * nothing; it is evidence the sitemap does not list it.
 *
 * Cheap to try: a handle that does not exist is one 404, and these are unioned
 * with discovery rather than replacing it.
 */
export const CONVENTIONAL_SINGLES_HANDLES = ["riftbound-single", "riftbound-singles"] as const;

/**
 * The condition/finish variants for one product, in the shape the Shopify path
 * already produces — so resolveCardId, conditionRank and the write side need no
 * WooCommerce-specific branch at all.
 *
 * SIMPLE products are one variant, which is the common case for TCG singles on
 * these shops: they list each condition as its own product.
 *
 * VARIABLE products are the case worth reading carefully. The Store API gives a
 * price_range, not per-variation prices, and using its MINIMUM would record a
 * played copy against the store's Near-Mint headline — the bug conditionRank()
 * exists to prevent. Fetching each variation is one extra request per product,
 * which across a ~1,400-card catalogue is a scrape this importer will not spend.
 *
 * So a variable product records its price_range MAXIMUM, under a synthetic "Near
 * Mint" variant title. That is not a guess dressed up: on these stores a single
 * listing's options ARE the condition ladder, and NM is its most expensive rung,
 * so the top of the range is the NM price. It is wrong for the rare listing whose
 * options are something else (a foil upsell, a language choice), and it is wrong
 * in the SAFE direction — quoting high loses a click, quoting low takes the sale
 * and breaks the promise the comparison is built on.
 */
export function wooVariants(p: WooProduct): { title: string; price: string; available: boolean }[] {
  const minor = p.prices?.currency_minor_unit ?? 2;
  const range = p.prices?.price_range;
  if (range) {
    const max = Number(range.max_amount);
    if (Number.isFinite(max)) {
      return [{ title: "Near Mint", price: (max / Math.pow(10, minor)).toFixed(minor), available: p.is_in_stock }];
    }
  }
  return [{ title: "", price: wooPriceString(p), available: p.is_in_stock }];
}

/**
 * Where a listing's "buy" link points.
 *
 * A Shopify product's page is always `${base}/products/${handle}`, so it carries
 * no url and this builds one. A WooCommerce product MUST carry its `permalink`:
 * its path is whatever the shop's WordPress permalink structure says
 * (/producto/<slug>/, /tienda/<category>/<slug>/, …), so the Shopify shape would
 * 404 on every outbound buy link — the click that earns the site money, pointed
 * at a dead page.
 *
 * Lives HERE rather than in price-import.ts because sealed-import.ts needs it
 * too, and sealed-import.ts is already imported BY price-import.ts — putting it
 * there would make the pair circular. Same reason EBAY_CA_RETAILER moved to
 * constants.ts on 2026-08-20.
 */
export function productUrl(base: string, p: { handle: string; url?: string }): string {
  return p.url ?? `${base}/products/${p.handle}`;
}

interface WooCategory { id: number; name: string; slug: string }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// Categories whose name/slug says sealed, an event ticket, or an accessory. The
// singles matcher would reject these anyway; skipping them up front is what keeps
// a store's scrape to a few hundred products instead of its whole catalogue.
// Spanish and Italian terms are in here because that is what these shops use.
const NON_SINGLE_CATEGORY =
  /sealed|booster|box|bundle|preorder|pre-?order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection|sobre|caja|mazo|display|deck|torneo|evento|ticket|entrada|bustine|mazzi/i;

/**
 * The Riftbound product categories on a Woo store, minus the sealed/accessory
 * ones — the equivalent of discoverRiftboundCollections() on the Shopify path,
 * and matched the same way: "riftbound", never bare "rift" (Pokémon's "Paradox
 * Rift" is on every one of these shops), against BOTH name and slug (Spanish
 * shops routinely slug in Spanish and name in English, or the reverse).
 */
export async function discoverWooRiftboundCategories(base: string, configuredSlugs: string[] = []): Promise<number[]> {
  const all: WooCategory[] = [];
  for (let page = 1; page <= 5; page++) {
    const cats = await getJson<WooCategory[]>(`${base}${WOO_STORE_API}/products/categories?per_page=100&page=${page}`);
    if (!cats || !cats.length) break;
    all.push(...cats);
    if (cats.length < 100) break;
  }
  // The Store API filters by category ID, but retailers.ts stores category SLUGS
  // (the same field Shopify stores use for collection handles, so one config
  // shape covers both platforms). Resolve any configured slug to its id here and
  // union it with discovery — a store whose category is named something discovery
  // does not recognise can still be reached by naming its slug in retailers.ts,
  // exactly as the Shopify path's `collections` fallback works.
  const wanted = new Set(configuredSlugs.map((s) => s.toLowerCase()));
  const ids = new Set<number>();
  for (const c of all) {
    const label = `${c.name} ${c.slug}`;
    if (wanted.has(c.slug.toLowerCase())) ids.add(c.id);
    else if (/riftbound/i.test(label) && !NON_SINGLE_CATEGORY.test(label)) ids.add(c.id);
  }
  return [...ids];
}

/** Every product in one Woo category, paginated. */
export async function fetchWooCategory(base: string, categoryId: number, maxPages = 10): Promise<WooProduct[]> {
  const out: WooProduct[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const ps = await getJson<WooProduct[]>(`${base}${WOO_STORE_API}/products?per_page=100&page=${page}&category=${categoryId}`);
    if (!ps || !ps.length) break;
    out.push(...ps);
    if (ps.length < 100) break;
  }
  return out;
}
