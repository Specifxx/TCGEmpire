import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { priceField, pickPrice, currencyOf, COUNTRY_LIST, type Country } from "./country";
import { ALL_FALLBACK_RETAILERS } from "./constants";
import { computeSignals } from "./ai-insight";
import {
  historySource,
  GLOBAL_HISTORY_COUNTRY,
  cachedOrDirect,
  sydneyDayKey,
  sydneyWeekKey,
  collapseToWeekly,
  dropBreakWindow,
  globalLowUsd,
  type PricePoint,
} from "./price-history";
import { CONTENT_TAG, HISTORY_TAG } from "./revalidate-content";
import { usdCentsToCountry } from "./fx";
import { cardDisplayName } from "./card-name";
import { getDemandVelocity, demandSnapshotDays, type DemandVelocity } from "./demand-snapshot";
import { zScores, percentileRanks, spearman, mean, median, clamp } from "./stats";

// ── Rise predictor ────────────────────────────────────────────────────────────
// Ranks cards by demand + price-timing signals: search interest that is high or
// rising on a card whose price has not re-rated yet (low in its own recent
// range, thin supply, not already spiking). Every input is a real, quoted data
// field and the score is a transparent weighted sum of cross-sectional z-scores.
//
// HONEST LIMITS (surfaced in the UI): (1) demand VELOCITY needs DemandSnapshot
// rows to accrue — until then that component is 0 and only demand LEVEL is used.
// (2) Price history is written WEEKLY, so the price-timing half moves once a
// week; today's live price is appended as the newest point so the displayed
// price and "vs last week" describe the same number. (3) Price-timing signals
// need MIN_POINTS clean weekly points, counted from the last methodology break
// (dropBreakWindow in price-history.ts): until a card has them it is ranked on
// demand and supply alone, and says so. (4) No track record is published yet,
// so nothing on the page may call the ranking "backtested" or "validated" — the
// admin page's lookahead-free backtest covers only the room-to-run component.
// Not financial advice.
//
// ── THE EGRESS SHAPE (2026-09-25) ────────────────────────────────────────────
// Two self-caching loaders and an UNCACHED assembly:
//   • getRiseHistory() — week-keyed, HISTORY_TAG, scope-independent. The GLOBAL
//     weekly series for the HISTORY_SCAN most-searched priced cards, collapsed
//     to one point per week before it is cached. PriceHistory only changes
//     weekly and every market reads the same GLOBAL series, so this is read
//     about once a week instead of once per scope per import purge (7 scopes ×
//     ~3 purges a day re-read the same ~37k rows before).
//   • getRiseInputs(scope) — day-keyed, CONTENT_TAG: the cheap operational
//     inputs that do change daily (the scope's universe and live prices, supply,
//     demand velocity).
//   • getCachedRisingCards(scope) — awaits both and computes in-process
//     (assembleRisingCards, pure). It is not itself cached, so neither loader is
//     ever called from inside another cache callback (egress rule 6). Nothing may
//     wrap it in a cache either: tests/nested-cache.test.ts lists it as
//     self-cached for exactly that reason.
// Errors are thrown INSIDE the loaders, so unstable_cache never stores a
// failure, and caught OUTSIDE them here, with a short per-instance memo so an
// outage cannot turn every request into a retry against the database.

// Scope: a single market, or GLOBAL. Demand (search/view) is market-agnostic; so
// is price history (every market reads the one GLOBAL series). A single-market
// scope decides the universe (cards priced there), the supply count and the
// currency; GLOBAL uses every market and shows each card's basis-market price.
export type RiseScope = Country | "GLOBAL";

// Reference order for a GLOBAL card's displayed price. Must cover EVERY market in
// COUNTRIES: a card priced only in a market missing from this list falls through
// to the "AU" default and renders AU's price (or a dash) under an AU label, which
// is silently wrong rather than loudly broken. SG/CA were missing for both of
// their launches; EU was added with its own on 2026-08-23.
const MARKET_PREF: Country[] = ["AU", "US", "UK", "SG", "CA", "EU"];

// Every scope a URL may ask for. The tool and /admin/rising both parse through
// here, so a market in the switcher can never silently fall back to Global
// again (SG, CA and EU did until 2026-09-25 — the parser only knew AU/US/UK).
export const RISE_SCOPES: readonly RiseScope[] = ["GLOBAL", ...COUNTRY_LIST.map((c) => c.code)];

export function parseRiseScope(value: string | null | undefined, fallback: RiseScope): RiseScope {
  const v = (value ?? "").trim().toUpperCase();
  return RISE_SCOPES.find((s) => s === v) ?? fallback;
}

const SCAN = 400; // universe per scope: most-searched cards priced in it
const HISTORY_SCAN = 600; // scope-independent history universe (covers every scope's top 400 in practice)
const HISTORY_DAYS = 120;
const SPARK_DAYS = 16 * 7; // the "16 wk" sparkline
const MIN_POINTS = 5; // clean weekly points (live price included) needed to trust the price-timing signals
const BACKTEST_LAG_DAYS = 14;
const OVERHEAT_PCT = 35; // up more than this vs last week = likely already spiked
const MIN_BACKTEST_N = 20;
const DISPLAY = 40;
const DAY_MS = 86400_000;
const FAILURE_MEMO_MS = 5 * 60_000;

// Component weights (transparent, tunable). Demand + room-to-run dominate; velocity
// is the strongest signal WHEN it exists; volatility is a small "will it move" tilt.
const W = { demand: 1.0, velocity: 1.4, room: 1.1, scarcity: 0.7, momentum: 0.5, volatility: 0.25, overheat: 0.8 };

export interface RiseComponents {
  demand: number; // z: attention level (searchCount)
  velocity: number; // z: rising searches/day (0 until snapshots accrue)
  room: number; // z: room to run (near range low); 0 without price signals
  scarcity: number; // z: thin supply
  momentum: number; // z: emerging (not overheated) week-on-week momentum; 0 without price signals
  volatility: number; // z: week-to-week movement; 0 without price signals
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
  currency: string; // currency of priceCents — the card's basis market, NOT the scope's for GLOBAL
  basisMarket: Country; // market whose live price is displayed
  searchCount: number;
  viewCount: number;
  /** True when the card has MIN_POINTS clean weekly points, so posPct / momentum / volatility mean something. */
  priceSignals: boolean;
  /** Today's price vs the clean weekly point nearest a week ago; null when there is none on the current basis. */
  vsLastWeekPct: number | null;
  trend7: number; // = vsLastWeekPct ?? 0 (kept for the frozen Hot 40 snapshots)
  trend30: number; // 0 without price signals
  posPct: number; // 0 = at range low, 1 = at high; 0.5 (neutral) without price signals
  rangeWeeks: number; // weeks the clean series spans — what "its range" means
  volatilityPct: number;
  listings: number; // in-stock store listings (scope market, or every market for GLOBAL); reference rows excluded
  searchPerDay: number | null;
  searchGrowthPct: number | null;
  historyPoints: number;
  spark: number[]; // clean weekly series + today, last 16 weeks, in `currency`
  reason: string; // one plain-English line: why this card ranks where it does
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
  /** Cards with at least MIN_POINTS clean price points — enough to score price timing. */
  qualifying: number;
  // ── Why the price half is dark, when it is ───────────────────────────────
  // `qualifying` alone cannot distinguish "the importer isn't recording
  // anything" from "it is recording fine, there just aren't enough weeks yet"
  // (the admin page once reported the first while the truth was the second).
  // These two make the real state legible: how many cards have ANY recorded
  // history at all, and how deep the best clean series actually is.
  withAnyHistory: number;
  deepestSeries: number;
  /** Points a card needs before its price-timing signals count (MIN_POINTS). */
  minPointsRequired: number;
  demandPriceSpearman: number; // rank-corr of demand vs price (context for divergence)
  velocityActive: boolean;
  snapshotDays: number;
  backtest: RiseBacktest | null;
  generatedAt: string;
  scope: RiseScope;
  /** True when this is the "temporarily unavailable" fallback after a failed load — never "no history yet". */
  failed: boolean;
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
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
  lowestPriceCentsSg: number | null;
  lowestPriceCentsCa: number | null;
  lowestPriceCentsEu: number | null;
};

/** The day-keyed operational half, per scope. Plain objects: it round-trips through JSON in the data cache. */
export type RiseInputs = {
  universe: UniverseCard[];
  supply: Record<string, number>;
  velocity: Record<string, DemandVelocity>;
  snapshotDays: number;
};

/** The week-keyed history half, scope-independent: cardId → [epochDay, GLOBAL USD cents][] (oldest first, one per week). */
export type RiseHistory = { series: Record<string, [number, number][]> };

// Lookahead-free backtest of the reconstructable price-timing signal ("room to run"
// = 1 − position-in-range at T−lag) vs realised forward return over the lag. Only
// price data up to T−lag is used to build the historical signal. Admin-only: it is
// directional evidence for ONE component, not a track record for the ranking.
export function backtest(seriesById: Map<string, PricePoint[]>): RiseBacktest | null {
  const lagMs = BACKTEST_LAG_DAYS * DAY_MS;
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

// The "nothing to show" result. Shared so the empty-universe path and the
// failure path can't drift apart; `failed` is what tells the page which one.
function emptyAnalysis(scope: RiseScope, failed = false): RiseAnalysis {
  return {
    picks: [], universeSize: 0, qualifying: 0,
    withAnyHistory: 0, deepestSeries: 0, minPointsRequired: MIN_POINTS,
    demandPriceSpearman: 0, velocityActive: false, snapshotDays: 0,
    backtest: null, generatedAt: new Date().toISOString(), scope, failed,
  };
}

// Where a failed load is remembered, per scope, so an outage costs one attempt
// per FAILURE_MEMO_MS per instance rather than one per request. Per-instance
// memory on serverless — a soft cap, which is all this needs to be.
const failedUntil = new Map<RiseScope, number>();

// THE ONE entry point — /tools/rising, /admin/rising, the homepage deals feed,
// the admin Hot 40 snapshot and the premium nudge all read this, so a visit to
// any of them warms the loaders for the rest. Not a cache itself (see the header):
// never wrap it in one, and never call it from inside an unstable_cache callback.
export function getCachedRisingCards(scope: RiseScope): Promise<RiseAnalysis> {
  if ((failedUntil.get(scope) ?? 0) > Date.now()) return Promise.resolve(emptyAnalysis(scope, true));
  return Promise.all([getRiseHistory(), getRiseInputs(scope)])
    .then(([history, inputs]) => assembleRisingCards(scope, inputs, history, Date.now()))
    .catch((err) => {
      // Logged, not swallowed silently: a persistently unavailable screener with
      // a stack trace in the function logs is diagnosable; one without isn't.
      console.error(`[rise-predictor] getCachedRisingCards(${scope}) failed — serving "temporarily unavailable":`, err);
      failedUntil.set(scope, Date.now() + FAILURE_MEMO_MS);
      return emptyAnalysis(scope, true);
    });
}

// ── Loader 1: scope-independent weekly history ───────────────────────────────
export function getRiseHistory(): Promise<RiseHistory> {
  return cachedOrDirect(() => computeRiseHistory(), ["rc-rise-history", sydneyWeekKey()], {
    revalidate: 8 * 86400, // one week + a day of slack; the week key is what refreshes it
    tags: [HISTORY_TAG],
  });
}

async function computeRiseHistory(): Promise<RiseHistory> {
  // No try/catch: a failure must reach getCachedRisingCards, not be cached.
  const top = await prisma.card.findMany({
    where: { searchCount: { gt: 0 }, ...pricedIn("GLOBAL") },
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    take: HISTORY_SCAN,
    select: { id: true },
  });
  const ids = top.map((c) => c.id);
  const series: RiseHistory["series"] = {};
  const history: RiseHistory = { series };
  if (!ids.length) return history;

  // PriceHistory lives in the split-off history database (lib/db-history.ts).
  // Every scope reads this one GLOBAL series (historySource() maps every market
  // to it), converted per scope at assembly time.
  const cutoff = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
  const rows = await dbHistory.priceHistory.findMany({
    where: { cardId: { in: ids }, day: { gte: cutoff }, country: GLOBAL_HISTORY_COUNTRY },
    orderBy: { day: "asc" },
    select: { cardId: true, day: true, lowestPriceCents: true },
  });
  const byCard = new Map<string, { day: Date; lowestPriceCents: number }[]>();
  for (const r of rows) (byCard.get(r.cardId) ?? byCard.set(r.cardId, []).get(r.cardId)!).push(r);

  // One point per week BEFORE caching: the GLOBAL series still carries legacy
  // daily rows from before 2026-08-31, which both bloated this entry and made
  // the old "30d" sparkline mostly August. Stored as [epochDay, cents] to keep
  // the entry small (~600 cards × ≤18 points).
  for (const [cardId, list] of byCard) {
    series[cardId] = collapseToWeekly(list).map((r) => [Math.round(r.day.getTime() / DAY_MS), r.lowestPriceCents]);
  }
  return history;
}

// ── Loader 2: the day-keyed operational inputs, per scope ────────────────────
export function getRiseInputs(scope: RiseScope): Promise<RiseInputs> {
  return cachedOrDirect(() => computeRiseInputs(scope), ["rc-rise-inputs", scope, sydneyDayKey()], {
    revalidate: 172800, // freshness is import-driven (CONTENT_TAG); the TTL is only the fallback
    tags: [CONTENT_TAG],
  });
}

function pricedIn(scope: RiseScope) {
  return scope === "GLOBAL"
    ? {
        // Every priced market, not just the original three — a card priced ONLY
        // in SG/CA is still a real, rankable card, and omitting those columns
        // here quietly excluded them from the GLOBAL universe entirely.
        OR: [
          { lowestPriceCents: { not: null } },
          { lowestPriceCentsUs: { not: null } },
          { lowestPriceCentsUk: { not: null } },
          { lowestPriceCentsSg: { not: null } },
          { lowestPriceCentsCa: { not: null } },
          { lowestPriceCentsEu: { not: null } },
        ],
      }
    : { [priceField(scope)]: { not: null } };
}

async function computeRiseInputs(scope: RiseScope): Promise<RiseInputs> {
  // No try/catch here either — see computeRiseHistory.
  const universe = (await prisma.card.findMany({
    where: { searchCount: { gt: 0 }, ...pricedIn(scope) },
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    take: SCAN,
    select: {
      id: true, slug: true, name: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, rarity: true, imageThumbUrl: true,
      searchCount: true, viewCount: true,
      // MUST list every field UniverseCard declares. The `as UniverseCard[]` cast
      // below is a lie the compiler cannot catch: an unselected column arrives as
      // `undefined`, so pickPrice() returned null and the price rendered as "—"
      // for every card whose basis market was SG or CA.
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
      lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
    },
  })) as UniverseCard[];

  const ids = universe.map((c) => c.id);
  const none: RiseInputs = { universe: [], supply: {}, velocity: {}, snapshotDays: 0 };
  if (!ids.length) return none;

  // Bulk reads — never per-card. Supply counts real stores only: a converted
  // reference row (TCGplayer AU/UK/SG, Cardmarket, tcgplayer_market) is not a
  // listing anyone can buy, the same exclusion the "N stores" tile label makes.
  const [supplyRows, velocity, snapshotDays] = await Promise.all([
    prisma.retailerPrice.groupBy({
      by: ["cardId"],
      where: {
        cardId: { in: ids },
        inStock: true,
        retailer: { notIn: [...ALL_FALLBACK_RETAILERS] },
        ...(scope === "GLOBAL" ? {} : { country: scope }),
      },
      _count: { _all: true },
    }),
    getDemandVelocity(ids),
    demandSnapshotDays(),
  ]);
  const inputs: RiseInputs = {
    universe,
    supply: Object.fromEntries(supplyRows.map((r) => [r.cardId, r._count._all])),
    velocity: Object.fromEntries(velocity),
    snapshotDays,
  };
  return inputs;
}

// ── The assembly: pure, in-process, uncached ────────────────────────────────
// Exported for tests (tests/rising-cards.test.ts drives it with synthetic
// inputs — no database).
export function assembleRisingCards(scope: RiseScope, inputs: RiseInputs, history: RiseHistory, now: number): RiseAnalysis {
  const isGlobal = scope === "GLOBAL";
  const { universe } = inputs;
  if (!universe.length) return emptyAnalysis(scope);

  // GLOBAL keeps the stored USD figure (signals are percentages, and the spark
  // converts once each card's basis market is known); a single market converts
  // up front, like every other single-market reader of the series.
  const convert = isGlobal ? (usd: number) => usd : historySource(scope).convert;

  // Clean series per card: its recorded weekly GLOBAL lows, plus today's live
  // GLOBAL low (the same cheapest-of-AU/US/UK/SG rule the weekly snapshot uses,
  // so the two sit on one basis), minus every point from before the latest
  // methodology break. Only cards with at least one RECORDED point are in the
  // map, so withAnyHistory still means "has price history".
  const seriesById = new Map<string, PricePoint[]>();
  for (const card of universe) {
    const recorded = history.series[card.id];
    if (!recorded?.length) continue;
    const pts: PricePoint[] = recorded.map(([day, usd]) => ({ t: day * DAY_MS, v: convert(usd) }));
    const live = globalLowUsd(card);
    if (live != null && now > pts[pts.length - 1].t) pts.push({ t: now, v: convert(live) });
    seriesById.set(card.id, dropBreakWindow(pts));
  }
  const withAnyHistory = seriesById.size;
  let deepestSeries = 0;
  for (const pts of seriesById.values()) if (pts.length > deepestSeries) deepestSeries = pts.length;

  // Market for a card's displayed price: `scope` for a single market, else
  // (GLOBAL) the first market in MARKET_PREF that has a live price.
  const basisMarketOf = (card: UniverseCard): Country =>
    isGlobal ? MARKET_PREF.find((c) => pickPrice(card, c) != null) ?? "AU" : scope;

  type Row = {
    card: UniverseCard;
    points: PricePoint[];
    priceSignals: boolean;
    vsLastWeek: number | null;
    trend30: number;
    posPct: number;
    volatilityPct: number;
    listings: number;
    velocity: DemandVelocity | undefined;
  };
  const rows: Row[] = universe.map((card) => {
    const points = seriesById.get(card.id) ?? [];
    const priceSignals = points.length >= MIN_POINTS;
    const s = points.length >= 2 ? computeSignals(points) : null;
    // "vs last week" needs a clean point roughly a week back — not merely any
    // older point (a series restarted by a break can be two points a day apart).
    const hasWeekAgo = points.length >= 2 && points[points.length - 1].t - points[0].t >= 5 * DAY_MS;
    const row: Row = {
      card,
      points,
      priceSignals,
      vsLastWeek: s && hasWeekAgo ? s.trend7 : null,
      trend30: s && priceSignals ? s.trend30 : 0,
      posPct: s && priceSignals ? s.posPct : 0.5,
      volatilityPct: s && priceSignals ? s.volatilityPct : 0,
      listings: inputs.supply[card.id] ?? 0,
      velocity: inputs.velocity[card.id],
    };
    return row;
  });
  const qualifying = rows.filter((r) => r.priceSignals).length;
  const velocityActive = Object.keys(inputs.velocity).length > 0;

  // Feature vectors → cross-sectional z-scores. Demand, velocity and supply
  // cover the whole universe. The price-timing features are z-scored among the
  // cards that HAVE price signals only; every other card gets a neutral 0 for
  // them — the same way velocity sits at 0 until snapshots accrue — so a card
  // is never rewarded or punished for history it does not have.
  const zd = zScores(rows.map((r) => Math.log1p(r.card.searchCount)));
  const zvel = velocityActive ? zScores(rows.map((r) => r.velocity?.searchPerDay ?? 0)) : rows.map(() => 0);
  const zscar = zScores(rows.map((r) => -Math.log1p(r.listings))); // fewer listings = higher
  const priced = rows.map((r, i) => (r.priceSignals ? i : -1)).filter((i) => i >= 0);
  const subsetZ = (f: (r: Row) => number): number[] => {
    const out = rows.map(() => 0);
    const z = zScores(priced.map((i) => f(rows[i])));
    priced.forEach((i, k) => (out[i] = z[k]));
    return out;
  };
  const zroom = subsetZ((r) => 1 - r.posPct); // near low = more room
  const zmom = subsetZ((r) => clamp(r.vsLastWeek ?? 0, -20, OVERHEAT_PCT)); // reward emerging, cap the overheated
  const zvol = subsetZ((r) => r.volatilityPct);

  const rawScore = rows.map((r, i) => {
    const up = r.vsLastWeek ?? 0;
    const overheatPenalty = up > OVERHEAT_PCT ? (up - OVERHEAT_PCT) / 15 : 0;
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
  const round2 = (x: number) => Math.round(x * 100) / 100;

  const built = rows.map((r, i) => {
    const pts = r.points.length;
    const bm = basisMarketOf(r.card);
    const rangeWeeks = pts >= 2 ? Math.max(1, Math.round((r.points[pts - 1].t - r.points[0].t) / (7 * DAY_MS))) : 0;
    const confidence: RisePick["confidence"] =
      r.priceSignals && pts >= 8 && r.listings >= 3 ? "High" : r.priceSignals ? "Medium" : "Low";
    const overheated = (r.vsLastWeek ?? 0) > OVERHEAT_PCT;
    const pick: RisePick = {
      id: r.card.id,
      slug: r.card.slug,
      displayName: cardDisplayName(r.card.name, r.card),
      setCode: r.card.setCode,
      collectorNumber: r.card.collectorNumber,
      imageThumbUrl: r.card.imageThumbUrl,
      score: score100[i],
      components: {
        demand: round2(zd[i]),
        velocity: round2(zvel[i]),
        room: round2(zroom[i]),
        scarcity: round2(zscar[i]),
        momentum: round2(zmom[i]),
        volatility: round2(zvol[i]),
      },
      priceCents: pickPrice(r.card, bm),
      currency: currencyOf(bm),
      basisMarket: bm,
      searchCount: r.card.searchCount,
      viewCount: r.card.viewCount,
      priceSignals: r.priceSignals,
      vsLastWeekPct: r.vsLastWeek,
      trend7: r.vsLastWeek ?? 0,
      trend30: r.trend30,
      posPct: r.posPct,
      rangeWeeks,
      volatilityPct: r.volatilityPct,
      listings: r.listings,
      searchPerDay: r.velocity?.searchPerDay ?? null,
      searchGrowthPct: r.velocity?.searchGrowthPct ?? null,
      historyPoints: pts,
      // GLOBAL's series is raw USD — convert to bm's currency so the sparkline
      // matches priceCents/currency. Last 16 weeks only, spaced as recorded.
      spark: r.points.filter((p) => p.t >= now - SPARK_DAYS * DAY_MS).map((p) => (isGlobal ? usdCentsToCountry(p.v, bm) : p.v)),
      reason: "",
      confidence,
      overheated,
    };
    pick.reason = riseReason(pick, scope);
    return { pick, raw: rawScore[i] };
  });
  const picks: RisePick[] = built.sort((a, b) => b.raw - a.raw).slice(0, DISPLAY).map((b) => b.pick);

  // Context: how correlated demand rank is with price rank (positive is normal; the
  // picks are the high-demand / low-price residuals the score surfaces).
  const demandPriceSpearman =
    Math.round(spearman(rows.map((r) => r.card.searchCount), rows.map((r) => pickPrice(r.card, basisMarketOf(r.card)) ?? 0)) * 100) / 100;

  return {
    picks,
    universeSize: universe.length,
    qualifying,
    withAnyHistory,
    deepestSeries,
    minPointsRequired: MIN_POINTS,
    demandPriceSpearman,
    velocityActive,
    snapshotDays: inputs.snapshotDays,
    backtest: backtest(seriesById),
    generatedAt: new Date(now).toISOString(),
    scope,
    failed: false,
  };
}

// One plain line per pick, built only from fields on the row — the page shows
// it under the card name in place of the old unlabelled z-score bars.
export function riseReason(p: RisePick, scope: RiseScope): string {
  const parts: string[] = [];
  if (!p.priceSignals) {
    parts.push("Price history rebuilding, ranked on demand and supply");
  } else if (p.posPct <= 0.25) {
    parts.push(`Near the low of its ${p.rangeWeeks}-week range`);
  } else if (p.posPct >= 0.75) {
    parts.push(`Near the high of its ${p.rangeWeeks}-week range`);
  } else {
    parts.push(`Mid-range over ${p.rangeWeeks} weeks`);
  }
  if (p.overheated && p.vsLastWeekPct != null) parts.push(`already up ${Math.round(p.vsLastWeekPct)}% on last week`);
  if (p.searchGrowthPct != null && p.searchGrowthPct >= 5) parts.push(`searches +${Math.round(p.searchGrowthPct)}% in 3 weeks`);
  else if (p.searchPerDay != null && p.searchPerDay >= 1) parts.push(`${formatRate(p.searchPerDay)} searches a day`);
  else parts.push(`${p.searchCount.toLocaleString("en-US")} searches all-time`);
  const where = scope === "GLOBAL" ? "" : ` in ${scope}`;
  if (p.listings === 0) parts.push(`no store has it in stock${where}`);
  else parts.push(`${p.listings} ${p.listings === 1 ? "store" : "stores"} in stock${where}`);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function formatRate(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}
