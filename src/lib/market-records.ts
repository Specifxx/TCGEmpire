// All-time price records: the highest and lowest daily lows a card has ever
// recorded in a market, and how far today's price sits from that peak.
//
// WHY THIS IS ITS OWN FILE AND NOT A FUNCTION IN price-history.ts. Everything in
// price-history.ts answers "what happened in the last N days" and reads a WINDOW.
// A record is the opposite shape of question: it needs the WHOLE series, forever,
// for every card.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
// Two passes:
//
//   1. A ranking pass over one summary per card — {max, min, day count, newest
//      day} — from cardHistorySummaries().
//   2. The full series for ONLY the handful of cards actually being displayed,
//      to pin the exact day each record was first reached.
//
// Until 2026-10-03 these were a server-side groupBy and a bounded findMany
// against the Neon history project, shaped that way because the whole-series
// read was the unbounded kind that kept exhausting its transfer allowance. The
// history is now day files bundled with the release (lib/price-history-store.ts),
// read locally; the two passes stay because they are still the cheap way to
// rank, and the result is cached per history version so they run once per
// market per release.
import { prisma } from "./db";
import { cardHistoryRows, cardHistorySummaries, cardHistoryVersion } from "./price-history-store";
import { cardTileSelect, withStoreCounts } from "./cards";
import { DEFAULT_COUNTRY, type Country } from "./country";
import { cachedOrDirect, STALE_HISTORY_MS, historySource, dropBreakWindow, currentBasisStart } from "./price-history";
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
  /**
   * Cards sitting furthest below their own high ON THE CURRENT PRICING BASIS —
   * the value angle. All-time only when `currentSince` is null.
   */
  offPeak: RecordRow[];
  /** Cards at (or within a whisker of) their low on the current pricing basis. */
  atLow: RecordRow[];
  /**
   * ISO date the current pricing basis starts (lib/methodology-breaks.ts
   * currentBasisStart), or null when no methodology break has happened. The
   * off-peak and at-low boards measure only from here, and it never ages out
   * (dropBreakWindow always restarts at it), so a page must say "since <date>"
   * above those two boards, never "all-time".
   */
  currentSince: string | null;
  /** ISO date of the freshest point behind these numbers. */
  asOf: string | null;
};

const EMPTY: AllTimeRecords = { peaks: [], offPeak: [], atLow: [], currentSince: null, asOf: null };

/**
 * Minimum distinct days of history before a card can hold a "record".
 *
 * A card priced on three days has an all-time high by definition and it means
 * nothing — the phrase implies a history to be highest OF. Without this floor
 * the board fills with cards from the newest set every time one is added, which
 * is exactly the failure mode that makes a records page look broken.
 */
// Snapshot ROWS, not calendar days. While snapshots were weekly (2026-08-31 →
// 2026-10-03) three rows meant about three weeks; with daily snapshots again it
// would mean three days, so a card also needs MIN_SPAN_MS between its first and
// latest point: the two-week span three weekly rows always had.
const MIN_DAYS = 3;
const MIN_SPAN_MS = 14 * 86_400_000;
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
/**
 * The at-low board needs a real range to be at the bottom OF: the card's high on
 * the same basis must sit at least this far above its low. Without it a card
 * that has not moved for MIN_DAYS snapshots is "at its low" by
 * definition (peak = trough = now), and the board fills with flat bulk cards.
 * Same threshold the off-peak board uses for "well under its high".
 */
const AT_LOW_MIN_RANGE_PCT = 5;

/** How many rows each board shows. */
export const RECORDS_LIST_SIZE = 10;

/**
 * The two boards that compare today's price with a record, from rows already
 * restricted to the current pricing basis. Pure, so the thresholds are tested
 * directly (tests/methodology-breaks.test.ts).
 *   • off-peak: more than 5% under its high (and not so far under that it is
 *     a bad scraped row — MAX_OFF_PEAK_PCT), biggest gap first;
 *   • at-low: within AT_LOW_TOLERANCE_PCT of its low AND with a real range
 *     above that low (AT_LOW_MIN_RANGE_PCT), priciest first — so a card that
 *     simply has not moved is not "at its low".
 */
export function pickCurrentBoards(current: RecordRow[], limit: number): { offPeak: RecordRow[]; atLow: RecordRow[] } {
  const offPeak = current
    .filter((r) => r.offPeakPct > 5 && r.offPeakPct <= MAX_OFF_PEAK_PCT)
    .sort((a, b) => b.offPeakPct - a.offPeakPct)
    .slice(0, limit);
  const atLow = current
    .filter(
      (r) =>
        r.troughCents > 0 &&
        r.peakCents >= r.troughCents * (1 + AT_LOW_MIN_RANGE_PCT / 100) &&
        r.nowCents <= r.troughCents * (1 + AT_LOW_TOLERANCE_PCT / 100),
    )
    .sort((a, b) => b.peakCents - a.peakCents)
    .slice(0, limit);
  return { offPeak, atLow };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function computeAllTimeRecords(country: Country, limit: number): Promise<AllTimeRecords> {
  try {
    const { convert } = historySource(country);
    // ── Pass 1: rank every card on its summary. ──────────────────────────────
    // `days` is the card's number of recorded days (one point per card per
    // day), which is what MIN_DAYS gates on.
    const agg = cardHistorySummaries();
    if (!agg.length) return EMPTY;

    // Staleness guard, same rule and threshold as computePriceMovers: the
    // snapshot write is best-effort and has silently frozen for eleven days
    // before now. A records board is MORE dangerous when stale than a movers
    // list, because "all-time high" reads as a durable fact rather than a
    // this-week observation — so refuse to serve rather than publish a stale
    // peak as the current one. lastDay is free here; we already summarised.
    const freshest = agg.reduce<Date | null>((max, r) => (!max || r.lastDay > max ? r.lastDay : max), null);
    if (!freshest || Date.now() - freshest.getTime() > STALE_HISTORY_MS) return EMPTY;

    type Cand = { cardId: string; peak: number; trough: number; days: number };
    const cands: Cand[] = [];
    for (const r of agg) {
      // Converted immediately, same as pass 2 below — both use the same
      // `convert` closure, so the peak/trough EQUALITY match against pass 2's
      // points (further down) still holds: convert() is deterministic, so
      // convert(x) === convert(x) regardless of which pass read x first.
      const peak = convert(r.maxCents);
      const trough = convert(r.minCents);
      if (peak < MIN_CENTS) continue;
      if (r.days < MIN_DAYS || r.lastDay.getTime() - r.firstDay.getTime() < MIN_SPAN_MS) continue;
      cands.push({ cardId: r.cardId, peak, trough, days: r.days });
    }
    if (!cands.length) return EMPTY;

    // Shortlist BEFORE the detail pass, so pass 2 stays bounded by the page
    // size. Over-fetch 3× per board: the off-peak and at-low boards need each
    // card's CURRENT price, which only pass 2 can give, so some shortlisted
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

    // ── Pass 2: exact days + today's price, for the shortlist ONLY. ──────────
    const points = cardHistoryRows({ cardIds: ids });
    type Detail = { now: number; peakDay: string | null; troughDay: string | null };
    const detail = new Map<string, Detail>();
    const seriesById = new Map<string, { t: number; v: number }[]>();
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
      (seriesById.get(p.cardId) ?? seriesById.set(p.cardId, []).get(p.cardId)!).push({ t: p.day.getTime(), v });
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

    // Two row sets, one per kind of board:
    //   • `allTime` — the all-time highs board. A recorded peak is a fact about
    //     the series whatever basis it was recorded on, and a re-basing that
    //     LOWERED prices (2026-09-23) cannot fake a new high.
    //   • `current` — the two boards that COMPARE today's price with a record
    //     ("off their peak", "at their low"). Those only use points on the
    //     current pricing basis (dropBreakWindow): measured across the 09-23
    //     TCGplayer switch, every affected card read as 25% off its peak and at
    //     a fresh all-time low. A card needs MIN_DAYS points spanning
    //     MIN_SPAN_MS on the current basis before it can appear on them again, and a series that never
    //     reached the basis start (dropBreakWindow leaves those untouched) is
    //     left off: its "now" predates the basis, so "since <date>" would be
    //     false for it. Both boards are therefore records SINCE `basisStart`,
    //     not all-time — `currentSince` tells the page so.
    const basisStart = currentBasisStart(Date.now());
    const allTime: RecordRow[] = [];
    const current: RecordRow[] = [];
    for (const c of shortlist.values()) {
      const card = byId.get(c.cardId);
      const d = detail.get(c.cardId);
      if (!card || !d || d.now <= 0) continue;
      const offPeakPct = c.peak > 0 ? Math.round(((c.peak - d.now) / c.peak) * 1000) / 10 : 0;
      allTime.push({
        card,
        peakCents: c.peak,
        troughCents: c.trough,
        nowCents: d.now,
        peakDay: d.peakDay,
        troughDay: d.troughDay,
        offPeakPct: Math.max(0, offPeakPct),
        days: c.days,
      });

      const seg = dropBreakWindow(seriesById.get(c.cardId) ?? []);
      if (seg.length < MIN_DAYS || seg[seg.length - 1].t - seg[0].t < MIN_SPAN_MS) continue;
      if (basisStart != null && seg[0].t < basisStart) continue;
      let segPeak = seg[0];
      let segTrough = seg[0];
      for (const p of seg) {
        if (p.v > segPeak.v) segPeak = p; // strict: the FIRST day it was reached
        if (p.v < segTrough.v) segTrough = p;
      }
      if (segPeak.v < MIN_CENTS) continue;
      const segOffPeak = segPeak.v > 0 ? Math.round(((segPeak.v - d.now) / segPeak.v) * 1000) / 10 : 0;
      current.push({
        card,
        peakCents: segPeak.v,
        troughCents: segTrough.v,
        nowCents: d.now,
        peakDay: isoDay(new Date(segPeak.t)),
        troughDay: isoDay(new Date(segTrough.t)),
        offPeakPct: Math.max(0, segOffPeak),
        days: seg.length,
      });
    }
    if (!allTime.length) return EMPTY;

    const peaks = [...allTime].sort((a, b) => b.peakCents - a.peakCents).slice(0, limit);
    const { offPeak, atLow } = pickCurrentBoards(current, limit);

    return { peaks, offPeak, atLow, currentSince: basisStart != null ? isoDay(new Date(basisStart)) : null, asOf: isoDay(freshest) };
  } catch {
    // A records board is decoration on top of the market page. It must never be
    // the reason /market/records 500s — same policy as every other history read.
    return EMPTY;
  }
}

/**
 * All-time records for one market, cached per history version.
 *
 * Keyed on cardHistoryVersion(), like the market index and the movers feed: the
 * history only changes when a release brings new day files, so recomputing more
 * often would re-run both passes for a result that cannot have changed.
 */
export function getAllTimeRecords(
  country: Country = DEFAULT_COUNTRY,
  limit: number = RECORDS_LIST_SIZE,
): Promise<AllTimeRecords> {
  return cachedOrDirect(
    () => computeAllTimeRecords(country, limit),
    ["rc-all-time-records", country, String(limit), cardHistoryVersion()],
    { revalidate: 8 * 86400, tags: [HISTORY_TAG] },
  );
}
