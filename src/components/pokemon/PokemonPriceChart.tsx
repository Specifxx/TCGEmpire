import { formatMoney } from "@/lib/format";
import { formatDay } from "@/lib/pokemon/format";
import type { PkPricePointView } from "@/lib/pokemon/types";

// TCGplayer's market price for one product over time, as a plain server-drawn
// SVG line (no chart library, no client JavaScript). One point a day from the
// first import on, so a new product's line is short and says so. It describes
// the past only: no trend line, no projection (CURRENT-STATE "Accuracy").
export function PokemonPriceChart({ points }: { points: PkPricePointView[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        {points.length === 1
          ? `We started recording this product's market price on ${formatDay(points[0].day)}. The chart fills in from the next daily import.`
          : "No market price recorded for this product yet."}
      </p>
    );
  }
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 12 };
  const values = points.map((p) => p.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`TCGplayer market price from ${formatDay(first.day)} to ${formatDay(last.day)}`}>
        <path d={`${d} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`} className="fill-brand-500/10" />
        <path d={d} fill="none" strokeWidth={2} className="stroke-brand-400" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-400 sm:grid-cols-3">
        <span>
          {formatDay(first.day)}: <span className="num font-semibold text-slate-200">{formatMoney(first.cents, "USD")}</span>
        </span>
        <span>
          Range: <span className="num font-semibold text-slate-200">{formatMoney(min, "USD")}</span> to{" "}
          <span className="num font-semibold text-slate-200">{formatMoney(max, "USD")}</span>
        </span>
        <span>
          {formatDay(last.day)}: <span className="num font-semibold text-slate-200">{formatMoney(last.cents, "USD")}</span>
        </span>
      </figcaption>
    </figure>
  );
}
