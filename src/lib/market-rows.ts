// Pure per-market math for a card's store listings, shared by the SERVER card page
// (which renders the AU baseline + Product JSON-LD) and the CLIENT market section
// (which recomputes for the visitor's market after hydration). Client-safe: the
// only import is the UK fallback list; affiliate/shipping enrichment happens on the
// server before rows are serialized, so this file never drags server libs into the
// client bundle.
import { UK_FALLBACK_RETAILERS } from "./constants";
import type { Country } from "./country";

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
// Converted UK reference prices (TCGplayer-UK / Cardmarket) are fallbacks only:
// hidden whenever a real GBP listing exists, kept when they're the only UK source.
export function computeMarket(rows: MarketRow[], country: Country): MarketView {
  const mine = rows.filter((r) => r.country === country);
  const ukHasRealGbp =
    country === "UK" && mine.some((p) => p.inStock && !UK_FALLBACK_RETAILERS.includes(p.retailer));
  const source = ukHasRealGbp ? mine.filter((p) => !UK_FALLBACK_RETAILERS.includes(p.retailer)) : mine;
  const all: ComputedRow[] = source
    .map((p) => ({ ...p, delivered: p.priceCents + (p.ship ?? 0) }))
    .sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);
  const prices = all.filter((p) => p.inStock);
  const outOfStock = all.filter((p) => !p.inStock);
  return {
    prices,
    outOfStock,
    lowest: prices[0]?.priceCents ?? null,
    cheapestStandard: minPrice(prices.filter((p) => !p.isFoil)),
    cheapestFoil: minPrice(prices.filter((p) => p.isFoil)),
    hasEbay: prices.some((p) => p.retailer.startsWith("ebay")),
    storeCount: new Set(prices.map((p) => p.retailer)).size,
  };
}
