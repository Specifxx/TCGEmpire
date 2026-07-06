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
