// Demand Finder (Premium): which cards RiftCompare visitors are actually
// searching for and opening, right now — the same "what's worth sourcing"
// signal /admin/demand has given the site owner since launch, now shipped as a
// public Premium tool instead of staying internal-only.
//
// Deliberately a DIFFERENT lens from Rising Cards, not a duplicate of it.
// Rising Cards is a composite BUY signal (demand is only one of five inputs,
// blended with price-timing so a card that's already spiked gets penalised).
// Demand Finder is raw attention — searches and views, full stop — for anyone
// who wants the unblended number rather than a derived score. See
// lib/rise-predictor.ts for the composite version.
//
// Card.searchCount / Card.viewCount are cumulative running totals with no
// per-event log (see lib/demand-snapshot.ts's own header), so "top cards in
// the last 7 days" is a SUBTRACTION against a daily snapshot, not a filter —
// getDemandWindow() does that diffing; this module is the Premium-tool-shaped
// wrapper around it (card tile data, caching, a graceful all-time fallback).
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { cardTileSelect } from "./cards";
import type { CardTileData } from "@/components/CardTile";
import type { Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { sydneyDayKey } from "./price-history";
import { getDemandWindow } from "./demand-snapshot";

// Generous cap computed once per (market, window, day) and sliced for both the
// free 1-row teaser and the full Premium list — same "compute big, slice
// small" shape as lib/screener.ts's getUndervalued, so the teaser never pays
// for a second scan.
const SCAN_LIMIT = 50;

export interface DemandPick {
  card: CardTileData;
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

type TileRow = Awaited<ReturnType<typeof fetchTiles>>[number];

function fetchTiles(ids: string[], country: Country) {
  return prisma.card.findMany({
    where: { id: { in: ids } },
    select: { ...cardTileSelect(country), searchCount: true, viewCount: true },
  });
}

function toPick(c: TileRow, searches?: number, views?: number): DemandPick {
  return {
    card: c as unknown as CardTileData,
    searches: searches ?? c.searchCount,
    views: views ?? c.viewCount,
    allTimeSearches: c.searchCount,
    allTimeViews: c.viewCount,
  };
}

async function computeAllTime(country: Country, limit: number): Promise<DemandResult> {
  const select = { ...cardTileSelect(country), searchCount: true, viewCount: true };
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

async function computeTopDemand(country: Country, days: number | null, limit: number): Promise<DemandResult> {
  try {
    if (days == null) return await computeAllTime(country, limit);

    const win = await getDemandWindow(days);
    const usable = win.baselineDay != null && win.rows.length > 0;
    if (!usable) {
      // Same fallback the admin page makes: a window was asked for but no
      // snapshot reaches back that far, so fall back to all-time rather than
      // return an empty screen. windowUsable stays false so the page can say so.
      const fallback = await computeAllTime(country, limit);
      return { ...fallback, totalDays: win.totalDays };
    }

    const bySearchIds = [...win.rows].sort((a, b) => b.searches - a.searches || b.views - a.views).slice(0, limit).map((r) => r.cardId);
    const byViewIds = [...win.rows].sort((a, b) => b.views - a.views || b.searches - a.searches).slice(0, limit).map((r) => r.cardId);
    const unionIds = [...new Set([...bySearchIds, ...byViewIds])];
    if (!unionIds.length) return { bySearch: [], byView: [], windowUsable: true, coveredDays: win.coveredDays, totalDays: win.totalDays };

    const cards = await fetchTiles(unionIds, country);
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
  } catch {
    return { bySearch: [], byView: [], windowUsable: false, coveredDays: null, totalDays: 0 };
  }
}

// DAY-scoped + CONTENT_TAG, matching every other Premium screener in this repo
// (screener.ts, rise-predictor.ts): cheap enough to recompute daily, and the
// twice-daily price import's revalidation keeps it from ever going stale for
// longer than that.
function getTopDemandCached(country: Country, days: number | null): Promise<DemandResult> {
  return unstable_cache(
    () => computeTopDemand(country, days, SCAN_LIMIT),
    ["rc-demand", country, String(days), sydneyDayKey()],
    { revalidate: 172800, tags: [CONTENT_TAG] },
  )();
}

export async function getTopDemand(country: Country, days: number | null, limit = 25): Promise<DemandResult> {
  const full = await getTopDemandCached(country, days);
  return { ...full, bySearch: full.bySearch.slice(0, limit), byView: full.byView.slice(0, limit) };
}
