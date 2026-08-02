// Pure per-market math for a card's store listings, shared by the SERVER card page
// (which renders the AU baseline + Product JSON-LD) and the CLIENT market section
// (which recomputes for the visitor's market after hydration). Client-safe: the
// only import is the UK fallback list; affiliate/shipping enrichment happens on the
// server before rows are serialized, so this file never drags server libs into the
// client bundle.
import { AU_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS } from "./constants";
import { COUNTRIES, type Country } from "./country";

// A serialized retailerPrice row, enriched server-side with everything the client
// needs (affiliate buy URL, shipping-policy URL, effective shipping) so the client
// bundle needs no retailer/affiliate tables.
export interface MarketRow {
  id: string;
  country: string;
  retailer: string;
  retailerName: string;
  priceCents: number;
  ship: number | null; // effective shipping (null = unknown / at checkout)
  condition: string | null;
  isFoil: boolean;
  inStock: boolean;
  lastSeen: string; // ISO — timeAgo() accepts strings
  buyHref: string; // affiliate-tagged outbound URL (country-independent)
  policyUrl: string | null; // store shipping-policy page, when verified
}

export interface ComputedRow extends MarketRow {
  delivered: number;
}

export interface MarketView {
  // THE market this view was computed for, and its ISO-4217 currency. Both are
  // returned rather than left for the caller to remember, because forgetting was
  // a real bug: /card/[id] computed its baseline with DEFAULT_COUNTRY (which had
  // been changed from "AU" to "US") but kept formatting the result as AUD and
  // describing it as "in Australia" — including in the Product JSON-LD, which
  // emitted priceCurrency:"AUD" over USD figures. Any surface that prints a
  // figure from this view MUST take its currency from here.
  market: Country;
  currency: string;
  prices: ComputedRow[]; // in stock, cheapest first
  outOfStock: ComputedRow[];
  lowest: number | null; // cheapest in-stock item price
  cheapestStandard: number | null;
  cheapestFoil: number | null;
  hasEbay: boolean; // any in-stock eBay listing in this market
  // DISTINCT in-stock stores — rows are unique per [retailer, condition, isFoil],
  // so counting rows would report one store's NM + foil listings as "2 stores".
  storeCount: number;
}

const minPrice = (rows: ComputedRow[]): number | null =>
  rows.reduce<number | null>((m, p) => (m == null || p.priceCents < m ? p.priceCents : m), null);

// Rank by ITEM price — postage is shown for transparency but must not decide which
// listing is cheapest (a store would be penalised vs eBay just because eBay's
// postage is known and the store's is "at checkout"); known postage breaks ties.
// Converted reference prices (TCGplayer-UK/AU/SG, Cardmarket) are NEVER shown as a
// buyable "store" in the main comparison — even when they're the only source for
// that market — because they're not real local retailers (e.g. TCGplayer doesn't
// operate as an AU store) and presenting them as one is misleading. They still
// exist in the DB for the Deal Finder / arbitrage tools, and TCGplayer's own market
// price is shown separately, clearly labeled as a reference (see CardMarketSection's
// TcgMarketPrice block) — just never blended into "N stores in your market".
export function computeMarket(rows: MarketRow[], country: Country): MarketView {
  const FALLBACK = [...AU_FALLBACK_RETAILERS, ...UK_FALLBACK_RETAILERS, ...SG_FALLBACK_RETAILERS];
  const source = rows.filter((r) => r.country === country && !FALLBACK.includes(r.retailer));
  const all: ComputedRow[] = source
    .map((p) => ({ ...p, delivered: p.priceCents + (p.ship ?? 0) }))
    .sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);
  const prices = all.filter((p) => p.inStock);
  const outOfStock = all.filter((p) => !p.inStock);
  return {
    market: country,
    currency: COUNTRIES[country].currency,
    prices,
    outOfStock,
    lowest: prices[0]?.priceCents ?? null,
    cheapestStandard: minPrice(prices.filter((p) => !p.isFoil)),
    cheapestFoil: minPrice(prices.filter((p) => p.isFoil)),
    hasEbay: prices.some((p) => p.retailer.startsWith("ebay")),
    storeCount: new Set(prices.map((p) => p.retailer)).size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Is it stocked anywhere else?" — the one rule three surfaces must agree on.
// ─────────────────────────────────────────────────────────────────────────────
// A card can be in stock in the US and nowhere else. Three places on the site
// described that situation, and all three said something different:
//
//   • the card-page header — "CHEAPEST PRICE —" / "IN STOCK AT 0 stores",
//     computed for the VISITOR's market but never saying which market that was
//   • the card-page About prose — "exactly one tracked store … US$91.06",
//     baked at the US baseline and (correctly) saying so
//   • the /browse tile — "No price yet" beside "1 store", mixing a
//     server-baked count for one country with a client-localised price for
//     another
//
// None of them were counting "across all tracked markets"; they were three
// different markets wearing the same words. The fix is not to make the numbers
// equal — they legitimately differ per market — but to make every surface name
// its market and say when stock exists somewhere else. These helpers are the
// shared implementation of that second half, so the rule cannot drift again.

/** Per-country cheapest-price columns as baked into a card list payload. */
export interface LocalisedLowest {
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
}

/** True when the card has a price in SOME tracked market. */
export function hasAnyMarketPrice(c: LocalisedLowest): boolean {
  return [
    c.lowestPriceCents,
    c.lowestPriceCentsNz,
    c.lowestPriceCentsUs,
    c.lowestPriceCentsUk,
    c.lowestPriceCentsSg,
    c.lowestPriceCentsCa,
  ].some((v) => v != null);
}

export type TileStock =
  | { kind: "stores"; count: number } // price and count are the same market
  | { kind: "elsewhere" } // no price here, but stocked in another market
  | { kind: "none" }; // not stocked anywhere we track

/**
 * What a card tile may claim about availability.
 *
 * `storeCount` is filtered SERVER-side to whichever country the query was built
 * for and baked into the payload; `lowest` is localised on the CLIENT to the
 * visitor's market. They describe the same market only when the server guessed
 * right — and a first-time visitor with no country cookie gets the server's
 * default while CountryProvider then geo-switches away from it. So the count is
 * only ever shown next to a price that came from the same render, and the
 * mismatch case is stated in words instead of as a number the visitor can't act
 * on.
 */
export function tileStock(lowest: number | null, storeCount: number, c: LocalisedLowest): TileStock {
  if (lowest != null) return storeCount > 0 ? { kind: "stores", count: storeCount } : { kind: "none" };
  return hasAnyMarketPrice(c) ? { kind: "elsewhere" } : { kind: "none" };
}

export interface ElsewhereStock {
  /** Distinct in-stock stores summed across the other markets. */
  stores: number;
  /** How many other markets have stock. */
  markets: number;
  /** Place name of the first such market, for the one-market phrasing. */
  first: string;
}

/**
 * Stock in markets OTHER than `country`, for the card page's header metrics.
 * Returns null when the visitor's own market has stock (nothing to disclaim) or
 * when nowhere else does.
 */
export function stockElsewhere(
  rows: MarketRow[],
  country: Country,
  others: readonly { code: Country; place: string }[],
): ElsewhereStock | null {
  const found = others
    .filter((c) => c.code !== country)
    .map((c) => ({ place: c.place, view: computeMarket(rows, c.code) }))
    .filter((x) => x.view.storeCount > 0);
  if (!found.length) return null;
  return {
    stores: found.reduce((n, x) => n + x.view.storeCount, 0),
    markets: found.length,
    first: found[0].place,
  };
}
