// Most-searched / most-viewed cards over a window — the ranking /admin/demand
// has given the site owner since launch. Its public surface is the free "Most
// searched this week" strip on /movers (2026-09-25); it used to be the Premium
// Demand Finder, which left the product that day (/tools/demand 301s to
// /movers#most-searched).
//
// Deliberately a DIFFERENT lens from Rising Cards, not a duplicate of it.
// Rising Cards is a composite signal (demand is only one of its inputs,
// blended with price timing so a card that's already spiked gets penalised).
// This is raw attention — searches and views, full stop.
//
// Card.searchCount / Card.viewCount are cumulative running totals with no
// per-event log (see lib/demand-snapshot.ts's own header), so "top cards in
// the last 7 days" is a SUBTRACTION against a daily snapshot, not a filter —
// getDemandWindowOrThrow() does that diffing; this module ranks, hydrates and caches.
// The counters themselves are guarded against inflation in lib/card-views.ts.
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { CONTENT_TAG } from "./revalidate-content";
import { sydneyDayKey } from "./price-history";
import { getDemandWindowOrThrow } from "./demand-snapshot";

// Generous cap computed once per (window, day) and sliced for every caller —
// the /movers strip shows ten — so a shorter list never pays for a second scan.
const SCAN_LIMIT = 50;

// NARROW, and the same for every market (2026-09-25). This used to be
// cardTileSelect(country), whose per-market in-stock _count subquery nothing
// rendered and which forced the cache key to carry the country, so the same
// country-agnostic ranking was computed once per market. Demand is global;
// every market's price column is here, so a reader prices the row for its own
// market at render time (pickPrice).
export const DEMAND_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  setCode: true,
  collectorNumber: true,
  variant: true,
  isPromo: true,
  rarity: true,
  imageThumbUrl: true,
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsEu: true,
  searchCount: true,
  viewCount: true,
} satisfies Prisma.CardSelect;

export type DemandCard = Prisma.CardGetPayload<{ select: typeof DEMAND_CARD_SELECT }>;

export interface DemandPick {
  card: DemandCard;
  searches: number; // shown count — windowed if the window is usable, else all-time
  views: number;
  allTimeSearches: number;
  allTimeViews: number;
}

export interface DemandResult {
  bySearch: DemandPick[];
  byView: DemandPick[];
  windowUsable: boolean; // false when the window fell back to all-time
  coveredDays: number | null; // real days the window actually covers
  totalDays: number; // distinct snapshot days on record at all
}

function fetchTiles(ids: string[]) {
  return prisma.card.findMany({ where: { id: { in: ids } }, select: DEMAND_CARD_SELECT });
}

function toPick(c: DemandCard, searches?: number, views?: number): DemandPick {
  return {
    card: c,
    searches: searches ?? c.searchCount,
    views: views ?? c.viewCount,
    allTimeSearches: c.searchCount,
    allTimeViews: c.viewCount,
  };
}

async function computeAllTime(limit: number): Promise<DemandResult> {
  const select = DEMAND_CARD_SELECT;
  const [bySearchRows, byViewRows] = await Promise.all([
    prisma.card.findMany({ where: { searchCount: { gt: 0 } }, orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }], take: limit, select }),
    prisma.card.findMany({ where: { viewCount: { gt: 0 } }, orderBy: [{ viewCount: "desc" }, { searchCount: "desc" }], take: limit, select }),
  ]);
  return {
    bySearch: bySearchRows.map((c) => toPick(c)),
    byView: byViewRows.map((c) => toPick(c)),
    windowUsable: false,
    coveredDays: null,
    totalDays: 0,
  };
}

// Runs INSIDE unstable_cache, so it must throw rather than return an empty
// result: unstable_cache stores whatever the callback returns, and an empty
// result from one database blip used to sit in the cache for the rest of the
// day. getTopDemand catches outside the cache instead. That goes for the window
// read too, hence getDemandWindowOrThrow: the guarded getDemandWindow turns a
// failure into an empty window, which the fallback below would then cache as an
// all-time ranking with windowUsable:false — the /movers strip gone for the day.
async function computeTopDemand(days: number | null, limit: number): Promise<DemandResult> {
  try {
    if (days == null) return await computeAllTime(limit);

    const win = await getDemandWindowOrThrow(days);
    const usable = win.baselineDay != null && win.rows.length > 0;
    if (!usable) {
      // Same fallback the admin page makes: a window was asked for but no
      // snapshot reaches back that far, so fall back to all-time rather than
      // return an empty screen. windowUsable stays false so a reader can say so
      // (the /movers strip simply does not render).
      const fallback = await computeAllTime(limit);
      return { ...fallback, totalDays: win.totalDays };
    }

    // A window row exists for any card with a search OR a view, so each ranking
    // keeps only cards with activity of its own kind — "most searched" never
    // lists a card nobody searched for.
    const bySearchIds = win.rows.filter((r) => r.searches > 0).sort((a, b) => b.searches - a.searches || b.views - a.views).slice(0, limit).map((r) => r.cardId);
    const byViewIds = win.rows.filter((r) => r.views > 0).sort((a, b) => b.views - a.views || b.searches - a.searches).slice(0, limit).map((r) => r.cardId);
    const unionIds = [...new Set([...bySearchIds, ...byViewIds])];
    if (!unionIds.length) return { bySearch: [], byView: [], windowUsable: true, coveredDays: win.coveredDays, totalDays: win.totalDays };

    const cards = await fetchTiles(unionIds);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const winById = new Map(win.rows.map((r) => [r.cardId, r]));
    const build = (ids: string[]): DemandPick[] =>
      ids
        .map((id) => {
          const c = byId.get(id);
          const w = winById.get(id);
          return c && w ? toPick(c, w.searches, w.views) : null;
        })
        .filter((p): p is DemandPick => !!p);

    return {
      bySearch: build(bySearchIds),
      byView: build(byViewIds),
      windowUsable: true,
      coveredDays: win.coveredDays,
      totalDays: win.totalDays,
    };
  } catch (err) {
    console.error(`[demand] computeTopDemand(${days}) failed — not caching it:`, err);
    throw err;
  }
}

// DAY-scoped + CONTENT_TAG: cheap enough to recompute daily, and the
// twice-daily price import's revalidation (which also snapshots demand) keeps
// it from going stale for longer than that. One entry per window, not per
// market — see DEMAND_CARD_SELECT.
function getTopDemandCached(days: number | null): Promise<DemandResult> {
  return unstable_cache(
    () => computeTopDemand(days, SCAN_LIMIT),
    ["rc-demand-v2", String(days), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}

// Self-cached: call it directly, never from inside another unstable_cache
// callback (egress rule 6; tests/nested-cache.test.ts lists it).
export async function getTopDemand(days: number | null, limit = 25): Promise<DemandResult> {
  try {
    const full = await getTopDemandCached(days);
    return { ...full, bySearch: full.bySearch.slice(0, limit), byView: full.byView.slice(0, limit) };
  } catch {
    // Logged in computeTopDemand; nothing was cached, so the next call retries.
    return { bySearch: [], byView: [], windowUsable: false, coveredDays: null, totalDays: 0 };
  }
}
