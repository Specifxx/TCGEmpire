// Price signals for one card's series: where today's price sits in its range,
// its 7- and 30-day trend and its day-to-day volatility. Pure and free. Used by
// the rise predictor (lib/rise-predictor.ts). It lived in lib/ai-insight.ts until
// the AI card insight and the Trade Roast, its only model calls, were retired
// on 2026-10-16 (DECISIONS.md, "Nothing paid that nobody uses").
import type { PricePoint } from "./price-history";

export type Signals = {
  n: number;
  nowCents: number;
  minCents: number;
  maxCents: number;
  posPct: number; // 0 = at its low, 1 = at its high
  trend7: number; // % change vs ~7 days ago
  trend30: number; // % change vs ~30 days ago / oldest
  volatilityPct: number;
};

function nearestTo(points: PricePoint[], targetT: number): PricePoint {
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - targetT) < Math.abs(best.t - targetT)) best = p;
  return best;
}

export function computeSignals(points: PricePoint[]): Signals {
  const n = points.length;
  const now = points[n - 1]?.v ?? 0;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = Math.max(1, max - min);
  const nowT = points[n - 1]?.t ?? Date.now();
  const ref7 = nearestTo(points, nowT - 7 * 86400_000);
  const ref30 = nearestTo(points, nowT - 30 * 86400_000);
  const trend7 = ref7.v > 0 ? ((now - ref7.v) / ref7.v) * 100 : 0;
  const trend30 = ref30.v > 0 ? ((now - ref30.v) / ref30.v) * 100 : 0;
  // Volatility = mean absolute day-over-day % move.
  let moves = 0, sum = 0;
  for (let i = 1; i < n; i++) {
    if (points[i - 1].v > 0) { sum += Math.abs((points[i].v - points[i - 1].v) / points[i - 1].v) * 100; moves++; }
  }
  return {
    n,
    nowCents: now,
    minCents: min,
    maxCents: max,
    posPct: (now - min) / range,
    trend7: Math.round(trend7 * 10) / 10,
    trend30: Math.round(trend30 * 10) / 10,
    volatilityPct: moves ? Math.round((sum / moves) * 10) / 10 : 0,
  };
}
