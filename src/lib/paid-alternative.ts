import { isPaidLink } from "./affiliate";

// ─────────────────────────────────────────────────────────────────────────────
// "or US$X on TCGplayer" under the phone's Cheapest block (2026-10-27, owner:
// more eBay and TCGplayer clicks, "because it's actually cheaper").
//
// Most store links earn nothing, and in the US TCGplayer is the cheapest source
// on about half the cards; on most of the rest its cheapest listing is within a
// few percent of the cheapest store (data/public/listings, 2026-10-27: 282 of the
// 639 US cards a store wins are within 10%, 406 within 25%). Below lg the top
// block shows one store and one Buy button, so a buyer who would rather check
// out on TCGplayer or eBay had to scroll the whole comparison to find it.
//
// The rule: when the cheapest in-stock listing is NOT a paid link, name the
// cheapest one that IS, if its item price is within PAID_ALTERNATIVE_BAND of the
// cheapest. It is a real row of the same comparison, quoted at its real price
// with how much more it costs; it is never called cheaper and never reorders
// anything. When the cheapest row already pays, there is nothing to add.
// ─────────────────────────────────────────────────────────────────────────────

/** At most 20% above the cheapest in-stock item price. */
export const PAID_ALTERNATIVE_BAND = 1.2;

export interface PricedRow {
  priceCents: number;
  buyHref: string;
}

/** `prices` cheapest first, as computeMarket returns them. */
export function paidAlternative<T extends PricedRow>(
  prices: T[],
  isPaid: (href: string) => boolean = isPaidLink,
): { row: T; pctMore: number } | null {
  const best = prices[0];
  if (!best || isPaid(best.buyHref)) return null;
  const row = prices.find((p) => isPaid(p.buyHref));
  if (!row || row.priceCents > best.priceCents * PAID_ALTERNATIVE_BAND) return null;
  const pctMore = best.priceCents > 0 ? Math.round(((row.priceCents - best.priceCents) / best.priceCents) * 100) : 0;
  return { row, pctMore };
}

/** "TCGplayer", "eBay" or the store's own name. */
export function paidAlternativeName(retailer: string, retailerName: string): string {
  if (retailer.startsWith("ebay")) return "eBay";
  if (retailer.startsWith("tcgplayer")) return "TCGplayer";
  return retailerName;
}
