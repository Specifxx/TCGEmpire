// One factual sentence group about a card's prices, built only from rows we
// hold. Every figure is one the price table below also shows.
import { formatMoney } from "../format";

export interface SummaryRow {
  retailer: string;
  retailerName: string;
  priceCents: number;
  lastSeen: string | null;
}

export interface PriceSummaryInput {
  name: string;
  place: string;
  currency: string;
  /** In-stock rows for the baseline market. */
  inStock: SummaryRow[];
  /** Cheapest out-of-stock price when nothing is in stock. */
  lastSeenCents: number | null;
  /** Every non-reference row for the card, all markets. */
  allRows: SummaryRow[];
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function cardPriceSummary(i: PriceSummaryInput): string {
  const fmt = (c: number) => formatMoney(c, i.currency);
  const parts: string[] = [];
  if (i.inStock.length) {
    const cheapest = i.inStock.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
    const max = Math.max(...i.inStock.map((r) => r.priceCents));
    const stores = new Set(i.inStock.map((r) => r.retailer)).size;
    parts.push(`The lowest in-stock price for ${i.name} in ${i.place} is ${fmt(cheapest.priceCents)} at ${cheapest.retailerName}.`);
    if (stores > 1 && max > cheapest.priceCents) {
      parts.push(`Across the ${stores} stores in ${i.place} with it in stock, prices range from ${fmt(cheapest.priceCents)} to ${fmt(max)}.`);
    }
  } else if (i.lastSeenCents != null) {
    parts.push(`No store in ${i.place} has ${i.name} in stock right now; the last price we saw was ${fmt(i.lastSeenCents)}.`);
  } else {
    parts.push(`No store in ${i.place} lists ${i.name} right now.`);
  }
  const tracked = new Set(i.allRows.map((r) => r.retailer)).size;
  if (tracked > 0) parts.push(`We track ${tracked} ${tracked === 1 ? "store" : "stores"} for this card across all markets.`);
  const times = i.allRows.map((r) => (r.lastSeen ? Date.parse(r.lastSeen) : NaN)).filter((t) => !Number.isNaN(t));
  if (times.length) parts.push(`Prices last checked ${DATE.format(new Date(Math.max(...times)))}.`);
  return parts.join(" ");
}
