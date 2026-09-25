// Most-searched cards over a window. Its one reader is the free "Most searched
// this week" strip on /movers (2026-09-25); it used to be the Premium Demand
// Finder, which left the product that day (/tools/demand 301s to
// /movers#most-searched). The most-viewed ranking, the all-time mode and the
// 50-row scan only that page read were removed with it (review, 2026-09-25);
// /admin/demand has its own pipeline on getDemandWindow.
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

// The /movers strip shows ten; computed once per (window, day) at exactly that.
const SCAN_LIMIT = 10;

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
}

export interface DemandResult {
  bySearch: DemandPick[];
  windowUsable: boolean; // false when no snapshot reaches back far enough — the strip is hidden
  coveredDays: number | null; // real days the window actually covers
  totalDays: number; // distinct snapshot days on record at all
  // The read FAILED (getTopDemand's catch), as opposed to a window that is
  // simply too short. Nothing was cached; the page renders without the strip.
  failed?: boolean;
}

function fetchTiles(ids: string[]) {
  return prisma.card.findMany({ where: { id: { in: ids } }, select: DEMAND_CARD_SELECT });
}

// Runs INSIDE unstable_cache, so it must throw rather than return an empty
// result: unstable_cache stores whatever the callback returns, and an empty
// result from one database blip used to sit in the cache for the rest of the
// day. getTopDemand catches outside the cache instead. That goes for the window
// read too, hence getDemandWindowOrThrow: the guarded getDemandWindow turns a
// failure into an empty window, which would then be cached as "not usable" —
// the /movers strip gone for the day.
async function computeTopDemand(days: number, limit: number): Promise<DemandResult> {
  try {
    const win = await getDemandWindowOrThrow(days);
    const usable = win.baselineDay != null && win.rows.length > 0;
    // No snapshot reaches back that far: the /movers strip is not rendered, so
    // there is nothing to rank or hydrate (the all-time fallback the Demand
    // Finder showed here was read by nothing once it left).
    if (!usable) return { bySearch: [], windowUsable: false, coveredDays: null, totalDays: win.totalDays };

    // A window row exists for any card with a search OR a view, so keep only
    // cards with searches — "most searched" never lists a card nobody searched for.
    const bySearchIds = win.rows.filter((r) => r.searches > 0).sort((a, b) => b.searches - a.searches || b.views - a.views).slice(0, limit).map((r) => r.cardId);
    if (!bySearchIds.length) return { bySearch: [], windowUsable: true, coveredDays: win.coveredDays, totalDays: win.totalDays };

    const cards = await fetchTiles(bySearchIds);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const winById = new Map(win.rows.map((r) => [r.cardId, r]));
    const bySearch = bySearchIds
      .map((id) => {
        const c = byId.get(id);
        const w = winById.get(id);
        return c && w ? { card: c, searches: w.searches } : null;
      })
      .filter((p): p is DemandPick => !!p);

    return { bySearch, windowUsable: true, coveredDays: win.coveredDays, totalDays: win.totalDays };
  } catch (err) {
    console.error(`[demand] computeTopDemand(${days}) failed — not caching it:`, err);
    throw err;
  }
}

// DAY-scoped + CONTENT_TAG: cheap enough to recompute daily, and the
// twice-daily price import's revalidation (which also snapshots demand) keeps
// it from going stale for longer than that. One entry per window, not per
// market — see DEMAND_CARD_SELECT. (An entry cached before 2026-09-25 carries
// extra fields — byView, all-time counts, 50 rows — which are ignored and
// sliced away, so the key did not need to change.)
function getTopDemandCached(days: number): Promise<DemandResult> {
  return unstable_cache(
    () => computeTopDemand(days, SCAN_LIMIT),
    ["rc-demand-v2", String(days), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}

// Self-cached: call it directly, never from inside another unstable_cache
// callback (egress rule 6; tests/nested-cache.test.ts lists it).
//
// A failure is NOT cached in the data cache (computeTopDemand rethrows), but
// /movers is an ISR page: the render that caught it is stored like any other,
// so the strip stays hidden until the next /movers regeneration — the price
// import's revalidatePath (about 12 hours) or the page's 24-hour TTL. The
// page keeps its #most-searched anchor meanwhile (MostSearchedStrip).
export async function getTopDemand(days: number, limit = SCAN_LIMIT): Promise<DemandResult> {
  try {
    const full = await getTopDemandCached(days);
    return { bySearch: full.bySearch.slice(0, limit), windowUsable: full.windowUsable, coveredDays: full.coveredDays, totalDays: full.totalDays };
  } catch {
    // Logged in computeTopDemand; nothing was cached.
    return { bySearch: [], windowUsable: false, coveredDays: null, totalDays: 0, failed: true };
  }
}
