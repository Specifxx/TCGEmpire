import { ASSUMED_COMMISSION, FORECAST_LAG_DAYS, FORECAST_RUN_DAYS, type Forecast, type ForecastPeriod } from "@/lib/earnings/core";

// The earnings forecast (/admin/earnings, 2026-10-28): month by month from this
// quarter to the end of the fifth, as a curve (earned so far solid, the base
// scenario dashed, conservative to optimistic as a band), then a table with each
// quarter and year under all three scenarios and the store sales each implies.
// Scenarios with stated assumptions since 2026-11-01 (owner: the fitted curve
// was "a bit too ambitious"). lib/earnings/core.ts forecastQuarters does the
// arithmetic; this only draws it.

const W = 960;
const H = 240;
const PAD = { top: 22, right: 16, bottom: 30, left: 72 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 1000) / 10)}%`;

export function EarningsForecast({ forecast, money, shortDay }: { forecast: Forecast; money: (cents: number) => string; shortDay: (day: string) => string }) {
  const { periods, months, years, scenarios } = forecast;
  const base = (m: ForecastPeriod) => m.scenarios.base.cents;
  const low = (m: ForecastPeriod) => m.scenarios.conservative.cents;
  const high = (m: ForecastPeriod) => m.scenarios.optimistic.cents;
  const peak = Math.max(1, ...months.map(high));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = months.length;
  const x = (i: number) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (c: number) => PAD.top + ih - (Math.max(0, c) / peak) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * peak);
  const path = (vals: number[], from = 0) => vals.map((v, i) => `${i ? "L" : "M"}${x(i + from).toFixed(1)},${y(v).toFixed(1)}`).join("");
  // Months wholly earned, then the projected ones (the current month counts as projected).
  const projected = (m: ForecastPeriod) => base(m) > m.actualCents;
  const split = months.findIndex(projected);
  const firstProjected = split < 0 ? n : split;
  const proj = months.slice(Math.max(0, firstProjected - 1));
  const offset = Math.max(0, firstProjected - 1);
  const band =
    proj.length > 1
      ? `${proj.map((m, i) => `${i ? "L" : "M"}${x(i + offset).toFixed(1)},${y(high(m)).toFixed(1)}`).join("")}${[...proj]
          .reverse()
          .map((m, i) => `L${x(offset + proj.length - 1 - i).toFixed(1)},${y(low(m)).toFixed(1)}`)
          .join("")}Z`
      : "";
  const peakMonth = months.reduce((best, m, i) => (base(m) > base(months[best]) ? i : best), 0);
  const labelled = new Set([firstProjected < n ? firstProjected : 0, peakMonth, n - 1]);
  const cell = (p: ForecastPeriod, key: "conservative" | "base" | "optimistic") => {
    const v = p.scenarios[key];
    return (
      <td key={key} className={`num px-3 py-2 text-right ${key === "base" ? "text-white" : "text-slate-300"}`}>
        {money(v.cents)}
        {v.salesCents > 0 && <div className="text-[11px] font-normal text-slate-500">≈ {money(v.salesCents)} sales</div>}
      </td>
    );
  };
  const row = (p: ForecastPeriod, strong = false) => (
    <tr key={p.label} className={`border-b border-ink-800 ${strong ? "font-bold text-white" : ""}`}>
      <td className="px-3 py-2">
        {p.label}
        {p.actualCents > 0 && projected(p) && <span className="ml-2 text-[11px] font-normal text-slate-500">{money(p.actualCents)} earned so far</span>}
      </td>
      {projected(p) ? (
        (["conservative", "base", "optimistic"] as const).map((k) => cell(p, k))
      ) : (
        <td colSpan={3} className="num px-3 py-2 text-right text-white">
          {money(p.actualCents)} (earned)
          {p.actualSalesCents > 0 && <div className="text-[11px] font-normal text-slate-500">≈ {money(p.actualSalesCents)} sales</div>}
        </td>
      )}
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
        {firstProjected > 0 && <path d={path(months.slice(0, firstProjected).map(base))} fill="none" stroke="#34d17e" strokeWidth={2.5} />}
        {proj.length > 1 && <path d={path(proj.map(base), offset)} fill="none" stroke="#34d17e" strokeWidth={2.5} strokeDasharray="7 5" strokeLinejoin="round" />}
        {months.map((m, i) => {
          const isProj = projected(m);
          const [yy, mm] = [m.label.slice(0, 4), Number(m.label.slice(5, 7))];
          return (
            <g key={m.label}>
              <circle cx={x(i)} cy={y(base(m))} r={3.5} fill={isProj ? "#0f172a" : "#34d17e"} stroke="#34d17e" strokeWidth={2} />
              {labelled.has(i) && (
                <text x={x(i)} y={y(high(m)) - 8} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize={12} fontWeight={700} fill="#ffffff">
                  {money(base(m))}
                </text>
              )}
              <text x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="#94a3b8">
                {mm === 1 || i === 0 ? `${MONTHS[mm - 1]} ${yy.slice(2)}` : MONTHS[mm - 1]}
              </text>
              <rect x={x(i) - iw / Math.max(1, n - 1) / 2} y={PAD.top} width={iw / Math.max(1, n - 1)} height={ih} fill="transparent">
                <title>
                  {`${MONTHS[mm - 1]} ${yy}: ${isProj ? `${money(base(m))} base (conservative ${money(low(m))}, optimistic ${money(high(m))}); ≈ ${money(m.scenarios.base.salesCents)} store sales` : `${money(m.actualCents)} earned`}${m.actualCents && isProj ? `, ${money(m.actualCents)} earned so far` : ""}`}
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
          Base scenario
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-[#34d17e] opacity-30" />
          Conservative to optimistic
        </span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Conservative</th>
              <th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">Optimistic</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => row(p))}
            {years.map((p) => row(p, true))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-slate-400">
        <p>
          <span className="font-bold text-slate-300">Starting point:</span> the last {FORECAST_RUN_DAYS} days ({shortDay(forecast.runFrom)} to {shortDay(forecast.runTo)}), about{" "}
          {money(forecast.perDayNow)} a day seasonally adjusted, {money(forecast.affiliatePerDayNow)} of it affiliate commission. That is{" "}
          {forecast.observedPct28 === null ? "too new to compare with the 28 days before" : `${forecast.observedPct28 >= 0 ? "+" : "−"}${Math.abs(forecast.observedPct28)}% on the 28 days before`}
          , shown for reference only: a few weeks of pre-order spikes are not a trend to extrapolate.
        </p>
        <ul className="mt-2 space-y-1">
          {scenarios.map((s) => (
            <li key={s.key}>
              <span className="font-bold text-slate-300">{s.label}:</span> {pct(s.monthly)} a month, compounding ({pct(Math.pow(1 + s.monthly, 12) - 1)} over a year), plus AdSense at
              about A${(s.adsenseAudCentsPerDay / 100).toFixed(2)} a day: {s.why}.
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-500">
          &quot;Sales&quot; is the store sales the eBay and TCGplayer part implies at a {Math.round(ASSUMED_COMMISSION * 1000) / 10}% commission: if a number needs a sales volume
          that looks absurd, so is the number. Each month is scaled by the hobby&apos;s season (peak in November and December, the January lull). The last {FORECAST_LAG_DAYS} days
          are projected too, because eBay reports late. Combined earnings before costs, at reference FX rates. A projection, not a promise.
        </p>
      </div>
    </div>
  );
}
