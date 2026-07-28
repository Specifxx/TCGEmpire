// Pure per-market math for a card's store listings, shared by the SERVER card page
// (which renders the AU baseline + Product JSON-LD) and the CLIENT market section
// (which recomputes for the visitor's market after hydration). Client-safe: the
// only import is the UK fallback list; affiliate/shipping enrichment happens on the
// server before rows are serialized, so this file never drags server libs into the
// client bundle.
import { AU_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS } from "./constants";
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
    prices,
    outOfStock,
    lowest: prices[0]?.priceCents ?? null,
    cheapestStandard: minPrice(prices.filter((p) => !p.isFoil)),
    cheapestFoil: minPrice(prices.filter((p) => p.isFoil)),
    hasEbay: prices.some((p) => p.retailer.startsWith("ebay")),
    storeCount: new Set(prices.map((p) => p.retailer)).size,
  };
}
