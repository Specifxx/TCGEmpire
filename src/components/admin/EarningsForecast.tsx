import { FORECAST_LAG_DAYS, type Forecast, type ForecastPeriod } from "@/lib/earnings/core";

// The earnings forecast (/admin/earnings, 2026-10-28): month by month from this
// quarter to the end of the fifth, as a curve (earned so far solid, projected
// dashed, the likely range as a band, "if growth stops" dotted), then a table
// with each quarter and year. Not a straight line (owner, 2026-10-29): growth
// compounds, fades toward a plateau and follows the season. lib/earnings/core.ts
// forecastQuarters does the arithmetic; this only draws it.

const W = 960;
const H = 240;
const PAD = { top: 22, right: 16, bottom: 30, left: 72 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function EarningsForecast({ forecast, money, shortDay }: { forecast: Forecast; money: (cents: number) => string; shortDay: (day: string) => string }) {
  const { periods, months, years } = forecast;
  const peak = Math.max(1, ...months.map((p) => p.highCents));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = months.length;
  const x = (i: number) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (c: number) => PAD.top + ih - (Math.max(0, c) / peak) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * peak);
  const path = (vals: number[], from = 0) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + from).toFixed(1)},${y(v).toFixed(1)}`).join("");
  // Months wholly earned, then the projected ones (the current month counts as projected).
  const split = months.findIndex((m) => m.cents > m.actualCents);
  const firstProjected = split < 0 ? n : split;
  const proj = months.slice(Math.max(0, firstProjected - 1));
  const offset = Math.max(0, firstProjected - 1);
  const band =
    proj.length > 1
      ? `${proj.map((m, i) => `${i ? "L" : "M"}${x(i + offset).toFixed(1)},${y(m.highCents).toFixed(1)}`).join("")}${[...proj]
          .reverse()
          .map((m, i) => `L${x(offset + proj.length - 1 - i).toFixed(1)},${y(m.lowCents).toFixed(1)}`)
          .join("")}Z`
      : "";
  const peakMonth = months.reduce((best, m, i) => (m.cents > months[best].cents ? i : best), 0);
  const labelled = new Set([firstProjected < n ? firstProjected : 0, peakMonth, n - 1]);
  const row = (p: ForecastPeriod, strong = false) => (
    <tr key={p.label} className={`border-b border-ink-800 ${strong ? "font-bold text-white" : ""}`}>
      <td className="px-3 py-2">
        {p.label}
        {p.actualCents > 0 && p.cents > p.actualCents && <span className="ml-2 text-[11px] font-normal text-slate-500">{money(p.actualCents)} earned so far</span>}
      </td>
      <td className="num px-3 py-2 text-right text-white">{p.cents > p.actualCents ? money(p.cents) : `${money(p.cents)} (earned)`}</td>
      <td className="num px-3 py-2 text-right text-slate-300">{p.cents > p.actualCents ? `${money(p.lowCents)} – ${money(p.highCents)}` : "—"}</td>
      <td className="num px-3 py-2 text-right text-slate-400">{p.cents > p.actualCents ? money(p.flatCents) : "—"}</td>
    </tr>
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Earnings forecast by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth={1} strokeDasharray={t ? "2 4" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
              {money(Math.round(t))}
            </text>
          </g>
        ))}
        {band && <path d={band} fill="#34d17e" opacity={0.15} />}
        {proj.length > 1 && <path d={path(proj.map((m) => m.flatCents), offset)} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />}
        {firstProjected > 0 && <path d={path(months.slice(0, firstProjected).map((m) => m.cents))} fill="none" stroke="#34d17e" strokeWidth={2.5} />}
        {proj.length > 1 && <path d={path(proj.map((m) => m.cents), offset)} fill="none" stroke="#34d17e" strokeWidth={2.5} strokeDasharray="7 5" strokeLinejoin="round" />}
        {months.map((m, i) => {
          const projected = m.cents > m.actualCents;
          const [yy, mm] = [m.label.slice(0, 4), Number(m.label.slice(5, 7))];
          return (
            <g key={m.label}>
              <circle cx={x(i)} cy={y(m.cents)} r={3.5} fill={projected ? "#0f172a" : "#34d17e"} stroke="#34d17e" strokeWidth={2} />
              {labelled.has(i) && (
                <text x={x(i)} y={y(m.highCents) - 8} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize={12} fontWeight={700} fill="#ffffff">
                  {money(m.cents)}
                </text>
              )}
              <text x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="#94a3b8">
                {mm === 1 || i === 0 ? `${MONTHS[mm - 1]} ${yy.slice(2)}` : MONTHS[mm - 1]}
              </text>
              <rect x={x(i) - iw / Math.max(1, n - 1) / 2} y={PAD.top} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent">
                <title>
                  {`${MONTHS[mm - 1]} ${yy}: ${money(m.cents)}${projected ? ` projected (likely ${money(m.lowCents)} – ${money(m.highCents)}; ${money(m.flatCents)} with no growth)` : " earned"}${m.actualCents && projected ? `, ${money(m.actualCents)} earned so far` : ""}`}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-3 border-t-2 border-[#34d17e]" />
          Earned
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 border-t-2 border-dashed border-[#34d17e]" />
          Projected
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-[#34d17e] opacity-30" />
          Likely range
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 border-t-2 border-dotted border-slate-400" />
          If growth stops
        </span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Projected</th>
              <th className="px-3 py-2 text-right">Likely range</th>
              <th className="px-3 py-2 text-right">If growth stops</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => row(p))}
            {years.map((p) => row(p, true))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        A projection, not a promise, and not a straight line: earnings from {shortDay(forecast.fitFrom)} to {shortDay(forecast.fitTo)} are growing about{" "}
        {forecast.growthPct30 >= 0 ? "+" : "−"}
        {Math.abs(forecast.growthPct30)}% every 30 days (compounding, seasonally adjusted, about {money(forecast.perDayNow)} a day now). That rate fades by half
        about every four months, so growth levels off near {money(forecast.plateauPerDay)} a day in an average month, and each month is scaled by the hobby&apos;s season
        (peak in November and December, the January lull). The likely range is that growth rate give or take its uncertainty (about 80%). &quot;If growth stops&quot; holds
        the last 30 days&apos; pace. The last {FORECAST_LAG_DAYS} days are projected too, because eBay reports late. Combined earnings before costs, at reference FX rates.
      </p>
    </div>
  );
}
