import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { priceField, pickPrice, currencyOf, type Country } from "./country";
import { computeSignals, type Signals } from "./ai-insight";
import type { PricePoint } from "./price-history";
import { cardDisplayName } from "./card-name";
import { getDemandVelocity, demandSnapshotDays } from "./demand-snapshot";
import { zScores, percentileRanks, spearman, mean, median, clamp } from "./stats";

// ── Rise predictor ────────────────────────────────────────────────────────────
// Ranks cards most likely to RISE in price soon, from demand + price-timing signals.
// Thesis: attention (search demand) leads price, so a card with high/rising demand
// that HASN'T re-rated yet (sitting near its range low, thin supply, not already
// spiking) has asymmetric upside. Every input is a real, quoted data field; the
// output score is a transparent weighted sum of cross-sectional z-scores (no black
// box), and the price-timing half is validated by a lookahead-free backtest.
//
// HONEST LIMITS (surfaced in the UI): (1) demand VELOCITY needs DemandSnapshot rows
// to accrue — until then that component is 0 and only demand LEVEL is used. (2) The
// backtest validates the price-timing signal only (demand isn't historically
// reconstructable). (3) Thin price history ⇒ low confidence. Not financial advice.

// Scope: a single market, or GLOBAL. Demand (search/view) is already market-agnostic,
// and the price-timing signals (trend7/posPct/volatility) are percentages — currency-
// neutral — so GLOBAL uses each card's best-covered market series for timing and its
// total cross-market supply. The DISPLAYED price uses that card's basis market.
export type RiseScope = Country | "GLOBAL";
const MARKET_PREF: Country[] = ["AU", "US", "NZ", "UK"]; // reference order for a GLOBAL card's displayed price

const SCAN = 400; // universe: most-searched priced cards
const HISTORY_DAYS = 120;
const MIN_POINTS = 5; // price points needed to trust the signals
const BACKTEST_LAG_DAYS = 14;
const OVERHEAT_PCT = 35; // 7-day gain above this = likely already spiked
const MIN_BACKTEST_N = 20;
const DISPLAY = 40;

// Component weights (transparent, tunable). Demand + room-to-run dominate; velocity
// is the strongest signal WHEN it exists; volatility is a small "will it move" tilt.
const W = { demand: 1.0, velocity: 1.4, room: 1.1, scarcity: 0.7, momentum: 0.5, volatility: 0.25, overheat: 0.8 };

export interface RiseComponents {
  demand: number; // z: attention level (searchCount)
  velocity: number; // z: rising searches/day (0 until snapshots accrue)
  room: number; // z: room to run (near range low)
  scarcity: number; // z: thin supply
  momentum: number; // z: emerging (not overheated) 7-day momentum
  volatility: number; // z: day-to-day movement
}

export interface RisePick {
  id: string;
  slug: string | null;
  displayName: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  score: number; // 0–100 percentile of the composite
  components: RiseComponents;
  priceCents: number | null;
  currency: string; // currency of the displayed price (the card's basis market)
  basisMarket: Country; // market whose price series drove this card's timing signals
  searchCount: number;
  viewCount: number;
  trend7: number;
  trend30: number;
  posPct: number; // 0 = at range low, 1 = at high
  volatilityPct: number;
  listings: number;
  searchPerDay: number | null;
  searchGrowthPct: number | null;
  historyPoints: number;
  spark: number[]; // recent price series for a mini chart
  confidence: "High" | "Medium" | "Low";
  overheated: boolean;
}

export interface RiseBacktest {
  n: number;
  lagDays: number;
  spearman: number; // corr(room-to-run signal at T−lag, forward return)
  topTercileReturnPct: number;
  bottomTercileReturnPct: number;
  medianReturnPct: number;
}

export interface RiseAnalysis {
  picks: RisePick[];
  universeSize: number;
  qualifying: number;
  demandPriceSpearman: number; // rank-corr of demand vs price (context for divergence)
  velocityActive: boolean;
  snapshotDays: number;
  backtest: RiseBacktest | null;
  generatedAt: string;
  scope: RiseScope;
}

type UniverseCard = {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
  imageThumbUrl: string | null;
  searchCount: number;
  viewCount: number;
  lowestPriceCents: number | null;
  lowestPriceCentsNz: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
};

// Lookahead-free backtest of the reconstructable price-timing signal ("room to run"
// = 1 − position-in-range at T−lag) vs realised forward return over the lag. Only
// price data up to T−lag is used to build the historical signal.
function backtest(seriesById: Map<string, PricePoint[]>): RiseBacktest | null {
  const lagMs = BACKTEST_LAG_DAYS * 86400_000;
  const sig: number[] = [];
  const fwd: number[] = [];
  for (const points of seriesById.values()) {
    if (points.length < MIN_POINTS + 2) continue;
    const lastT = points[points.length - 1].t;
    const cutT = lastT - lagMs;
    const past = points.filter((p) => p.t <= cutT);
    if (past.length < MIN_POINTS) continue;
    const priceThen = past[past.length - 1].v;
    const priceNow = points[points.length - 1].v;
    if (priceThen < 300) continue; // ignore sub-$3 noise
    const ret = ((priceNow - priceThen) / priceThen) * 100;
    if (!Number.isFinite(ret) || Math.abs(ret) > 200) continue; // drop data glitches
    const room = 1 - computeSignals(past).posPct; // 1 = sat at its low then
    sig.push(room);
    fwd.push(ret);
  }
  if (sig.length < MIN_BACKTEST_N) return null;
  // Terciles of the signal → average forward return of the strongest vs weakest third.
  const order = sig.map((_, i) => i).sort((a, b) => sig[a] - sig[b]);
  const t = Math.floor(order.length / 3);
  const bottom = order.slice(0, t).map((i) => fwd[i]);
  const top = order.slice(order.length - t).map((i) => fwd[i]);
  return {
    n: sig.length,
    lagDays: BACKTEST_LAG_DAYS,
    spearman: Math.round(spearman(sig, fwd) * 100) / 100,
    topTercileReturnPct: Math.round(mean(top) * 10) / 10,
    bottomTercileReturnPct: Math.round(mean(bottom) * 10) / 10,
    medianReturnPct: Math.round(median(fwd) * 10) / 10,
  };
}

export async function getRisingCards(scope: RiseScope): Promise<RiseAnalysis> {
  const isGlobal = scope === "GLOBAL";
  // Universe: most-searched cards priced in the scope market (any market for GLOBAL).
  const priced = isGlobal
    ? {
        OR: [
          { lowestPriceCents: { not: null } },
          { lowestPriceCentsNz: { not: null } },
          { lowestPriceCentsUs: { not: null } },
          { lowestPriceCentsUk: { not: null } },
        ],
      }
    : { [priceField(scope)]: { not: null } };

  const universe = (await prisma.card.findMany({
    where: { searchCount: { gt: 0 }, ...priced },
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    take: SCAN,
    select: {
      id: true, slug: true, name: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, rarity: true, imageThumbUrl: true,
      searchCount: true, viewCount: true,
      lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
    },
  })) as UniverseCard[];

  const ids = universe.map((c) => c.id);
  if (!ids.length) {
    return { picks: [], universeSize: 0, qualifying: 0, demandPriceSpearman: 0, velocityActive: false, snapshotDays: 0, backtest: null, generatedAt: new Date().toISOString(), scope };
  }

  // Bulk fetch — never per-card. For GLOBAL, pull every market's history/supply (no
  // country filter); for a single market, filter to it.
  const cutoff = new Date(Date.now() - HISTORY_DAYS * 86400_000);
  const [histRows, supplyRows, velocity, snapshotDays] = await Promise.all([
    // PriceHistory lives in the split-off history database (see lib/db-history.ts)
    // — every other reader of this table (price-history.ts, market-index.ts,
    // screener.ts) already goes through dbHistory; this one was still reading the
    // OPERATIONAL client, landing a 400-card × 120-day pull on the database
    // that's actually strained. Fixed to match the established pattern.
    dbHistory.priceHistory.findMany({
      where: { cardId: { in: ids }, day: { gte: cutoff }, ...(isGlobal ? {} : { country: scope }) },
      orderBy: { day: "asc" },
      select: { cardId: true, country: true, day: true, lowestPriceCents: true },
    }),
    prisma.retailerPrice.groupBy({
      by: ["cardId"],
      where: { cardId: { in: ids }, inStock: true, ...(isGlobal ? {} : { country: scope }) },
      _count: { _all: true },
    }),
    getDemandVelocity(ids),
    demandSnapshotDays(),
  ]);

  // Price series per card. Single market → its rows. GLOBAL → the market with the MOST
  // points for that card (best coverage); % timing signals are currency-neutral, so
  // this is sound. basisById records which market drove each card.
  const seriesById = new Map<string, PricePoint[]>();
  const basisById = new Map<string, Country>();
  if (isGlobal) {
    const byCardCountry = new Map<string, Map<Country, PricePoint[]>>();
    for (const r of histRows) {
      const c = (r.country as Country) || "AU";
      let m = byCardCountry.get(r.cardId);
      if (!m) byCardCountry.set(r.cardId, (m = new Map()));
      (m.get(c) ?? m.set(c, []).get(c)!).push({ t: r.day.getTime(), v: r.lowestPriceCents });
    }
    for (const [cardId, m] of byCardCountry) {
      let best: Country = "AU";
      let bestLen = -1;
      for (const [c, pts] of m) if (pts.length > bestLen) { bestLen = pts.length; best = c; }
      seriesById.set(cardId, m.get(best)!);
      basisById.set(cardId, best);
    }
  } else {
    for (const r of histRows) {
      (seriesById.get(r.cardId) ?? seriesById.set(r.cardId, []).get(r.cardId)!).push({ t: r.day.getTime(), v: r.lowestPriceCents });
      basisById.set(r.cardId, scope);
    }
  }
  const supplyById = new Map<string, number>(supplyRows.map((r) => [r.cardId, r._count._all]));
  const velocityActive = velocity.size > 0;

  // Market for a card's displayed price: its series market, else (GLOBAL) the first
  // market that actually has a price, else the scope market.
  const basisMarketOf = (card: UniverseCard): Country =>
    basisById.get(card.id) ?? (isGlobal ? MARKET_PREF.find((c) => pickPrice(card, c) != null) ?? "AU" : scope);

  // Qualifying set: enough price history to trust the signals.
  type Row = { card: UniverseCard; s: Signals; points: PricePoint[]; listings: number };
  const rows: Row[] = [];
  for (const card of universe) {
    const points = seriesById.get(card.id);
    if (!points || points.length < MIN_POINTS) continue;
    rows.push({ card, s: computeSignals(points), points, listings: supplyById.get(card.id) ?? 0 });
  }
  const qualifying = rows.length;
  if (!qualifying) {
    return { picks: [], universeSize: universe.length, qualifying: 0, demandPriceSpearman: 0, velocityActive, snapshotDays, backtest: backtest(seriesById), generatedAt: new Date().toISOString(), scope };
  }

  // Feature vectors → cross-sectional z-scores (fair comparison across cards).
  const demandRaw = rows.map((r) => Math.log1p(r.card.searchCount));
  const velRaw = rows.map((r) => velocity.get(r.card.id)?.searchPerDay ?? 0);
  const roomRaw = rows.map((r) => 1 - r.s.posPct); // near low = more room
  const scarcityRaw = rows.map((r) => -Math.log1p(r.listings)); // fewer listings = higher
  const momRaw = rows.map((r) => clamp(r.s.trend7, -20, OVERHEAT_PCT)); // reward emerging, cap the overheated
  const volRaw = rows.map((r) => r.s.volatilityPct);

  const zd = zScores(demandRaw);
  const zvel = velocityActive ? zScores(velRaw) : rows.map(() => 0);
  const zroom = zScores(roomRaw);
  const zscar = zScores(scarcityRaw);
  const zmom = zScores(momRaw);
  const zvol = zScores(volRaw);

  const rawScore = rows.map((r, i) => {
    const overheatPenalty = r.s.trend7 > OVERHEAT_PCT ? (r.s.trend7 - OVERHEAT_PCT) / 15 : 0;
    return (
      W.demand * zd[i] +
      W.velocity * zvel[i] +
      W.room * zroom[i] +
      W.scarcity * zscar[i] +
      W.momentum * zmom[i] +
      W.volatility * zvol[i] -
      W.overheat * overheatPenalty
    );
  });
  const score100 = percentileRanks(rawScore);

  const built: { pick: RisePick; raw: number }[] = rows.map((r, i) => {
    const vel = velocity.get(r.card.id);
    const pts = r.points.length;
    const bm = basisMarketOf(r.card);
    const confidence: RisePick["confidence"] =
      pts >= 14 && r.listings >= 3 ? "High" : pts >= 7 ? "Medium" : "Low";
    const pick: RisePick = {
      id: r.card.id,
      slug: r.card.slug,
      displayName: cardDisplayName(r.card.name, r.card),
      setCode: r.card.setCode,
      collectorNumber: r.card.collectorNumber,
      imageThumbUrl: r.card.imageThumbUrl,
      score: score100[i],
      components: {
        demand: Math.round(zd[i] * 100) / 100,
        velocity: Math.round(zvel[i] * 100) / 100,
        room: Math.round(zroom[i] * 100) / 100,
        scarcity: Math.round(zscar[i] * 100) / 100,
        momentum: Math.round(zmom[i] * 100) / 100,
        volatility: Math.round(zvol[i] * 100) / 100,
      },
      priceCents: pickPrice(r.card, bm),
      currency: currencyOf(bm),
      basisMarket: bm,
      searchCount: r.card.searchCount,
      viewCount: r.card.viewCount,
      trend7: r.s.trend7,
      trend30: r.s.trend30,
      posPct: r.s.posPct,
      volatilityPct: r.s.volatilityPct,
      listings: r.listings,
      searchPerDay: vel?.searchPerDay ?? null,
      searchGrowthPct: vel?.searchGrowthPct ?? null,
      historyPoints: pts,
      spark: r.points.slice(-30).map((p) => p.v),
      confidence,
      overheated: r.s.trend7 > OVERHEAT_PCT,
    };
    return { pick, raw: rawScore[i] };
  });
  const picks: RisePick[] = built.sort((a, b) => b.raw - a.raw).slice(0, DISPLAY).map((b) => b.pick);

  // Context: how correlated demand rank is with price rank (positive is normal; the
  // picks are the high-demand / low-price residuals the score surfaces).
  const demandPriceSpearman = Math.round(spearman(rows.map((r) => r.card.searchCount), rows.map((r) => pickPrice(r.card, basisMarketOf(r.card)) ?? 0)) * 100) / 100;

  return {
    picks,
    universeSize: universe.length,
    qualifying,
    demandPriceSpearman,
    velocityActive,
    snapshotDays,
    backtest: backtest(seriesById),
    generatedAt: new Date().toISOString(),
    scope,
  };
}
