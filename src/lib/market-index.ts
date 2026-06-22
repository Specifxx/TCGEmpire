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
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { pickPrice, priceField, type Country } from "./country";
import type { PricePoint } from "./price-history";

export const INDEX_SIZE = 200;
const WINDOW_DAYS = 180;
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
  d7pct: number | null; // its own 7-day move, %
};

export type MarketIndex = {
  market: Country;
  points: PricePoint[]; // daily closes, base 100 (v = index value)
  latest: number;
  d1: number | null; // % vs previous close
  d7: number | null;
  d30: number | null;
  sinceStart: number | null; // % vs base (= latest - 100)
  startDay: string; // ISO day the series starts (the base-100 day)
  constituents: IndexConstituent[];
};

const pctChange = (now: number, then: number | undefined): number | null =>
  then == null || then === 0 ? null : Math.round(((now - then) / then) * 1000) / 10;

// Resilient like getPriceMovers: any DB error returns null (the page shows its
// "warming up" state) instead of crashing the page or the build.
export async function getMarketIndex(country: Country = "AU"): Promise<MarketIndex | null> {
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
      lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
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
  const hist = await prisma.priceHistory.findMany({
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
    if (series && series.size >= 2) {
      const ts = [...series.keys()].sort((a, b) => a - b);
      const lastT = ts[ts.length - 1];
      let thenT = ts[0];
      for (const t of ts) if (t <= lastT - 7 * 86400_000) thenT = t;
      d7 = pctChange(series.get(lastT)!, series.get(thenT));
      if (thenT === lastT) d7 = null;
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
      d7pct: d7,
    };
  });

  return {
    market: country,
    points,
    latest,
    d1: pctChange(latest, points[points.length - 2]?.v),
    d7: pctChange(latest, at(7)),
    d30: pctChange(latest, at(30)),
    sinceStart: pctChange(latest, points[0].v),
    startDay: new Date(points[0].t).toISOString().slice(0, 10),
    constituents,
  };
 } catch {
  return null;
 }
}
