import { prisma } from "./db";

// Demand history. Card.searchCount / Card.viewCount are cumulative running totals
// (no per-event log), so the ONLY way to measure demand VELOCITY — the leading
// indicator of a near-future price move — is to snapshot those totals daily and diff
// them. This mirrors PriceHistory: written once per Australia/Sydney day by the
// importer, a same-day re-run replaces the day's rows.
//
// Every function here is guarded: until the DemandSnapshot table exists in prod (it
// ships on the next `prisma db push` deploy) and a few days have accrued, reads
// return empty and the predictor simply omits the velocity component.

// Calendar day (date-only) in Australia/Sydney — same bucketing as PriceHistory.
function sydneyDay(d = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

// Record today's cumulative demand totals for every card. Called by the daily price
// import (co-located with the PriceHistory write). Best-effort: never throws.
export async function snapshotDemand(): Promise<number> {
  try {
    const day = sydneyDay();
    const cards = await prisma.card.findMany({ select: { id: true, searchCount: true, viewCount: true } });
    if (!cards.length) return 0;
    // One row per card per day: clear today's rows, then bulk insert (a same-day
    // re-run — e.g. the twice-daily cron — refreshes the snapshot to the latest total).
    await prisma.demandSnapshot.deleteMany({ where: { day } });
    await prisma.demandSnapshot.createMany({
      data: cards.map((c) => ({ cardId: c.id, day, searchCount: c.searchCount, viewCount: c.viewCount })),
    });
    return cards.length;
  } catch (e) {
    console.warn("snapshotDemand skipped:", (e as Error).message);
    return 0;
  }
}

export interface DemandVelocity {
  // Extra searches/views per day over the window (the cumulative totals' slope).
  searchPerDay: number;
  viewPerDay: number;
  // Total growth over the window as a % of the starting level (attention acceleration).
  searchGrowthPct: number | null;
  spanDays: number; // days between the first and last snapshot used
  points: number; // snapshots available for this card
}

// Per-card demand velocity from the last `days` of snapshots. Guarded → empty Map
// (and the predictor treats every card's velocity as absent) if the table doesn't
// exist yet or nothing has accrued. A card needs ≥2 snapshots spanning ≥1 day.
export async function getDemandVelocity(cardIds: string[], days = 21): Promise<Map<string, DemandVelocity>> {
  const out = new Map<string, DemandVelocity>();
  if (!cardIds.length) return out;
  try {
    const cutoff = sydneyDay(new Date(Date.now() - days * 86400_000));
    const rows = await prisma.demandSnapshot.findMany({
      where: { cardId: { in: cardIds }, day: { gte: cutoff } },
      orderBy: { day: "asc" },
      select: { cardId: true, day: true, searchCount: true, viewCount: true },
    });
    const byCard = new Map<string, { t: number; s: number; v: number }[]>();
    for (const r of rows) {
      (byCard.get(r.cardId) ?? byCard.set(r.cardId, []).get(r.cardId)!).push({
        t: r.day.getTime(),
        s: r.searchCount,
        v: r.viewCount,
      });
    }
    for (const [cardId, pts] of byCard) {
      if (pts.length < 2) continue;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const spanDays = (last.t - first.t) / 86400_000;
      if (spanDays < 1) continue;
      const searchGrowthPct = first.s > 0 ? Math.round(((last.s - first.s) / first.s) * 1000) / 10 : null;
      out.set(cardId, {
        searchPerDay: Math.round(((last.s - first.s) / spanDays) * 100) / 100,
        viewPerDay: Math.round(((last.v - first.v) / spanDays) * 100) / 100,
        searchGrowthPct,
        spanDays: Math.round(spanDays),
        points: pts.length,
      });
    }
  } catch (e) {
    console.warn("getDemandVelocity skipped:", (e as Error).message);
  }
  return out;
}

export interface DemandWindowRow {
  cardId: string;
  searches: number; // searches accrued INSIDE the window
  views: number;
}

export interface DemandWindowResult {
  rows: DemandWindowRow[]; // every card with >0 activity in the window, unsorted
  baselineDay: Date | null; // snapshot day used as the window's start (null = none old enough)
  coveredDays: number | null; // real days from baseline to now — may be < requested
  totalDays: number; // distinct snapshot days on record at all
}

// Demand accrued WITHIN a time window, for the admin demand leaderboard.
//
// Card.searchCount/viewCount are cumulative running totals, so "searches in the
// last 7 days" is not a column we can filter — it's a SUBTRACTION: today's total
// minus the total as of the snapshot taken 7 days ago. That makes the answer only
// as good as the snapshot coverage, which is why this returns baselineDay /
// coveredDays / totalDays alongside the numbers: the caller must be able to say
// "these are really the last 5 days, not the 7 you asked for" rather than quietly
// presenting a shorter (or all-time) window under the requested label.
//
// Ranking is exact, not a top-N approximation: both sides are id + two integers,
// so diffing EVERY card costs a few hundred KB and avoids the trap of ranking a
// window by cumulative totals (a card huge all-time but flat this week would
// otherwise crowd out a genuinely spiking one).
export async function getDemandWindow(days: number): Promise<DemandWindowResult> {
  const empty: DemandWindowResult = { rows: [], baselineDay: null, coveredDays: null, totalDays: 0 };
  try {
    const totalDays = await demandSnapshotDays();
    if (totalDays === 0) return empty;

    // The most recent snapshot at or before the window's start. Snapshots are
    // daily, so a 24h window resolves to "since yesterday's snapshot" — daily is
    // the finest resolution this data supports, by construction.
    const cutoff = sydneyDay(new Date(Date.now() - days * 86400_000));
    const baseline = await prisma.demandSnapshot.findFirst({
      where: { day: { lte: cutoff } },
      orderBy: { day: "desc" },
      select: { day: true },
    });
    // No snapshot that old — the requested window predates our history entirely.
    if (!baseline) return { ...empty, totalDays };

    const [baseRows, live] = await Promise.all([
      prisma.demandSnapshot.findMany({
        where: { day: baseline.day },
        select: { cardId: true, searchCount: true, viewCount: true },
      }),
      prisma.card.findMany({
        where: { OR: [{ searchCount: { gt: 0 } }, { viewCount: { gt: 0 } }] },
        select: { id: true, searchCount: true, viewCount: true },
      }),
    ]);

    const base = new Map(baseRows.map((r) => [r.cardId, r]));
    const rows: DemandWindowRow[] = [];
    for (const c of live) {
      const b = base.get(c.id);
      // A card with no baseline row is NEW since the window opened, so all of its
      // current total accrued inside the window. Math.max guards the theoretical
      // case of a counter being reset backwards.
      const searches = Math.max(0, c.searchCount - (b?.searchCount ?? 0));
      const views = Math.max(0, c.viewCount - (b?.viewCount ?? 0));
      if (searches > 0 || views > 0) rows.push({ cardId: c.id, searches, views });
    }

    const coveredDays = Math.max(
      0,
      Math.round((Date.now() - baseline.day.getTime()) / 86400_000)
    );
    return { rows, baselineDay: baseline.day, coveredDays, totalDays };
  } catch (e) {
    console.warn("getDemandWindow skipped:", (e as Error).message);
    return empty;
  }
}

// How many distinct snapshot days exist at all (drives the "velocity active" status
// in the admin tool). 0 until the table ships / accrues. Guarded.
export async function demandSnapshotDays(): Promise<number> {
  try {
    const rows = await prisma.demandSnapshot.findMany({ distinct: ["day"], select: { day: true }, take: 400 });
    return rows.length;
  } catch {
    return 0;
  }
}
