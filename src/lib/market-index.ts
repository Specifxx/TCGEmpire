// The RiftCompare Index — one number for the health of the Riftbound singles
// market, like a stock index for the game. Methodology (kept simple enough to
// explain to a journalist in two sentences — the full worked formula is public
// at /guides/understanding-the-riftcompare-index-methodology):
//
//   • CONSTITUENTS: the 200 most-searched cards on RiftCompare that currently have
//     a live price in the selected market. Search volume is our purest demand
//     signal — the index tracks what players actually care about.
//   • WEIGHTS: proportional to each card's search volume, capped at 20% so no
//     single card IS the index. (Like cap-weighted stock indices.)
//   • VALUE: CHAIN-LINKED, not a plain weighted average. Each tracked snapshot's
//     % move is computed only from constituents priced at BOTH it and the
//     previous charted snapshot, then that move is multiplied onto the running
//     level (100 at the first charted snapshot). "Index 112" reads as "the
//     watched market is up 12% since tracking began."
//
// The constituent set is derived fresh from today's search data — so when a new
// set releases and its cards climb into the top 200 by search, THIS is what
// keeps that basket change from itself moving the Index: a card with no price
// yet (or no price history in the earlier snapshot) simply isn't part of the
// return calculation for the step it debuts on, chain-linking's whole point. No
// persisted divisor, no rebalance date to track, no per-set special case —
// ordinary week-to-week demand reshuffling is handled by the exact same
// mechanism as a brand new set arriving. See computeRegionIndex step 4 below for
// the actual arithmetic.
//
// EFFECTIVELY NO TIME WINDOW ON THE READ. PriceHistory now writes one snapshot
// per card per market at most once every 7 days (HISTORY_MIN_INTERVAL_DAYS in
// price-import.ts — a cost control adopted after this file was first written).
// This module used to cap its own read to a rolling 45 days, back when that meant
// ~45 rows per card; under the current weekly cadence 45 days is only ~6 rows, so
// the cap was quietly starving the chart of history that already exists for free
// — Origins-era cards especially have far more than 6 weeks of real snapshots.
//
// This history DB has its own 5 GB/month Neon network-transfer allowance (the
// reason it's a separate project from the operational DB at all — see
// db-history.ts), and that allowance has been exhausted by real mistakes before
// (RH5 through RH11 — see scripts/audit-egress.ts's header for the timeline), so
// "it'll probably be fine" isn't good enough here on its own. The actual bound:
// reading everything for today's 200 constituents costs at most (weeks tracked ×
// 200 cards) rows per market, cached for a full week (see getRegionIndex below),
// which as of this writing (~months of tracked history) is single-digit MB a
// week — a small fraction of the monthly allowance, and nowhere near the ~1,400-
// card DAILY scans that caused the original crisis. MAX_LOOKBACK_DAYS below is
// the belt-and-suspenders version of that argument: a circuit breaker, not a
// real limit today, so the read stays bounded even after years of accumulated
// history rather than trusting the current numbers to stay small forever.
// Verify the real row counts against production with `npx tsx
// scripts/audit-history.ts` (prints PriceHistory's actual total row count).
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { pickPrice, priceField, COUNTRY_LIST, COUNTRIES, type Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { sydneyWeekKey, type PricePoint } from "./price-history";

// A market the Index can be computed for: one region, or the GLOBAL composite that
// blends every region into a single currency-agnostic number (the default).
export type MarketScope = Country | "GLOBAL";

export const INDEX_SIZE = 200;
// Circuit breaker, not a real limit today (see the file header): at today's
// weekly write cadence this is ~104 snapshots per card, comfortably more history
// than the site has accumulated at time of writing. It exists purely so the read
// stays bounded years from now without anyone having to remember to revisit it.
const MAX_LOOKBACK_DAYS = 730;
const MAX_WEIGHT_SHARE = 0.2; // no constituent above 20%
// Realised-volatility lookback, in SNAPSHOTS not days — PriceHistory's write
// cadence is a runtime cost-control decision (see the file-header note), not a
// contract this file should hard-code a day-count against. 13 snapshots is
// ~1 quarter at today's weekly cadence; if the cadence ever changes again this
// keeps measuring "the last several snapshots" rather than silently mis-sizing
// the window the way the old `slice(-31)` (~31 DAYS under daily writes) quietly
// became ~31 WEEKS once writes moved to weekly.
const VOLATILITY_LOOKBACK_POINTS = 13;

export type IndexConstituent = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  weightPct: number; // share of the index, 0–100
  priceCents: number; // current lowest price in the market
  d1pct: number | null; // its own move since the previous snapshot, %
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
  volatilityPct: number | null; // recent realised volatility (stdev of the last several snapshot-to-snapshot % moves)
};

export type MarketIndex = {
  market: MarketScope;
  currency: string; // currency the constituent prices below are quoted in
  priceMarket: Country; // region the constituent prices are sourced from (= market, or the reference region for GLOBAL)
  points: PricePoint[]; // one point per tracked snapshot, base 100 (v = index value)
  latest: number;
  d1: number | null; // % vs the previous tracked snapshot ("Latest" in the UI, not "1 day")
  d7: number | null;
  d30: number | null;
  sinceStart: number | null; // % vs base (= latest - 100)
  startDay: string; // ISO day the series starts (the base-100 day)
  constituents: IndexConstituent[];
  stats: MarketStats;
};

// Derive the market statistics from the (base-100) series and the basket. Pure —
// exported (like compositeSeries) so tests can exercise it directly.
export function computeStats(points: PricePoint[], constituents: IndexConstituent[]): MarketStats {
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

  // Recent realised volatility: standard deviation of the last several
  // snapshot-to-snapshot % moves (see VOLATILITY_LOOKBACK_POINTS).
  const recent = points.slice(-VOLATILITY_LOOKBACK_POINTS);
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

// CHAIN-LINKED level from a basket's raw price history. Pure — exported (like
// compositeSeries and computeStats) so tests can exercise it directly with
// synthetic data, and the piece that answers "what happens when a new set's
// cards enter the basket":
//
// Rather than averaging PRICE LEVELS at each snapshot (where a newly-arrived,
// likely differently-priced card would jump the average the instant it
// appears), each step computes a % RETURN using only the constituents priced
// at BOTH this step and the previous CHARTED one, and multiplies that onto the
// running level (100 at the first charted snapshot). A debuting card has no
// earlier price to form a ratio from, so it simply sits out the step it debuts
// on — then joins the return calculation from the next step, once it has two
// consecutive prices. The basket can change completely over time (a new set's
// cards climbing into the top-200 by search being the biggest case, but any
// ordinary week-to-week demand reshuffle works the same way) and the level
// still never jumps on that account alone; only actual price moves do.
//
// `byCard` and `days` come from the caller's PriceHistory scan; `cardIds` and
// `weights` are parallel arrays (weights[i] is cardIds[i]'s weight).
//
// Starts at the FIRST day any constituent has a tracked price at all — as far
// back as the data allows, full stop. An earlier version gated the start on a
// basket-wide coverage supermajority (most of the weight needing SOME price
// yet before charting a single point), reasoning that starting on a sliver of
// the basket would be untrustworthy. In practice that threw away real early
// history: today's top-200-by-search skews toward cards that have only
// recently accumulated enough search volume to rank, so the "most of the
// weight" bar kept sliding later than the oldest cards' own tracked history.
// It also wasn't buying any real protection — the per-card exclusion just
// below (`prevPrice == null || currPrice == null`) is what actually keeps a
// thin or growing basket from jumping the level; a coverage floor on top of
// that only decided how much real history to hide, not whether the level was
// trustworthy.
export function chainLinkSeries(
  days: number[],
  byCard: Map<string, Map<number, number>>,
  cardIds: string[],
  weights: number[],
): PricePoint[] {
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return [];
  const carried = new Map<string, number>();

  // Advance `carried` to reflect day `t` (fresh snapshot if one exists, else
  // whatever was already known) and return this day's basket-weight coverage.
  function advance(t: number): number {
    let wSum = 0;
    cardIds.forEach((id, i) => {
      const fresh = byCard.get(id)?.get(t);
      if (fresh != null) carried.set(id, fresh);
      if (carried.has(id)) wSum += weights[i];
    });
    return wSum / totalW;
  }

  let startIdx = -1;
  for (let k = 0; k < days.length; k++) {
    if (advance(days[k]) > 0) { startIdx = k; break; }
  }
  if (startIdx === -1) return [];

  const points: PricePoint[] = [{ t: days[startIdx], v: 100 }];
  let level = 100;
  let lastCharted = new Map(carried); // prices as of the last point actually charted

  for (let k = startIdx + 1; k < days.length; k++) {
    advance(days[k]);
    let numerator = 0;
    let denominator = 0;
    cardIds.forEach((id, i) => {
      const prevPrice = lastCharted.get(id);
      const currPrice = carried.get(id);
      if (prevPrice == null || currPrice == null) return; // not present at both ends of this step
      numerator += weights[i] * currPrice;
      denominator += weights[i] * prevPrice;
    });
    if (denominator === 0) continue; // nothing overlaps yet — only possible before any two consecutive prices exist
    level *= numerator / denominator;
    points.push({ t: days[k], v: Math.round(level * 10) / 10 });
    lastCharted = new Map(carried);
  }
  return points;
}

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

  // 3. Essentially the FULL price history for the basket — MAX_LOOKBACK_DAYS is a
  //    circuit breaker, not a real cutoff today (see the file header). It's what
  //    makes the index's own history reach back as far as its constituents' real
  //    tracked prices do, immediately, with no separate backfill step.
  const cutoff = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86400_000);
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

  // 4. Chain-linked level (see chainLinkSeries above for the full reasoning —
  //    this is the piece that keeps a new set's cards entering the basket, or
  //    any other constituent reshuffle, from itself moving the Index).
  const points = chainLinkSeries(days, byCard, cards.map((c) => c.id), weights);
  if (points.length < 2) return null;

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
      // Latest move: last snapshot vs the immediately preceding one — NOT
      // "1 day", since a "day" apart is whatever the write cadence currently
      // is (weekly at the time of writing). Labelled "Latest" wherever shown.
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
// differently-aged base-100 series would.
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

// WEEK-scoped cache around the per-region compute, matching PriceHistory's own
// write cadence (see the file header) — the same fix price-history.ts's own
// getPriceHistory() needed for the same reason: a day-scoped key was recomputing
// an unchanged answer up to seven times for nothing. The first request for a
// given (market, ISO week) reads PriceHistory once; every other caller that
// week — pages, bots, /api, OG images — gets the cached blob and touches the
// history DB zero times. Auto-refreshes at the week rollover, so no on-demand
// ping (CRON_SECRET) is needed.
function getRegionIndex(country: Country): Promise<MarketIndex | null> {
  return unstable_cache(() => computeRegionIndex(country), ["rc-region-index", country, sydneyWeekKey()], {
    revalidate: 8 * 86400, // one week + a day of slack; the week-keyed key is what actually refreshes it
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

// Week-scoped cache for the GLOBAL composite, same reasoning as getRegionIndex
// (its region sub-calls are cached too, but caching the composite avoids
// re-compositing on every request as well).
function getGlobalIndex(): Promise<MarketIndex | null> {
  return unstable_cache(() => computeGlobalIndex(), ["rc-global-index", sydneyWeekKey()], {
    revalidate: 8 * 86400,
    tags: [CONTENT_TAG],
  })();
}

// Default is the GLOBAL composite; pass a region for that market's own index. Both
// paths are week-cached, so the history DB is read at most once per market per
// week no matter how many pages/bots/API callers hit the index.
export async function getMarketIndex(market: MarketScope = "GLOBAL"): Promise<MarketIndex | null> {
  return market === "GLOBAL" ? getGlobalIndex() : getRegionIndex(market);
}
