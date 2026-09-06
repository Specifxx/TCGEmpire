import { dbHistory } from "./db-history";
import { getSealedGroups, type SealedGroup } from "./sealed-import";
import { DEFAULT_COUNTRY, currencyOf, type Country } from "./country";
import { computeSignals, type Signals } from "./ai-insight";
import { type PricePoint } from "./price-history";
import { backtest, type RiseBacktest } from "./rise-predictor";
import { zScores, percentileRanks, clamp } from "./stats";

// ── Sealed rise predictor ───────────────────────────────────────────────────
// The sealed-side sibling of rise-predictor.ts: ranks sealed products (booster
// boxes, packs, bundles, …) most likely to rise soon. Reuses that module's own
// backtest() and ai-insight.ts's computeSignals() directly rather than
// reimplementing them — both are already generic over "a priced thing with a
// history", not hard-coded to cards.
//
// HONEST LIMITS (surfaced in the UI): this is PRICE-TIMING AND SUPPLY ONLY —
// there is deliberately no demand component and no demand-velocity component.
// Rising Cards' demand signal is real search/view traffic (Card.searchCount,
// DemandSnapshot); nothing equivalent is tracked for sealed products today,
// and inventing a demand proxy would dress up a made-up number as if it
// meant something. So unlike RiseComponents, SealedRiseComponents simply has
// no demand/velocity fields at all — not zeroed-out placeholders, genuinely
// absent — and the backtest (which only ever validated price-timing, never
// demand — see backtest's own comment) is exactly as valid here as for cards.
//
// SCOPE: a single market — no GLOBAL. One region priced in its own real
// currency beats a blend, and every market's sealed history is already
// tracked natively (no CA/EU derivation needed here either).

const HISTORY_DAYS = 120; // matches rise-predictor.ts's own window
const MIN_POINTS = 5; // price points needed to trust the signals — same bar as cards
const OVERHEAT_PCT = 35; // 7-day gain above this = likely already spiked
const DISPLAY_MIN_STORES = 3; // "High" confidence needs at least this many live listings

// Component weights — no demand/velocity terms exist to weight (see file header).
const W = { room: 1.1, scarcity: 0.7, momentum: 0.5, volatility: 0.25, overheat: 0.8 };

export interface SealedRiseComponents {
  room: number; // z: room to run (near range low)
  scarcity: number; // z: thin in-stock supply (fewer live listings)
  momentum: number; // z: emerging (not overheated) 7-day momentum
  volatility: number; // z: day-to-day movement
}

export interface SealedRisePick {
  id: string; // groupKey
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  score: number; // 0–100 percentile of the composite
  components: SealedRiseComponents;
  priceCents: number | null;
  currency: string;
  trend7: number;
  trend30: number;
  posPct: number; // 0 = at range low, 1 = at high
  volatilityPct: number;
  storeCount: number; // live in-stock listings right now
  historyPoints: number;
  spark: number[]; // recent price series for a mini chart
  confidence: "High" | "Medium" | "Low";
  overheated: boolean;
}

export interface SealedRiseAnalysis {
  picks: SealedRisePick[];
  universeSize: number;
  /** Products with at least MIN_POINTS price points — i.e. enough to score. */
  qualifying: number;
  /** Products with ANY tracked history at all (see RiseAnalysis's own comment on why this is tracked separately from `qualifying`). */
  withAnyHistory: number;
  deepestSeries: number;
  /** Points a product needs before it can be scored (MIN_POINTS). */
  minPointsRequired: number;
  backtest: RiseBacktest | null;
  generatedAt: string;
  market: Country;
}

function emptyAnalysis(market: Country): SealedRiseAnalysis {
  return {
    picks: [], universeSize: 0, qualifying: 0,
    withAnyHistory: 0, deepestSeries: 0, minPointsRequired: MIN_POINTS,
    backtest: null, generatedAt: new Date().toISOString(), market,
  };
}

// NEVER let a data anomaly 500 the page — same reasoning as getRisingCards.
export async function getRisingSealed(market: Country = DEFAULT_COUNTRY): Promise<SealedRiseAnalysis> {
  try {
    return await computeRisingSealed(market);
  } catch (err) {
    console.error(`[sealed-rise-predictor] getRisingSealed(${market}) failed — serving an empty analysis:`, err);
    return emptyAnalysis(market);
  }
}

async function computeRisingSealed(market: Country): Promise<SealedRiseAnalysis> {
  // Universe: every shipped (non-preorder), currently-priced sealed group in this
  // market — the whole small catalogue, same constituent rule as the Sealed Index.
  const groups = (await getSealedGroups(market)).filter((g) => g.lowestPriceCents != null);
  if (!groups.length) return emptyAnalysis(market);

  const cutoff = new Date(Date.now() - HISTORY_DAYS * 86400_000);
  const histRows = await dbHistory.sealedPriceHistory.findMany({
    where: { country: market, groupKey: { in: groups.map((g) => g.groupKey) }, day: { gte: cutoff } },
    orderBy: { day: "asc" },
    select: { groupKey: true, day: true, lowestPriceCents: true },
  });

  const seriesByGroup = new Map<string, PricePoint[]>();
  for (const r of histRows) {
    (seriesByGroup.get(r.groupKey) ?? seriesByGroup.set(r.groupKey, []).get(r.groupKey)!).push({ t: r.day.getTime(), v: r.lowestPriceCents });
  }

  type Row = { group: SealedGroup; s: Signals; points: PricePoint[] };
  const rows: Row[] = [];
  for (const g of groups) {
    const points = seriesByGroup.get(g.groupKey);
    if (!points || points.length < MIN_POINTS) continue;
    rows.push({ group: g, s: computeSignals(points), points });
  }
  const qualifying = rows.length;
  // Same diagnostic split as rise-predictor.ts: distinguishes "nothing tracked
  // yet" from "tracked, just not deep enough" — the warming-up copy on the page
  // depends on telling those two states apart honestly.
  const withAnyHistory = seriesByGroup.size;
  let deepestSeries = 0;
  for (const pts of seriesByGroup.values()) if (pts.length > deepestSeries) deepestSeries = pts.length;

  if (!qualifying) {
    return {
      picks: [], universeSize: groups.length, qualifying: 0,
      withAnyHistory, deepestSeries, minPointsRequired: MIN_POINTS,
      backtest: backtest(seriesByGroup), generatedAt: new Date().toISOString(), market,
    };
  }

  // Feature vectors → cross-sectional z-scores (fair comparison across products).
  const roomRaw = rows.map((r) => 1 - r.s.posPct); // near low = more room
  const scarcityRaw = rows.map((r) => -Math.log1p(r.group.storeCount)); // fewer live listings = higher
  const momRaw = rows.map((r) => clamp(r.s.trend7, -20, OVERHEAT_PCT)); // reward emerging, cap the overheated
  const volRaw = rows.map((r) => r.s.volatilityPct);

  const zroom = zScores(roomRaw);
  const zscar = zScores(scarcityRaw);
  const zmom = zScores(momRaw);
  const zvol = zScores(volRaw);

  const rawScore = rows.map((r, i) => {
    const overheatPenalty = r.s.trend7 > OVERHEAT_PCT ? (r.s.trend7 - OVERHEAT_PCT) / 15 : 0;
    return W.room * zroom[i] + W.scarcity * zscar[i] + W.momentum * zmom[i] + W.volatility * zvol[i] - W.overheat * overheatPenalty;
  });
  const score100 = percentileRanks(rawScore);

  const built: { pick: SealedRisePick; raw: number }[] = rows.map((r, i) => {
    const pts = r.points.length;
    const confidence: SealedRisePick["confidence"] =
      pts >= 14 && r.group.storeCount >= DISPLAY_MIN_STORES ? "High" : pts >= 7 ? "Medium" : "Low";
    const pick: SealedRisePick = {
      id: r.group.groupKey,
      name: r.group.name,
      productType: r.group.productType,
      setCode: r.group.setCode,
      imageUrl: r.group.imageUrl,
      score: score100[i],
      components: {
        room: Math.round(zroom[i] * 100) / 100,
        scarcity: Math.round(zscar[i] * 100) / 100,
        momentum: Math.round(zmom[i] * 100) / 100,
        volatility: Math.round(zvol[i] * 100) / 100,
      },
      priceCents: r.group.lowestPriceCents,
      currency: currencyOf(market),
      trend7: r.s.trend7,
      trend30: r.s.trend30,
      posPct: r.s.posPct,
      volatilityPct: r.s.volatilityPct,
      storeCount: r.group.storeCount,
      historyPoints: pts,
      spark: r.points.slice(-30).map((p) => p.v),
      confidence,
      overheated: r.s.trend7 > OVERHEAT_PCT,
    };
    return { pick, raw: rawScore[i] };
  });
  // No DISPLAY cap unlike rise-predictor.ts's SCAN/DISPLAY (400 scanned, top 40
  // shown): the sealed catalogue is already small (~30 groups per market), so
  // every qualifying product is shown, ranked.
  const picks: SealedRisePick[] = built.sort((a, b) => b.raw - a.raw).map((b) => b.pick);

  return {
    picks,
    universeSize: groups.length,
    qualifying,
    withAnyHistory,
    deepestSeries,
    minPointsRequired: MIN_POINTS,
    backtest: backtest(seriesByGroup),
    generatedAt: new Date().toISOString(),
    market,
  };
}
