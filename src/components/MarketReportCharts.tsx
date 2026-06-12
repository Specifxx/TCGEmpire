import type { SeriesPoint } from "@/lib/market-report";

// Chart primitives for the daily market report. Everything renders on the server
// as plain SVG/HTML — no client JS, no chart library — so the diagrams cost
// nothing on mobile and print exactly like a financial-press chart.

export const TREND = {
  up: "#34d399", // emerald-400
  down: "#fb7185", // rose-400
  flat: "#94a3b8", // slate-400
} as const;

export function trendColor(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return TREND.flat;
  return delta > 0 ? TREND.up : TREND.down;
}

const fmtShortDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

// ── The hero chart: index level over the last ~30 sessions ─────────────────────
export function IndexAreaChart({ series, id, ariaLabel }: { series: SeriesPoint[]; id: string; ariaLabel: string }) {
  if (series.length < 2) return null;
  const W = 640;
  const H = 230;
  const PL = 12;
  const PR = 52; // room for the y-axis labels on the right (Bloomberg-style)
  const PT = 14;
  const PB = 26;

  const vs = series.map((p) => p.v);
  const rawMin = Math.min(...vs);
  const rawMax = Math.max(...vs);
  const pad = Math.max((rawMax - rawMin) * 0.18, 0.4); // never a zero-height window
  const min = rawMin - pad;
  const max = rawMax + pad;

  const x = (i: number) => PL + (i / (series.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1).toFixed(1)},${(H - PB).toFixed(1)}L${PL},${(H - PB).toFixed(1)}Z`;

  const first = series[0];
  const last = series[series.length - 1];
  const color = trendColor(last.v - first.v);
  const gridVals = [0, 1, 2, 3].map((i) => min + (i / 3) * (max - min));
  const mid = series[Math.floor((series.length - 1) / 2)];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#252b38" strokeWidth="1" strokeDasharray={i === 0 ? undefined : "3 4"} />
          <text x={W - PR + 6} y={y(v) + 3.5} fontSize="11" fill="#64748b" fontFamily="ui-sans-serif, system-ui">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {/* closing dot + value, the chart's focal point */}
      <circle cx={x(series.length - 1)} cy={y(last.v)} r="3.5" fill={color} />
      <circle cx={x(series.length - 1)} cy={y(last.v)} r="7" fill={color} opacity="0.25" />
      {/* x-axis: first / middle / last session */}
      <text x={PL} y={H - 8} fontSize="11" fill="#64748b" fontFamily="ui-sans-serif, system-ui">
        {fmtShortDay(first.d)}
      </text>
      {series.length >= 5 && (
        <text x={(PL + W - PR) / 2} y={H - 8} fontSize="11" fill="#64748b" textAnchor="middle" fontFamily="ui-sans-serif, system-ui">
          {fmtShortDay(mid.d)}
        </text>
      )}
      <text x={W - PR} y={H - 8} fontSize="11" fill="#94a3b8" textAnchor="end" fontFamily="ui-sans-serif, system-ui">
        {fmtShortDay(last.d)}
      </text>
    </svg>
  );
}

// ── Tiny region/hero sparkline ──────────────────────────────────────────────────
export function Sparkline({ series, id, width = 150, height = 40 }: { series: SeriesPoint[]; id: string; width?: number; height?: number }) {
  if (series.length < 2) return null;
  const P = 3;
  const vs = series.map((p) => p.v);
  const rawMin = Math.min(...vs);
  const rawMax = Math.max(...vs);
  const pad = Math.max((rawMax - rawMin) * 0.15, 0.2);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const x = (i: number) => P + (i / (series.length - 1)) * (width - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / (max - min)) * (height - 2 * P);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1).toFixed(1)},${height - P}L${P},${height - P}Z`;
  const color = trendColor(vs[vs.length - 1] - vs[0]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-hidden="true" style={{ maxWidth: width }}>
      <defs>
        <linearGradient id={`${id}-sfill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-sfill)`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(series.length - 1)} cy={y(vs[vs.length - 1])} r="2.5" fill={color} />
    </svg>
  );
}

// ── Signed-percentage chip (▲ +0.42% / ▼ −0.18%) ───────────────────────────────
export function DeltaChip({ pct, dp = 2 }: { pct: number | null; dp?: number }) {
  if (pct == null) return <span className="text-xs font-semibold text-slate-500">—</span>;
  const cls = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-rose-400" : "text-slate-400";
  return (
    <span className={`text-xs font-bold tabular-nums ${cls}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "■"} {pct > 0 ? "+" : ""}
      {pct.toFixed(dp)}%
    </span>
  );
}

// ── Diverging horizontal bar (regions, movers) ─────────────────────────────────
// A row in a zero-centred bar chart: negative grows left from the axis, positive
// grows right. `scale` is the max |pct| of the chart so rows share an axis.
export function DivergingBar({ pct, scale }: { pct: number | null; scale: number }) {
  const p = pct ?? 0;
  const half = Math.min(Math.abs(p) / scale, 1) * 50;
  return (
    <div className="relative h-4 flex-1 overflow-hidden rounded bg-ink-800">
      {/* centre axis */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-ink-600" />
      <div
        className={`absolute inset-y-1 rounded-sm ${p >= 0 ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
        style={p >= 0 ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }}
      />
    </div>
  );
}

// ── Market breadth: advancers vs decliners as a stacked bar ────────────────────
export function BreadthBar({ rose, fell, flat }: { rose: number; fell: number; flat: number }) {
  const total = rose + fell + flat;
  if (!total) return null;
  const w = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-ink-800">
        {rose > 0 && <div className="bg-emerald-400/90" style={{ width: w(rose) }} />}
        {flat > 0 && <div className="bg-slate-500/70" style={{ width: w(flat) }} />}
        {fell > 0 && <div className="bg-rose-400/90" style={{ width: w(fell) }} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400/90" />
          {rose} advanced
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500/70" />
          {flat} unchanged
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400/90" />
          {fell} declined
        </span>
      </div>
    </div>
  );
}
