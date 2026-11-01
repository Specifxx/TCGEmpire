"use client";

import { useMemo, useState } from "react";
import { bucketsFor, chartLines, METRICS, RANGES, siteTotals, type Metric, type Range, type SiteSeries } from "@/lib/analytics/series";

// /admin/analytics (2026-11-01): one line per site, 7 days to 12 months, visits or
// buy clicks, an optional all-sites line and running total. Draws only what the
// server page already loaded; no fetch of its own.

const COLORS = ["#60a5fa", "#f59e0b", "#34d399", "#f472b6", "#a78bfa", "#f87171", "#22d3ee", "#facc15", "#fb923c", "#4ade80", "#c084fc", "#94a3b8", "#2dd4bf", "#e879f9"];
const W = 960;
const H = 300;
const PAD = { top: 12, right: 14, bottom: 26, left: 56 };

const fmt = (v: number, metric: Metric) => (metric === "rate" ? `${v.toFixed(1)}` : Math.round(v).toLocaleString("en-US"));
const short = (v: number, metric: Metric) => {
  if (metric === "rate") return v.toFixed(v < 10 ? 1 : 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
};
const dayLabel = (t: string, range: Range) => {
  const d = new Date(`${t}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", range === "12m" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
};
const change = (cur: number, prev: number | null) => {
  if (prev == null) return null;
  if (!prev) return cur ? "new" : null;
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%`;
};

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${on ? "border-brand-500 bg-brand-500/20 text-white" : "border-ink-700 text-slate-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

export function AnalyticsChart({ sites, today }: { sites: SiteSeries[]; today: string }) {
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<Metric>("visitors");
  const [total, setTotal] = useState(true);
  const [cumulative, setCumulative] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  // A stable colour per site, in the order of the biggest site first.
  const order = useMemo(() => siteTotals(sites, "90d", today).filter((r) => r.key !== "total"), [sites, today]);
  const color = useMemo(() => {
    const m = new Map<string, string>(order.map((r, i) => [r.key, COLORS[i % COLORS.length]]));
    m.set("total", "#ffffff");
    return m;
  }, [order]);
  const sorted = useMemo(() => order.map((r) => sites.find((s) => s.key === r.key)!).filter(Boolean), [order, sites]);

  const weeklyStarts = useMemo(() => sites.flatMap((s) => s.weekly.map((p) => p.t)), [sites]);
  const buckets = useMemo(() => bucketsFor(range, today, weeklyStarts), [range, today, weeklyStarts]);
  const shown = sorted.filter((s) => !hidden.has(s.key));
  // The all-sites line always counts every site, hidden or not: hiding a line declutters, it doesn't change the total.
  const lines = useMemo(() => {
    const per = chartLines(sorted, range, buckets, metric, { total, cumulative });
    return per.filter((l) => l.key === "total" || !hidden.has(l.key));
  }, [sorted, range, buckets, metric, total, cumulative, hidden]);
  const totals = useMemo(() => siteTotals(sites, range, today), [sites, range, today]);

  const n = buckets.length;
  const peak = Math.max(metric === "rate" ? 1 : 10, ...lines.flatMap((l) => l.values));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (Math.max(0, v) / peak) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const step = Math.max(1, Math.ceil(n / 7));
  const metricInfo = METRICS.find((m) => m.key === metric)!;
  const partial = range !== "12m" && buckets[n - 1] === today; // today is still filling

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Toggle key={r.key} on={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </Toggle>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-700" aria-hidden />
        {METRICS.map((m) => (
          <Toggle key={m.key} on={metric === m.key} onClick={() => setMetric(m.key)}>
            {m.label}
          </Toggle>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-700" aria-hidden />
        <Toggle on={total} onClick={() => setTotal((v) => !v)}>
          All-sites line
        </Toggle>
        <Toggle on={cumulative} onClick={() => setCumulative((v) => !v)}>
          Running total
        </Toggle>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {metricInfo.note} {range === "12m" ? "One point a week." : "One point a day (UTC)."}
        {cumulative && " Running total: each point adds everything before it in the range."}
        {partial && " Today is still filling."}
      </p>

      <div className="relative mt-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${metricInfo.label}, every site, ${RANGES.find((r) => r.key === range)!.label}`} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(f * peak)} y2={y(f * peak)} stroke="#334155" strokeWidth={1} strokeDasharray={f ? "2 4" : undefined} />
              <text x={PAD.left - 8} y={y(f * peak) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
                {short(f * peak, metric)}
              </text>
            </g>
          ))}
          {buckets.map((t, i) =>
            (i % step === 0 && n - 1 - i >= step / 2) || i === n - 1 ? (
              <text key={t} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="#94a3b8">
                {dayLabel(t, range)}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="#64748b" strokeWidth={1} />}
          {lines.map((l) => (
            <path
              key={l.key}
              d={path(l.values)}
              fill="none"
              stroke={color.get(l.key) ?? "#94a3b8"}
              strokeWidth={l.key === "total" ? 2.75 : 2}
              strokeDasharray={l.key === "total" ? "7 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover != null &&
            lines.map((l) => <circle key={l.key} cx={x(hover)} cy={y(l.values[hover])} r={3.5} fill={color.get(l.key)} stroke="#0f172a" strokeWidth={1.5} />)}
          {buckets.map((t, i) => {
            const half = n <= 1 ? iw / 2 : iw / (n - 1) / 2;
            return <rect key={t} x={x(i) - half} y={PAD.top} width={half * 2} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />;
          })}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-3 z-10 min-w-[11rem] rounded-lg border border-ink-700 bg-ink-900/95 px-3 py-2 text-xs shadow-lg"
            style={hover > n / 2 ? { right: `${((W - x(hover)) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}
          >
            <div className="mb-1 font-semibold text-white">
              {range === "12m" ? `Week of ${dayLabel(buckets[hover], "30d")}` : dayLabel(buckets[hover], range)}
            </div>
            {[...lines]
              .sort((a, b) => b.values[hover] - a.values[hover])
              .map((l) => (
                <div key={l.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ background: color.get(l.key) }} />
                    {l.label}
                  </span>
                  <span className="tabular-nums text-white">{fmt(l.values[hover], metric)}</span>
                </div>
              ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {sorted.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${off ? "border-ink-800 text-slate-600" : "border-ink-700 text-slate-300"}`}
              >
                <span className="h-0.5 w-3" style={{ background: off ? "#334155" : color.get(s.key) }} />
                {s.label}
              </button>
            );
          })}
          {shown.length < sorted.length && (
            <button type="button" onClick={() => setHidden(new Set())} className="px-2 py-0.5 text-brand-400 hover:underline">
              Show all
            </button>
          )}
          {shown.length > 1 && (
            <button type="button" onClick={() => setHidden(new Set(sorted.slice(1).map((s) => s.key)))} className="px-2 py-0.5 text-slate-500 hover:text-white">
              Only {sorted[0]?.label}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-850 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Site · {RANGES.find((r) => r.key === range)!.label}</th>
              <th className="px-3 py-2 text-right">Visitors</th>
              <th className="px-3 py-2 text-right">Page views</th>
              <th className="px-3 py-2 text-right">Buy clicks</th>
              <th className="px-3 py-2 text-right">Clicks / 100 visitors</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((r) => {
              const vc = change(r.visitors, r.prevVisitors);
              const cc = change(r.clicks, r.prevClicks);
              const isTotal = r.key === "total";
              return (
                <tr key={r.key} className={`border-t border-ink-800 ${isTotal ? "bg-ink-850 font-bold text-white" : "text-slate-300"}`}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: color.get(r.key) }} />
                      {r.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {r.visitors.toLocaleString("en-US")}
                    {vc && <span className={`ml-1.5 text-[11px] font-normal ${vc.startsWith("▼") ? "text-rose-400" : "text-up"}`}>{vc}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.pageviews.toLocaleString("en-US")}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {r.clicks.toLocaleString("en-US")}
                    {cc && <span className={`ml-1.5 text-[11px] font-normal ${cc.startsWith("▼") ? "text-rose-400" : "text-up"}`}>{cc}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.rate == null ? "–" : r.rate.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Visitors are counted per day (per week in the 12-month view) and added up, so someone who comes back on three days counts three times; Vercel&apos;s own
        dashboard counts them once per range, so its totals read lower. {range === "7d" || range === "30d" ? "Changes compare with the same number of days just before." : ""}
      </p>
    </div>
  );
}
