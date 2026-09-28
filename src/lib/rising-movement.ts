import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { sydneyDayKey } from "./price-history";
import { movementFromRanks, type Movement } from "./demand-movement";
import { isLegacySnapshot, type RisingSnapshotData } from "./rising-snapshot";
import type { RiseScope } from "./rise-predictor";

// ─────────────────────────────────────────────────────────────────────────────
// Chart movement for Rising Cards and the Hot 40 (2026-09-28): each pick's
// place against LAST WEEK'S CHART.
// ─────────────────────────────────────────────────────────────────────────────
// Rising Cards re-ranks daily and keeps no history of its own rankings. The
// charts that DO persist are the Hot 40 snapshots the owner mints, frozen with
// every pick in rank order, so "last week's chart" is the most recent snapshot
// for the same market minted at least PREVIOUS_CHART_MIN_AGE_DAYS ago:
//   • a snapshot minted today compares with last week's, as a weekly chart does,
//     and minting twice in one week never compares a chart with itself;
//   • the live pages compare today's ranking with that same chart.
// Only version-2 payloads count: legacy ones were ranked by the pre-2026-09-25
// method, and a rank under a different method is not a place to move from.
//
// NO CHART, NO MOVEMENT — AND NOTHING BLOCKS. A market with no earlier chart
// (the first week, a legacy-only history, or a failed read) gets no arrows and
// says so; minting a snapshot never waits on this.

export const PREVIOUS_CHART_MIN_AGE_DAYS = 6;
const DAY_MS = 86_400_000;

/** The previous chart, reduced to what movement needs. Plain JSON (it is cached). */
export interface PreviousChart {
  createdAt: string; // ISO
  count: number; // how many picks it held (the "Hot N")
  ranks: [cardId: string, rank: number][];
}

/** Uncached read. Throws on a failed query — the callers decide what that means. */
export async function loadPreviousChart(scope: RiseScope, now: number): Promise<PreviousChart | null> {
  const row = await prisma.risingSnapshot.findFirst({
    where: { scope, createdAt: { lte: new Date(now - PREVIOUS_CHART_MIN_AGE_DAYS * DAY_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, data: true },
  });
  if (!row) return null;
  const data = row.data as unknown as RisingSnapshotData | null;
  // Legacy payloads predate every v2 one, so an older row can't be v2 either.
  if (!data || !Array.isArray(data.picks) || isLegacySnapshot(data)) return null;
  return {
    createdAt: row.createdAt.toISOString(),
    count: data.picks.length,
    ranks: data.picks.map((p, i) => [p.id, i + 1]),
  };
}

/**
 * Cached for the live pages: one row read per market per day (the cutoff moves
 * daily, and a newly minted snapshot is not "last week's" for six days anyway).
 * /tools/rising and /admin/rising are force-dynamic, so the TTL undercuts no
 * page segment (egress rule 5). Self-cached: call it directly, never inside
 * another unstable_cache (tests/nested-cache.test.ts). A failed read shows no
 * movement rather than failing the page.
 */
export async function getPreviousRisingChart(scope: RiseScope): Promise<PreviousChart | null> {
  try {
    return await unstable_cache(() => loadPreviousChart(scope, Date.now()), ["rc-rising-prev-chart-v1", scope, sydneyDayKey()], {
      revalidate: 86400,
    })();
  } catch (e) {
    console.warn(`[rising-movement] previous chart for ${scope} unavailable:`, (e as Error).message);
    return null;
  }
}

/** Movement for a ranking (card ids in rank order) against the previous chart; null without one. */
export function movementAgainst(order: readonly string[], prev: PreviousChart | null): Map<string, Movement> | null {
  return prev ? movementFromRanks(order, new Map(prev.ranks)) : null;
}
