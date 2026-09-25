// Most-searched and most-viewed cards over a window. Two readers, one call
// shape — getTopDemand(days, limit):
//   • the free "Most searched this week" strip on /movers
//     (getTopDemand(7, FREE_DEMAND_ROWS), bySearch only);
//   • Demand Finder (/tools/demand), Premium again from later on 2026-09-25
//     (DECISIONS.md, "Demand Finder returns as a Premium tool"): both lists,
//     7 or 30 days, PREMIUM_DEMAND_ROWS deep. A viewer below Premium gets
//     exactly the strip's call and rows there, never more.
// It was retired earlier the same day (/tools/demand 301'd to
// /movers#most-searched) and this module trimmed to the strip; the most-viewed
// ranking and the 25-row scan came back with the page. The all-time mode did
// NOT: all-time totals include counts from before the counter was hardened
// (lib/card-views.ts), so only windows diffed against a daily snapshot are
// shown. /admin/demand has its own pipeline on getDemandWindow.
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
import { FREE_DEMAND_ROWS, PREMIUM_DEMAND_ROWS, type DemandWindowDays } from "./demand-view";

// The windows, and the free and Premium list sizes, live in lib/demand-view.ts
// with the pure who-sees-what rules, so a test can run them without a database.
export { DEMAND_WINDOWS, FREE_DEMAND_ROWS, PREMIUM_DEMAND_ROWS, type DemandWindowDays } from "./demand-view";

// Computed once per (window, day) at the deepest list any reader shows, and
// sliced for every caller — the strip never pays for a second scan.
const SCAN_LIMIT = PREMIUM_DEMAND_ROWS;

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
} satisfies Prisma.CardSelect;

export type DemandCard = Prisma.CardGetPayload<{ select: typeof DEMAND_CARD_SELECT }>;

export interface DemandPick {
  card: DemandCard;
  searches: number; // searches inside the window
  views: number; // card-page views inside the window
}

export interface DemandResult {
  bySearch: DemandPick[]; // cards with at least one search, most searched first
  byView: DemandPick[]; // cards with at least one view, most viewed first
  windowUsable: boolean; // false when no snapshot reaches back far enough — nothing is ranked
  coveredDays: number | null; // real days the window actually covers
  totalDays: number; // distinct snapshot days on record at all
  // The read FAILED (getTopDemand's catch), as opposed to a window that is
  // simply too short. Nothing was cached; the caller renders without a list.
  failed?: boolean;
}

function fetchTiles(ids: string[]) {
  return prisma.card.findMany({ where: { id: { in: ids } }, select: DEMAND_CARD_SELECT, take: ids.length });
}

// Runs INSIDE unstable_cache, so it must throw rather than return an empty
// result: unstable_cache stores whatever the callback returns, and an empty
// result from one database blip used to sit in the cache for the rest of the
// day. getTopDemand catches outside the cache instead. That goes for the window
// read too, hence getDemandWindowOrThrow: the guarded getDemandWindow turns a
// failure into an empty window, which would then be cached as "not usable" —
// the /movers strip and Demand Finder empty for the day.
async function computeTopDemand(days: DemandWindowDays, limit: number): Promise<DemandResult> {
  try {
    const win = await getDemandWindowOrThrow(days);
    const usable = win.baselineDay != null && win.rows.length > 0;
    // No snapshot reaches back that far: nothing is ranked or hydrated. (The
    // all-time fallback the old Demand Finder showed here is gone for good —
    // see the header.)
    if (!usable) return { bySearch: [], byView: [], windowUsable: false, coveredDays: null, totalDays: win.totalDays };

    // A window row exists for any card with a search OR a view, so each list
    // keeps only cards with its own metric — "most searched" never lists a
    // card nobody searched for, nor "most viewed" one nobody opened.
    const bySearchIds = win.rows.filter((r) => r.searches > 0).sort((a, b) => b.searches - a.searches || b.views - a.views).slice(0, limit).map((r) => r.cardId);
    const byViewIds = win.rows.filter((r) => r.views > 0).sort((a, b) => b.views - a.views || b.searches - a.searches).slice(0, limit).map((r) => r.cardId);
    // ONE narrow tile read for the union of the two ranked lists (at most
    // 2 × SCAN_LIMIT ids), never for every card the window returned.
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
          return c && w ? { card: c, searches: w.searches, views: w.views } : null;
        })
        .filter((p): p is DemandPick => !!p);

    return { bySearch: build(bySearchIds), byView: build(byViewIds), windowUsable: true, coveredDays: win.coveredDays, totalDays: win.totalDays };
  } catch (err) {
    console.error(`[demand] computeTopDemand(${days}) failed — not caching it:`, err);
    throw err;
  }
}

// DAY-scoped + CONTENT_TAG: cheap enough to recompute daily, and the
// twice-daily price import's revalidation (which also snapshots demand) keeps
// it from going stale for longer than that. One entry per window, not per
// market — see DEMAND_CARD_SELECT. v3 since the most-viewed list and the
// 25-row scan came back (later on 2026-09-25): a v2 entry holds ten searched rows and
// no views, which Demand Finder cannot be built from.
//
// The TTL (two days) is longer than /movers' 86400 revalidate, so it can
// never undercut that page's segment (egress rule 5); /tools/demand is
// force-dynamic and has no revalidate to undercut.
function getTopDemandCached(days: DemandWindowDays): Promise<DemandResult> {
  return unstable_cache(
    () => computeTopDemand(days, SCAN_LIMIT),
    ["rc-demand-v3", String(days), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}

// Self-cached: call it directly, never from inside another unstable_cache
// callback (egress rule 6; tests/nested-cache.test.ts lists it). The strip
// and Demand Finder's free view make the SAME call (7, FREE_DEMAND_ROWS), and
// Demand Finder's Premium 7-day view reads the same cached entry.
//
// A failure is NOT cached in the data cache (computeTopDemand rethrows), but
// /movers is an ISR page: the render that caught it is stored like any other,
// so the strip stays hidden until the next /movers regeneration — the price
// import's revalidatePath (about 12 hours) or the page's 24-hour TTL. The
// page keeps its #most-searched anchor meanwhile (MostSearchedStrip).
export async function getTopDemand(days: DemandWindowDays, limit = FREE_DEMAND_ROWS): Promise<DemandResult> {
  try {
    const full = await getTopDemandCached(days);
    return {
      bySearch: full.bySearch.slice(0, limit),
      byView: full.byView.slice(0, limit),
      windowUsable: full.windowUsable,
      coveredDays: full.coveredDays,
      totalDays: full.totalDays,
    };
  } catch {
    // Logged in computeTopDemand; nothing was cached.
    return { bySearch: [], byView: [], windowUsable: false, coveredDays: null, totalDays: 0, failed: true };
  }
}
