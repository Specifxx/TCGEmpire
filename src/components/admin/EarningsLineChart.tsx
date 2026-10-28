import { linearTrend, SOURCE_LABELS, type EarningsSourceKey } from "@/lib/earnings/core";

// The earnings growth line (/admin/earnings, 2026-10-28): the same buckets as the
// stacked columns, one 2px line per source plus the combined line, and a dashed
// least-squares trend through the combined line. A server-drawn SVG; each
// bucket's column carries a native tooltip with every value.

type Bucket = { label: string; cents: number; bySource: Partial<Record<EarningsSourceKey, number>> };

const W = 960;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 64 };

export function EarningsLineChart({
  series,
  colors,
  money,
  trendFrom,
}: {
  series: Bucket[];
  colors: Record<EarningsSourceKey, string>;
  money: (cents: number) => string;
  /** Buckets the trend may use (a still-filling today is left out). */
  trendFrom: Bucket[];
}) {
  const keys = (Object.keys(colors) as EarningsSourceKey[]).filter((k) => series.some((b) => b.bySource[k]));
  const peak = Math.max(1, ...series.map((b) => b.cents));
  const n = series.length;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (c: number) => PAD.top + ih - (Math.max(0, c) / peak) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const trend = linearTrend(trendFrom.map((b) => b.cents));
  const ticks = [0, 0.5, 1].map((f) => f * peak);
  const step = Math.max(1, Math.ceil(n / 6));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Earnings line chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth={1} strokeDasharray={t ? "2 4" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
              {money(Math.round(t))}
            </text>
          </g>
        ))}
        {series.map((b, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={b.label} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="#94a3b8">
              {b.label}
            </text>
          ) : null,
        )}
        {trend && trendFrom.length > 1 && (
          <line
            x1={x(0)}
            y1={y(trend.start)}
            x2={x(trendFrom.length - 1)}
            y2={y(trend.end)}
            stroke="#e2e8f0"
            strokeWidth={1.5}
            strokeDasharray="6 5"
            opacity={0.6}
          />
        )}
        {keys.map((k) => (
          <path key={k} d={path(series.map((b) => b.bySource[k] ?? 0))} fill="none" stroke={colors[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <path d={path(series.map((b) => b.cents))} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {n <= 31 && series.map((b, i) => <circle key={b.label} cx={x(i)} cy={y(b.cents)} r={3} fill="#ffffff" stroke="#0f172a" strokeWidth={2} />)}
        {/* Hover targets: one full-height column per bucket. */}
        {series.map((b, i) => {
          const half = n === 1 ? iw / 2 : iw / (n - 1) / 2;
          return (
            <rect key={b.label} x={x(i) - half} y={PAD.top} width={half * 2} height={ih} fill="transparent">
              <title>{[`${b.label}: ${money(b.cents)}`, ...keys.filter((k) => b.bySource[k]).map((k) => `${SOURCE_LABELS[k]}: ${money(b.bySource[k]!)}`)].join("\n")}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-white" />
          Combined
        </span>
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-0.5 w-3" style={{ background: colors[k] }} />
            {SOURCE_LABELS[k]}
          </span>
        ))}
        {trend && (
          <span className="flex items-center gap-1">
            <span className="w-3 border-t border-dashed border-slate-300" />
            Trend
          </span>
        )}
      </div>
    </div>
  );
}
