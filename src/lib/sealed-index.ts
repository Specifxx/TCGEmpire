// The RiftCompare Sealed Index — one number for the health of the Riftbound
// SEALED market (booster boxes, packs, bundles, …), the sealed-side sibling of
// the singles Index (market-index.ts). Deliberately its own, separate index
// rather than folded into the same 200-constituent basket: a booster box
// (~$80-150+) and a common single (~$2-5) sit on wildly different price
// scales, and mixing them into one basket would make weight allocation (and
// therefore "what moved the number") much harder to read honestly. Reuses
// that module's own chain-linking engine (chainLinkSeries) and stats helper
// (computeStats) directly — both are already generic over "a basket of
// priced things with a history", not hard-coded to cards.
//
// CONSTITUENTS: every currently-listed, non-preorder sealed product group
// with a live price — NOT a "top N by demand" cut like the singles Index.
// There is no search/view tracking for sealed products (a deliberate choice,
// not an oversight — instrumenting one is a separate project), and the whole
// catalogue is small enough (~30 groups per market) that "the whole small
// catalogue" and "the top N by some proxy" are close to the same list anyway.
// WEIGHTS are therefore equal across every constituent, not search-proportional
// — there is no demand signal to weight by, and inventing a proxy (store
// count, MSRP) would dress up a made-up number as if it meant something.
//
// VALUE: CHAIN-LINKED, exactly like the singles Index (see chainLinkSeries's
// own doc comment in market-index.ts for the full reasoning) — a new set's
// booster box climbing onto shelves mid-week can't jump the number any more
// than a new set's cards can jump the singles Index.
import { unstable_cache } from "next/cache";
import { dbHistory } from "./db-history";
import { getSealedGroups } from "./sealed-import";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "./country";
import { CONTENT_TAG } from "./revalidate-content";
import { sydneyWeekKey, type PricePoint } from "./price-history";
import { chainLinkSeries, computeStats, type MarketStats } from "./market-index";

export const SEALED_INDEX_MIN_GROUPS = 3; // don't index a near-empty basket

// Circuit breaker, not a real limit today — same reasoning as market-index.ts's
// own MAX_LOOKBACK_DAYS (a separate constant, not imported: the two Index
// engines are deliberately independent parallel implementations, and this
// value isn't a cross-module invariant the way HISTORY_MIN_INTERVAL_DAYS is).
const MAX_LOOKBACK_DAYS = 730;

export type SealedIndexConstituent = {
  id: string; // groupKey
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  weightPct: number; // share of the index, 0–100 (equal-weight, so ~1/N each)
  priceCents: number; // current lowest live price
  d1pct: number | null; // its own move since the previous snapshot, %
  d7pct: number | null; // its own 7-day move, %
};

export type SealedMarketIndex = {
  market: Country;
  currency: string;
  points: PricePoint[]; // one point per tracked snapshot, base 100
  latest: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  sinceStart: number | null;
  startDay: string;
  constituents: SealedIndexConstituent[];
  stats: MarketStats;
};

const pctChange = (now: number, then: number | undefined): number | null =>
  then == null || then === 0 ? null : Math.round(((now - then) / then) * 1000) / 10;

// Resilient like computeRegionIndex: any error returns null (the page shows
// its "warming up" state) instead of crashing.
async function computeSealedRegionIndex(country: Country): Promise<SealedMarketIndex | null> {
 try {
  // 1. Constituents: every live, shipped (non-preorder) sealed group.
  const groups = (await getSealedGroups(country)).filter((g) => g.lowestPriceCents != null);
  if (groups.length < SEALED_INDEX_MIN_GROUPS) return null;

  // 2. Weights: equal — see the file header for why there's no demand
  //    signal to weight by.
  const weights = groups.map(() => 1);
  const totalW = weights.reduce((a, b) => a + b, 0);

  // 3. Essentially the full price history for the basket (see the file
  //    header on MAX_LOOKBACK_DAYS). Sealed markets are all genuinely,
  //    independently tracked (unlike CA/EU singles history — see
  //    historySource() in price-history.ts) — the sealed catalogue is cheap
  //    enough to search natively in every market, so there's no derivation
  //    to redirect through here.
  const cutoff = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86400_000);
  const hist = await dbHistory.sealedPriceHistory.findMany({
    where: { country, groupKey: { in: groups.map((g) => g.groupKey) }, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { groupKey: true, day: true, lowestPriceCents: true },
  });
  if (!hist.length) return null;

  const byGroup = new Map<string, Map<number, number>>();
  const daySet = new Set<number>();
  for (const h of hist) {
    const t = h.day.getTime();
    daySet.add(t);
    (byGroup.get(h.groupKey) ?? byGroup.set(h.groupKey, new Map()).get(h.groupKey)!).set(t, h.lowestPriceCents);
  }
  const days = [...daySet].sort((a, b) => a - b);

  // 4. Chain-linked level — the exact same function computeRegionIndex uses
  //    for cards (market-index.ts). A group with no reading yet simply isn't
  //    part of the return for the step it debuts on; see that function's own
  //    doc comment for the full reasoning.
  const points = chainLinkSeries(days, byGroup, groups.map((g) => g.groupKey), weights);
  if (points.length < 2) return null;

  const latest = points[points.length - 1].v;
  const at = (daysBack: number): number | undefined => {
    const target = points[points.length - 1].t - daysBack * 86400_000;
    let best: PricePoint | undefined;
    for (const p of points) if (p.t <= target) best = p;
    return best?.v;
  };

  // 5. Per-constituent 7-day move (from its own history) + equal weight share.
  const constituents: SealedIndexConstituent[] = groups.map((g) => {
    const series = byGroup.get(g.groupKey);
    let d7: number | null = null;
    let d1: number | null = null;
    if (series && series.size >= 2) {
      const ts = [...series.keys()].sort((a, b) => a - b);
      const lastT = ts[ts.length - 1];
      let thenT = ts[0];
      for (const t of ts) if (t <= lastT - 7 * 86400_000) thenT = t;
      d7 = pctChange(series.get(lastT)!, series.get(thenT));
      if (thenT === lastT) d7 = null;
      // "Latest" move, not "1 day" — see market-index.ts's own d1 comment:
      // a step apart is whatever the write cadence currently is (weekly).
      d1 = pctChange(series.get(lastT)!, series.get(ts[ts.length - 2]));
    }
    return {
      id: g.groupKey,
      name: g.name,
      productType: g.productType,
      setCode: g.setCode,
      imageUrl: g.imageUrl,
      weightPct: Math.round((1 / totalW) * 1000) / 10,
      priceCents: g.lowestPriceCents ?? 0,
      d1pct: d1,
      d7pct: d7,
    };
  });

  return {
    market: country,
    currency: COUNTRIES[country].currency,
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

// WEEK-scoped cache, same reasoning and TTL as market-index.ts's own
// getRegionIndex: PriceHistory-shaped snapshot tables (SealedPriceHistory
// included) gain at most one point a week, so a day-scoped key would recompute
// an unchanged answer up to seven times for nothing.
function getSealedRegionIndex(country: Country): Promise<SealedMarketIndex | null> {
  return unstable_cache(() => computeSealedRegionIndex(country), ["rc-sealed-index", country, sydneyWeekKey()], {
    revalidate: 8 * 86400,
    tags: [CONTENT_TAG],
  })();
}

// Defaults to US, exactly like getMarketIndex() — no GLOBAL composite here
// either, for the same reason it was removed from the singles Index: one
// region priced in its own real currency reads more honestly than a blend.
export async function getSealedIndex(market: Country = DEFAULT_COUNTRY): Promise<SealedMarketIndex | null> {
  return getSealedRegionIndex(market);
}
