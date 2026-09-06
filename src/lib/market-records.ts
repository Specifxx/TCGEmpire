// All-time price records: the highest and lowest daily lows a card has ever
// recorded in a market, and how far today's price sits from that peak.
//
// WHY THIS IS ITS OWN FILE AND NOT A FUNCTION IN price-history.ts. Everything in
// price-history.ts answers "what happened in the last N days" and reads a WINDOW
// (computePriceMovers pulls 21 days for the whole market, and that bounded window
// is load-bearing — see its WINDOW_DAYS note about history-DB egress). A record
// is the opposite shape of question: it needs the WHOLE series, forever, for
// every card. Pulling that the same way movers does would read the entire
// PriceHistory table on every recompute, which is precisely the unbounded read
// that has exhausted this project's Neon transfer allowance repeatedly.
//
// ── THE EGRESS SHAPE, WHICH IS THE WHOLE DESIGN ─────────────────────────────
// Two queries, and neither scales with the history table:
//
//   1. A groupBy that aggregates SERVER-SIDE. Postgres scans the market's rows
//      and returns one row per card — ~1,400 tiny rows carrying {cardId, max,
//      min, count}, regardless of whether the table holds 45,000 rows or
//      5,000,000. The scan is the database's problem; the WIRE is what we pay
//      for, and the wire is bounded by the CATALOGUE, not by history depth.
//   2. One findMany for ONLY the handful of cards actually being displayed, to
//      pin the exact day each record was first reached. Bounded by the page
//      size (~30 cards × ~90 days of small rows), not by the catalogue.
//
// Everything is then day-cached, so the two queries run once per market per
// Sydney day no matter how many visitors the page gets.
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { cardTileSelect, withStoreCounts } from "./cards";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { cachedOrDirect, sydneyWeekKey, STALE_HISTORY_MS, historySource } from "./price-history";
import { HISTORY_TAG } from "./revalidate-content";
import type { CardTileData } from "@/components/CardTile";

export type RecordRow = {
  card: CardTileData;
  /** Highest daily-low ever recorded for this card in this market, in its cents. */
  peakCents: number;
  /** Lowest daily-low ever recorded. */
  troughCents: number;
  /** The most recent recorded point — "today's" price as history sees it. */
  nowCents: number;
  /** ISO date (YYYY-MM-DD) the peak was FIRST reached, or null if unresolvable. */
  peakDay: string | null;
  /** ISO date the trough was first reached. */
  troughDay: string | null;
  /** How far below the peak today sits, as a positive percentage. 0 = at the peak. */
  offPeakPct: number;
  /** Distinct days of history behind this record — the confidence signal. */
  days: number;
};

export type AllTimeRecords = {
  /** Highest prices ever recorded, biggest first — the "records board". */
  peaks: RecordRow[];
  /** Cards sitting furthest below their own all-time high — the value angle. */
  offPeak: RecordRow[];
  /** Cards at (or within a whisker of) their all-time low. */
  atLow: RecordRow[];
  /** ISO date of the freshest point behind these numbers. */
  asOf: string | null;
};

const EMPTY: AllTimeRecords = { peaks: [], offPeak: [], atLow: [], asOf: null };

/**
 * Minimum distinct days of history before a card can hold a "record".
 *
 * A card priced on three days has an all-time high by definition and it means
 * nothing — the phrase implies a history to be highest OF. Without this floor
 * the board fills with cards from the newest set every time one is added, which
 * is exactly the failure mode that makes a records page look broken.
 */
// Snapshot ROWS, not calendar days — and snapshots are weekly now, so 14 would
// mean fourteen weeks and empty every records table until December.
const MIN_DAYS = 3;
/** Below this, a percentage move is noise on a bulk common. Matches price-history. */
const MIN_CENTS = 300;
/**
 * Outlier guard, same reasoning as computePriceMovers' OUTLIER_DROP: a card
 * showing ≥90% below its own all-time high is nearly always one bad scraped row
 * that got recorded as a peak, not a real collapse. Publishing it as a record
 * would headline our own data error.
 */
const MAX_OFF_PEAK_PCT = 90;
/** Within this of the all-time low counts as "at" it — prices wobble by cents. */
const AT_LOW_TOLERANCE_PCT = 2;

/** How many rows each board shows. */
export const RECORDS_LIST_SIZE = 10;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function computeAllTimeRecords(country: Country, limit: number): Promise<AllTimeRecords> {
  try {
    const { source, convert } = historySource(country);
    // ── Query 1: rank every card by aggregate, server-side. ──────────────────
    // _count is the day count (one row per card/country/day by the model's
    // unique key), which is what MIN_DAYS gates on.
    const agg = await dbHistory.priceHistory.groupBy({
      by: ["cardId"],
      where: { country: source },
      _max: { lowestPriceCents: true, day: true },
      _min: { lowestPriceCents: true },
      _count: { _all: true },
    });
    if (!agg.length) return EMPTY;

    // Staleness guard, same rule and threshold as computePriceMovers: the
    // snapshot write is best-effort and has silently frozen for eleven days
    // before now. A records board is MORE dangerous when stale than a movers
    // list, because "all-time high" reads as a durable fact rather than a
    // this-week observation — so refuse to serve rather than publish a stale
    // peak as the current one. _max.day is free here; we already aggregated.
    const freshest = agg.reduce<Date | null>((max, r) => {
      const d = r._max.day;
      return d && (!max || d > max) ? d : max;
    }, null);
    if (!freshest || Date.now() - freshest.getTime() > STALE_HISTORY_MS) return EMPTY;

    type Cand = { cardId: string; peak: number; trough: number; days: number };
    const cands: Cand[] = [];
    for (const r of agg) {
      // Converted immediately, same as query 2 below — both use the same
      // `convert` closure, so the peak/trough EQUALITY match against query 2's
      // rows (further down) still holds: convert() is deterministic, so
      // convert(x) === convert(x) regardless of which query read x first.
      const peak = r._max.lowestPriceCents == null ? null : convert(r._max.lowestPriceCents);
      const trough = r._min.lowestPriceCents == null ? null : convert(r._min.lowestPriceCents);
      if (peak == null || trough == null) continue;
      if (peak < MIN_CENTS) continue;
      if (r._count._all < MIN_DAYS) continue;
      cands.push({ cardId: r.cardId, peak, trough, days: r._count._all });
    }
    if (!cands.length) return EMPTY;

    // Shortlist BEFORE the detail query, so query 2 stays bounded by the page
    // size. Over-fetch 3× per board: the off-peak and at-low boards need each
    // card's CURRENT price, which only query 2 can give, so some shortlisted
    // rows will be filtered out afterwards and the lists must not come up short.
    const over = limit * 3;
    const byPeak = [...cands].sort((a, b) => b.peak - a.peak).slice(0, over);
    // Candidates for "furthest below peak" are ranked here on the peak/trough
    // SPREAD as a proxy — the true off-peak figure needs today's price, which we
    // do not have yet. A card whose peak and trough are close cannot possibly be
    // far below its peak, so this cannot exclude a real answer.
    const bySpread = [...cands]
      .filter((c) => c.trough > 0)
      .sort((a, b) => (b.peak - b.trough) / b.peak - (a.peak - a.trough) / a.peak)
      .slice(0, over);
    const shortlist = new Map<string, Cand>();
    for (const c of [...byPeak, ...bySpread]) shortlist.set(c.cardId, c);
    const ids = [...shortlist.keys()];

    // ── Query 2: exact days + today's price, for the shortlist ONLY. ─────────
    const points = await dbHistory.priceHistory.findMany({
      where: { country: source, cardId: { in: ids } },
      orderBy: { day: "asc" },
      select: { cardId: true, day: true, lowestPriceCents: true },
    });
    type Detail = { now: number; peakDay: string | null; troughDay: string | null };
    const detail = new Map<string, Detail>();
    for (const id of ids) detail.set(id, { now: 0, peakDay: null, troughDay: null });
    for (const p of points) {
      const c = shortlist.get(p.cardId);
      const d = detail.get(p.cardId);
      if (!c || !d) continue;
      const v = convert(p.lowestPriceCents);
      // Rows arrive oldest→newest, so the LAST write wins for `now` and the
      // FIRST match wins for each record day — which is the "first reached"
      // semantic, not "most recently touched".
      d.now = v;
      if (d.peakDay == null && v === c.peak) d.peakDay = isoDay(p.day);
      if (d.troughDay == null && v === c.trough) d.troughDay = isoDay(p.day);
    }

    // Hydrate tiles for everything we might show, in one operational-DB read.
    // withStoreCounts for the same reason computePriceMovers uses it: CardTile
    // re-prices to the visitor's own market on the client, so a tile hydrated
    // for one market still needs every market's in-stock count or it shows one
    // market's price beside another's store count.
    const cards = await withStoreCounts(
      await prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) })
    );
    const byId = new Map(cards.map((c) => [c.id, c as unknown as CardTileData]));

    const rows: RecordRow[] = [];
    for (const c of shortlist.values()) {
      const card = byId.get(c.cardId);
      const d = detail.get(c.cardId);
      if (!card || !d || d.now <= 0) continue;
      const offPeakPct = c.peak > 0 ? Math.round(((c.peak - d.now) / c.peak) * 1000) / 10 : 0;
      rows.push({
        card,
        peakCents: c.peak,
        troughCents: c.trough,
        nowCents: d.now,
        peakDay: d.peakDay,
        troughDay: d.troughDay,
        offPeakPct: Math.max(0, offPeakPct),
        days: c.days,
      });
    }
    if (!rows.length) return EMPTY;

    const peaks = [...rows].sort((a, b) => b.peakCents - a.peakCents).slice(0, limit);
    const offPeak = rows
      .filter((r) => r.offPeakPct > 5 && r.offPeakPct <= MAX_OFF_PEAK_PCT)
      .sort((a, b) => b.offPeakPct - a.offPeakPct)
      .slice(0, limit);
    const atLow = rows
      .filter((r) => r.troughCents > 0 && r.nowCents <= r.troughCents * (1 + AT_LOW_TOLERANCE_PCT / 100))
      .sort((a, b) => b.peakCents - a.peakCents)
      .slice(0, limit);

    return { peaks, offPeak, atLow, asOf: isoDay(freshest) };
  } catch {
    // A records board is decoration on top of the market page. It must never be
    // the reason /market/records 500s — same policy as every other history read.
    return EMPTY;
  }
}

/**
 * Day-cached all-time records for one market.
 *
 * Cached on the Sydney day key, exactly like the market index and the movers
 * feed: PriceHistory gains at most one point per card per day, so recomputing
 * more often than daily would re-run both queries for a result that cannot have
 * changed. CONTENT_TAG so a price import's revalidateContent() still refreshes
 * it the moment new data lands.
 */
export function getAllTimeRecords(
  country: Country = DEFAULT_COUNTRY,
  limit: number = RECORDS_LIST_SIZE,
): Promise<AllTimeRecords> {
  return cachedOrDirect(
    () => computeAllTimeRecords(country, limit),
    ["rc-all-time-records", country, String(limit), sydneyWeekKey()],
    { revalidate: 8 * 86400, tags: [HISTORY_TAG] },
  );
}
