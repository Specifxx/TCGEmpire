// LAST KNOWN PRICE (2026-10-18, owner: "a card doesn't have a price … we make it a
// different color, and in very fine print, it's like last known price").
//
// WHAT IT IS. When the card page's headline has nothing to show (no listing in
// stock in its market and no out-of-stock listing to call "last seen"), the
// newest day in the card's own public price history (data/price-history/,
// lib/price-history-store.ts) stands in for the em dash: muted, never the price
// accent, with the words "Last known price · 12 Sep 2026" under it. The quick
// view's price box does the same.
//
// THE SERIES. The one the page's own chart draws for that market:
// getPriceHistory(cardId, market), i.e. the GLOBAL card series converted with
// historySource() into the market's currency. There is no other per-card
// history to read: since 2026-09-05 every market reads that one series, the
// cheapest in-stock price across AU, US, UK and SG converted to US cents, and
// the site presents it as each market's "Price history". Like the headline it is
// one figure across finishes (the history never split by finish), and it is
// keyed by card id, so another printing's points never enter it.
//
// WHEN, AND THE ONE GUARD THE SHARED SERIES NEEDS. Only where the slot is empty,
// and only while NO market has the card in stock. Because the series is the
// cheapest of four markets, a card in stock in Australia today has today's
// Australian price as its newest point; shown in the US headline that would be
// another market's live price wearing a "last known" label. With nothing in
// stock anywhere, the newest point is genuinely the last price we recorded. A
// card stocked elsewhere keeps "—" and the store tile's "N stores in …" line,
// which is the better answer for it.
//
// WHERE IT MUST NEVER GO. It is a guide, not a price anyone can pay today: never
// a sort key, ranking, filter, index, mover, deal, alert, basket, collection
// value, eBay comparison, "cheapest"/"from" claim, JSON-LD offer, title, meta
// description, share image, sitemap or index decision, and never written into
// the public data. That is why it has its own name (`lastKnown…`) and its own
// shape rather than filling `lowest`, and why tests/last-known-price.test.ts
// fails when a file outside the display path starts reading it.
//
// Client-safe: imported by the card page's client islands and the quick view.
import { isFallbackRetailer } from "./constants";
import { computeMarket, type MarketRow } from "./market-rows";
import type { Country } from "./country";

export type LastKnownPrice = {
  /** The recorded price, in the slot's currency (minor units). NOT a live price. */
  cents: number;
  /** The Sydney calendar day it was recorded, YYYY-MM-DD. */
  day: string;
};

/** A point of a card's history series: `t` is the day (UTC midnight of the Sydney date), `v` the price. */
type RecordedPoint = { t: number; v: number };

/**
 * The newest day with a price in one card's series (getPriceHistory's points,
 * already one card and one market's currency). null when there is none.
 */
export function newestRecordedPrice(points: readonly RecordedPoint[] | null | undefined): LastKnownPrice | null {
  let best: RecordedPoint | null = null;
  for (const p of points ?? []) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.v) || p.v <= 0) continue;
    if (!best || p.t > best.t) best = p;
  }
  if (!best) return null;
  return { cents: Math.round(best.v), day: new Date(best.t).toISOString().slice(0, 10) };
}

/** Any listing in stock in any market, reference rows (converted TCGplayer/Cardmarket figures) aside. */
export function inStockAnywhere(rows: readonly { inStock: boolean; retailer: string }[]): boolean {
  return rows.some((r) => r.inStock && !isFallbackRetailer(r.retailer));
}

/**
 * The gate: the recorded price may stand in only where the slot shows nothing
 * and no market has the card in stock (see the header for why "no market").
 */
export function lastKnownPrice(input: {
  /** True when the slot would otherwise render "—". */
  slotIsEmpty: boolean;
  /** Every market's listings for the card. */
  rows: readonly { inStock: boolean; retailer: string }[];
  /** newestRecordedPrice() of the slot's market series. */
  recorded: LastKnownPrice | null;
}): LastKnownPrice | null {
  if (!input.slotIsEmpty || !input.recorded) return null;
  if (inStockAnywhere(input.rows)) return null;
  return input.recorded;
}

/**
 * The card page's headline (CardPriceMetrics, pinned to `market`): empty when
 * computeMarket has neither a live price nor a "last seen" listing for it.
 * `points` is getPriceHistory(card.id, market), the series the page's chart draws.
 */
export function cardHeadlineLastKnown(
  rows: MarketRow[],
  market: Country,
  points: readonly RecordedPoint[] | null | undefined,
): LastKnownPrice | null {
  const m = computeMarket(rows, market);
  return lastKnownPrice({
    slotIsEmpty: m.lowest == null && m.lastSeen == null,
    rows,
    recorded: newestRecordedPrice(points),
  });
}

// "12 Sep 2026", the card page's date form (lib/content/card-narrative.ts),
// spelled out by hand: Intl's en-GB month names differ between ICU versions
// ("Sep" / "Sept"), and this string is rendered on the server and again on
// hydration.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function lastKnownDayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** The fine print under the muted figure. Text, so it never relies on colour alone. */
export function lastKnownLabel(day: string): string {
  return `Last known price · ${lastKnownDayLabel(day)}`;
}

/** The longer explanation, for a tooltip. */
export function lastKnownTitle(day: string): string {
  return (
    `No store we track has this card in stock. This is the lowest in-stock price we recorded for it on ` +
    `${lastKnownDayLabel(day)} (our price history: the cheapest of the Australian, US, UK and Singapore stores ` +
    `that day), shown as a guide, not a price you can pay today.`
  );
}
