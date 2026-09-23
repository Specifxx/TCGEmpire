import { TCGPLAYER_MARKET_RETAILER } from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
// "Give me TCGplayer's US MARKET price for these cards" — one rule, four readers.
// ─────────────────────────────────────────────────────────────────────────────
// Since 2026-09-23 the US "tcgplayer" row is the cheapest English Near-Mint
// listing (a buyable price) and the market price lives in its own reference row,
// TCGPLAYER_MARKET_RETAILER. Four consumers want the market price and nothing
// else: the eBay value floor, the Deal Finder's TCGplayer benchmark, Box EV and
// the overseas reference block.
//
// WHY A FALLBACK TO THE OLD ROW, rather than reading only the new key. The price
// import reads the eBay value floor BEFORE its own TCGplayer step runs, so on the
// first run after this shipped there were no market rows yet. Reading only the new
// key would have made every card look unpriced — and "unknown value is not low
// value" (price-import.ts) means every card would have been kept for an eBay
// call, blowing that run's quota. So: per card, the market rows if it has any,
// otherwise whatever "tcgplayer" rows it has. Once the refresh has written the
// market rows the fallback is inert, but it stays — it is also what covers a card
// whose market-row write was refused by refreshTcgplayerPrices' coverage guard.
//
// Deliberately free of heavy imports (only constants), so Box EV's page can use
// it without dragging the importer's module graph into its server bundle.

/** Retailer keys a market-price reader should query. */
export const TCG_US_MARKET_READ_KEYS = [TCGPLAYER_MARKET_RETAILER, "tcgplayer"] as const;

/**
 * Keep, for each card, its market-price rows when it has any, else its legacy
 * "tcgplayer" rows. Input is whatever the caller queried with
 * TCG_US_MARKET_READ_KEYS; order within a card is preserved.
 */
export function preferMarketRows<T extends { cardId: string; retailer: string }>(rows: readonly T[]): T[] {
  const hasMarket = new Set<string>();
  for (const r of rows) if (r.retailer === TCGPLAYER_MARKET_RETAILER) hasMarket.add(r.cardId);
  return rows.filter((r) => (hasMarket.has(r.cardId) ? r.retailer === TCGPLAYER_MARKET_RETAILER : r.retailer === "tcgplayer"));
}
