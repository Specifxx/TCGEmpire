// The 7-day change helper, all that is left of the homepage's "Riftbound card
// prices today" table (removed from "/" 2026-09-30 and from the region homes
// 2026-10-02, replaced by a link to /price-guide — DECISIONS.md). The price
// guide computes its 7-day column with it.
import { STALE_HISTORY_MS } from "./price-history";

const SEVEN_DAYS = 7 * 86400_000;
// Same outlier guard as lib/price-history.ts's movers: a swing this large is a
// mismatched listing far more often than a real move, so it is not shown.
const OUTLIER_DROP = 80;
const OUTLIER_SPIKE = 300;

/** Pure: the 7-day change for one card's weekly series (oldest first). */
export function sevenDayChange(points: { t: number; v: number }[], now = Date.now()): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  if (now - last.t > STALE_HISTORY_MS) return null;
  const target = last.t - SEVEN_DAYS;
  let ref = points[0];
  for (const p of points.slice(0, -1)) if (Math.abs(p.t - target) < Math.abs(ref.t - target)) ref = p;
  if (ref === last || ref.v <= 0) return null;
  const pct = ((last.v - ref.v) / ref.v) * 100;
  if (pct >= OUTLIER_SPIKE || pct <= -OUTLIER_DROP) return null;
  return Math.round(pct * 10) / 10;
}
