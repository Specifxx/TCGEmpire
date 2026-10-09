// How much price history each tier sees (2026-10-09, owner). Signed out and free
// accounts see the last FREE_HISTORY_DAYS on a card's chart; Plus and Premium see
// the whole series and can download it as CSV. DECISIONS.md, "Full price history
// and CSV for Plus".
//
// This is a convenience gate, not a secret: the series is public data, published
// day by day in data/price-history/ and through the documented open API
// (/api/v1/card/[id]/history.json, left as it is). What Plus buys is the full
// chart on the card page and a one-click download, not exclusive data.
import type { PricePoint } from "./price-history";

export const FREE_HISTORY_DAYS = 30;
const DAY_MS = 86_400_000;

/** The free window: points from the last FREE_HISTORY_DAYS. */
export function recentWindow(points: PricePoint[], now: number = Date.now()): PricePoint[] {
  const cutoff = now - FREE_HISTORY_DAYS * DAY_MS;
  return points.filter((p) => p.t >= cutoff);
}

/** When the hidden, older part of the series starts, or null if there is none. */
export function olderFrom(points: PricePoint[], now: number = Date.now()): number | null {
  const cutoff = now - FREE_HISTORY_DAYS * DAY_MS;
  return points.length && points[0].t < cutoff ? points[0].t : null;
}

/** The CSV a member downloads: one row per day, the price in major units. */
export function historyCsv(points: PricePoint[], opts: { card: string; market: string; currency: string }): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["date,card,market,currency,lowest_price"];
  for (const p of points) {
    lines.push([new Date(p.t).toISOString().slice(0, 10), esc(opts.card), opts.market, opts.currency, (p.v / 100).toFixed(2)].join(","));
  }
  return lines.join("\n") + "\n";
}
