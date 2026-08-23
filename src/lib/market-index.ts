// The RiftCompare Index — one number for the health of the Riftbound singles
// market, like a stock index for the game. Methodology (kept simple enough to
// explain to a journalist in two sentences):
//
//   • CONSTITUENTS: the 200 most-searched cards on RiftCompare that currently have
//     a live price in the selected market. Search volume is our purest demand
//     signal — the index tracks what players actually care about.
//   • WEIGHTS: proportional to each card's search volume, capped at 20% so no
//     single card IS the index. (Like cap-weighted stock indices.)
//   • VALUE: each day's index is the weighted average of constituents' lowest
//     live prices (PriceHistory), normalised so the first tracked day = 100.
//     "Index 112" therefore reads as "the watched market is up 12%".
//
// The constituent set is derived fresh from today's search data and applied
// retroactively across the window, so the series is internally consistent on any
// given day (no divisor gymnastics); history may revise slightly as demand shifts.
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { pickPrice, priceField, COUNTRY_LIST, COUNTRIES, type Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import type { PricePoint } from "./price-history";

// Calendar day in Australia/Sydney — the price-history snapshot bucket. Used as a
// cache-key segment so history-derived aggregates recompute at most ONCE per day
// (PriceHistory only changes when the daily import writes its snapshot). This is
// the core of the DB-egress fix: every reader — pages, bots, API, OG images —
// shares one recompute per day instead of re-reading the history DB per request.
export function sydneyDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

// A market the Index can be computed for: one region, or the GLOBAL composite that
// blends every region into a single currency-agnostic number (the default).
export type MarketScope = Country | "GLOBAL";

export const INDEX_SIZE = 200;
// index chart window: 180 → 90 → 45 (history-DB egress cuts, each halving the
// per-recompute PriceHistory read — this reads INDEX_SIZE × WINDOW_DAYS rows per
// region, ×5 regions for the GLOBAL composite). 45 days still clears the 30-day
// (d30) stat with a 15-day margin; only the visible chart range/high-low window
// shortens from ~3 months to ~6 weeks.
const WINDOW_DAYS = 45;
const MAX_WEIGHT_SHARE = 0.2; // no constituent above 20%
// Don't chart a day until most of the basket (by weight) has price data — early
// sparse days would otherwise swing the base around.
const MIN_COVERAGE = 0.6;

export type IndexConstituent = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  weightPct: number; // share of the index, 0–100
  priceCents: number; // current lowest price in the market
  d1pct: number | null; // its own 1-day (day-over-day) move, %
  d7pct: number | null; // its own 7-day move, %
};

// The "key statistics" a market is expected to report, derived from the basket and
// the index series — so both the regional indices and the GLOBAL composite carry them.
export type MarketStats = {
  // "Index value" = the cost to buy ONE copy of each constituent (Σ of their lowest
  // prices). NOT a circulating-supply market cap — singles have no public float, so a
  // true price×supply cap can't be computed; this is the one-of-each basket value.
  basketValueCents: number;
  avgPriceCents: number; // mean constituent price (priced cards only)
  medianPriceCents: number; // median constituent price
  constituentCount: number; // cards in the basket
  high: number; // index high over the tracked window
  low: number; // index low over the tracked window
  advancing: number; // constituents up over 7 days (market breadth)
  declining: number; // constituents down over 7 days
  unchanged: number; // flat / no 7-day read
  volatilityPct: number | null; // 30-day realised volatility (stdev of daily % returns)
};

export type MarketIndex = {
  market: MarketScope;
  currency: string; // currency the constituent prices below are quoted in
  priceMarket: Country; // region the constituent prices are sourced from (= market, or the reference region for GLOBAL)
  points: PricePoint[]; // daily closes, base 100 (v = index value)
  latest: number;
  d1: number | null; // % vs previous close
  d7: number | null;
  d30: number | null;
  sinceStart: number | null; // % vs base (= latest - 100)
  startDay: string; // ISO day the series starts (the base-100 day)
  constituents: IndexConstituent[];
  stats: MarketStats;
};

// Derive the market statistics from the (base-100) series and the basket. Pure.
function computeStats(points: PricePoint[], constituents: IndexConstituent[]): MarketStats {
  const prices = constituents.map((c) => c.priceCents).filter((p) => p > 0);
  const basketValueCents = prices.reduce((a, b) => a + b, 0); // one of each card
  const priced = prices.length;
  const avgPriceCents = priced ? Math.round(basketValueCents / priced) : 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const medianPriceCents = !priced
    ? 0
    : priced % 2
      ? sorted[(priced - 1) / 2]
      : Math.round((sorted[priced / 2 - 1] + sorted[priced / 2]) / 2);

  let high = -Infinity;
  let low = Infinity;
  for (const p of points) {
    if (p.v > high) high = p.v;
    if (p.v < low) low = p.v;
  }
  if (!points.length) {
    high = 0;
    low = 0;
  }

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  for (const c of constituents) {
    if (c.d7pct == null || c.d7pct === 0) unchanged++;
    else if (c.d7pct > 0) advancing++;
    else declining++;
  }

  // 30-day realised volatility: standard deviation of daily % returns.
  const recent = points.slice(-31);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].v;
    if (prev) returns.push(((recent[i].v - prev) / prev) * 100);
  }
  let volatilityPct: number | null = null;
  if (returns.length >= 5) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    volatilityPct = Math.round(Math.sqrt(variance) * 100) / 100;
  }

  return {
    basketValueCents,
    avgPriceCents,
    medianPriceCents,
    constituentCount: constituents.length,
    high: Math.round(high * 10) / 10,
    low: Math.round(low * 10) / 10,
    advancing,
    declining,
    unchanged,
    volatilityPct,
  };
}

const pctChange = (now: number, then: number | undefined): number | null =>
  then == null || then === 0 ? null : Math.round(((now - then) / then) * 1000) / 10;

// Resilient like getPriceMovers: any DB error returns null (the page shows its
// "warming up" state) instead of crashing the page or the build.
async function computeRegionIndex(country: Country): Promise<MarketIndex | null> {
 try {
  const field = priceField(country);

  // 1. Constituents: most-searched cards with a live price in this market.
  // (Assign the market's price column into a typed where/orderBy — a computed key
  // in an object literal would widen Prisma's inferred result type.)
  const where: Prisma.CardWhereInput = {};
  where[field] = { not: null };
  const cards = await prisma.card.findMany({
    where,
    orderBy: [
      { searchCount: "desc" },
      { viewCount: "desc" },
      { [field]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
    ],
    take: INDEX_SIZE,
    select: {
      id: true, name: true, slug: true, setCode: true, collectorNumber: true,
      imageThumbUrl: true, searchCount: true,
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
    },
  });
  if (cards.length < 5) return null; // not enough market to index

  // 2. Weights: search-proportional, capped. (+1 so a zero-search market still
  //    averages instead of dividing by zero.)
  const raw = cards.map((c) => 1 + c.searchCount);
  const cap = Math.max(1, MAX_WEIGHT_SHARE * raw.reduce((a, b) => a + b, 0));
  const weights = raw.map((w) => Math.min(w, cap));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // 3. Price history for the basket.
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const hist = await dbHistory.priceHistory.findMany({
    where: { country, cardId: { in: cards.map((c) => c.id) }, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { cardId: true, day: true, lowestPriceCents: true },
  });
  if (!hist.length) return null;

  const byCard = new Map<string, Map<number, number>>();
  const daySet = new Set<number>();
  for (const h of hist) {
    const t = h.day.getTime();
    daySet.add(t);
    (byCard.get(h.cardId) ?? byCard.set(h.cardId, new Map()).get(h.cardId)!).set(t, h.lowestPriceCents);
  }
  const days = [...daySet].sort((a, b) => a - b);

  // 4. Daily weighted average with carry-forward for gaps; start the series once
  //    coverage (by weight) clears the threshold.
  const carried = new Map<string, number>();
  const rawSeries: PricePoint[] = [];
  for (const t of days) {
    let sum = 0;
    let wSum = 0;
    cards.forEach((c, i) => {
      const p = byCard.get(c.id)?.get(t) ?? carried.get(c.id);
      if (p == null) return;
      carried.set(c.id, byCard.get(c.id)?.get(t) ?? p);
      sum += weights[i] * p;
      wSum += weights[i];
    });
    if (wSum / totalW >= MIN_COVERAGE) rawSeries.push({ t, v: sum / wSum });
  }
  if (rawSeries.length < 2) return null;

  // 5. Normalise to base 100 at the first charted day.
  const base = rawSeries[0].v;
  const points = rawSeries.map((p) => ({ t: p.t, v: Math.round((p.v / base) * 1000) / 10 }));

  const latest = points[points.length - 1].v;
  const at = (daysBack: number): number | undefined => {
    const target = points[points.length - 1].t - daysBack * 86400_000;
    // closest point at or before the target (falls back to the earliest point)
    let best: PricePoint | undefined;
    for (const p of points) if (p.t <= target) best = p;
    return best?.v;
  };

  // 6. Per-constituent 7-day move (from its own history) + weight share.
  const constituents: IndexConstituent[] = cards.map((c, i) => {
    const series = byCard.get(c.id);
    let d7: number | null = null;
    let d1: number | null = null;
    if (series && series.size >= 2) {
      const ts = [...series.keys()].sort((a, b) => a - b);
      const lastT = ts[ts.length - 1];
      let thenT = ts[0];
      for (const t of ts) if (t <= lastT - 7 * 86400_000) thenT = t;
      d7 = pctChange(series.get(lastT)!, series.get(thenT));
      if (thenT === lastT) d7 = null;
      // 1-day = day-over-day: last snapshot vs the immediately preceding one.
      d1 = pctChange(series.get(lastT)!, series.get(ts[ts.length - 2]));
    }
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      imageThumbUrl: c.imageThumbUrl,
      weightPct: Math.round((weights[i] / totalW) * 1000) / 10,
      priceCents: pickPrice(c, country) ?? 0,
      d1pct: d1,
      d7pct: d7,
    };
  });

  return {
    market: country,
    currency: COUNTRIES[country].currency,
    priceMarket: country,
    points,
    latest,
    d1: pctChange(latest, points[points.length - 2]?.v),
    d7: pctChange(latest, at(7)),
    d30: pctChange(latest, at(30)),
    sinceStart: pctChange(latest, points[0].v),
    startDay: new Date(points[0].t).toISOString().slice(0, 10),
    constituents,
    stats: computeStats(points, constituents),
  };
 } catch {
  return null;
 }
}

// ── Global composite ────────────────────────────────────────────────────────────
// Every regional index rebased to 100 at the COMMON history start (the youngest
// region's first day), then equal-weight averaged day by day. Rebasing first means
// a young market joining can't jump the composite the way a naive average of
// differently-aged base-100 series would. (Shared with the daily market report.)
export function compositeSeries(pointSets: PricePoint[][]): PricePoint[] {
  const live = pointSets.filter((p) => p.length >= 2);
  if (!live.length) return [];
  const start = Math.max(...live.map((p) => p[0].t));
  const rebased = live
    .map((pts) => {
      let base: number | null = null;
      for (const p of pts) {
        if (p.t <= start) base = p.v;
        else break;
      }
      if (base == null || base === 0) return null;
      return pts.filter((p) => p.t >= start).map((p) => ({ t: p.t, v: (p.v / base) * 100 }));
    })
    .filter((x): x is PricePoint[] => x != null);
  if (!rebased.length) return [];
  const days = [...new Set(rebased.flatMap((pts) => pts.map((p) => p.t)))].sort((a, b) => a - b);
  const cursor = rebased.map(() => 0);
  // Every series is exactly 100 at its base point (≤ start), so 100 is the correct
  // carry-forward seed for any gap day before a region's first on-window point.
  const lastV = rebased.map(() => 100);
  const out: PricePoint[] = [];
  for (const t of days) {
    rebased.forEach((pts, i) => {
      while (cursor[i] < pts.length && pts[cursor[i]].t <= t) {
        lastV[i] = pts[cursor[i]].v;
        cursor[i]++;
      }
    });
    out.push({ t, v: Math.round((lastV.reduce((a, b) => a + b, 0) / lastV.length) * 10) / 10 });
  }
  return out;
}

// Headline figures (latest + window moves) from a base-100 series.
function pointStats(points: PricePoint[]) {
  const latest = points[points.length - 1].v;
  const at = (daysBack: number): number | undefined => {
    const target = points[points.length - 1].t - daysBack * 86400_000;
    let best: PricePoint | undefined;
    for (const p of points) if (p.t <= target) best = p;
    return best?.v;
  };
  return {
    latest,
    d1: pctChange(latest, points[points.length - 2]?.v),
    d7: pctChange(latest, at(7)),
    d30: pctChange(latest, at(30)),
    sinceStart: pctChange(latest, points[0].v),
    startDay: new Date(points[0].t).toISOString().slice(0, 10),
  };
}

// Day-scoped cache around the per-region compute: the first request for a given
// (market, Sydney-day) reads PriceHistory once; every other caller that day — pages,
// bots, /api, OG images — gets the cached blob and touches the history DB zero times.
// Auto-refreshes at the day rollover, so no on-demand ping (CRON_SECRET) is needed.
function getRegionIndex(country: Country): Promise<MarketIndex | null> {
  return unstable_cache(() => computeRegionIndex(country), ["rc-region-index", country, sydneyDayKey()], {
    revalidate: 172800, // 2-day safety TTL; the day-keyed key is what actually refreshes it
    tags: [CONTENT_TAG],
  })();
}

async function computeGlobalIndex(): Promise<MarketIndex | null> {
  const regions = (await Promise.all(COUNTRY_LIST.map((c) => getRegionIndex(c.code)))).filter(
    (r): r is MarketIndex => r != null
  );
  if (!regions.length) return null;
  const points = compositeSeries(regions.map((r) => r.points));
  if (points.length < 2) return null;
  // The composite is currency-agnostic, but its constituent table needs real prices:
  // source them from a reference region — US (the de-facto global TCG price) when
  // live, otherwise whichever region has data.
  const ref = regions.find((r) => r.market === "US") ?? regions[0];
  return {
    market: "GLOBAL",
    currency: ref.currency,
    priceMarket: ref.priceMarket,
    points,
    ...pointStats(points),
    constituents: ref.constituents,
    stats: computeStats(points, ref.constituents),
  };
}

// Day-scoped cache for the GLOBAL composite (its region sub-calls are cached too,
// but caching the composite avoids re-compositing on every request as well).
function getGlobalIndex(): Promise<MarketIndex | null> {
  return unstable_cache(() => computeGlobalIndex(), ["rc-global-index", sydneyDayKey()], {
    revalidate: 172800,
    tags: [CONTENT_TAG],
  })();
}

// Default is the GLOBAL composite; pass a region for that market's own index. Both
// paths are day-cached, so the history DB is read at most once per market per day
// no matter how many pages/bots/API callers hit the index.
export async function getMarketIndex(market: MarketScope = "GLOBAL"): Promise<MarketIndex | null> {
  return market === "GLOBAL" ? getGlobalIndex() : getRegionIndex(market);
}
