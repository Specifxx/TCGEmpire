import { FORECAST_LAG_DAYS, type Forecast, type ForecastPeriod } from "@/lib/earnings/core";

// The earnings forecast (/admin/earnings, 2026-10-28): this quarter and the four
// after it as columns (earned so far solid, projected faded, the likely range as
// a whisker), then a table with each year. lib/earnings/core.ts forecastQuarters
// does the arithmetic; this only draws it.

const W = 960;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 72 };

export function EarningsForecast({ forecast, money, shortDay }: { forecast: Forecast; money: (cents: number) => string; shortDay: (day: string) => string }) {
  const { periods, years } = forecast;
  const peak = Math.max(1, ...periods.map((p) => p.highCents));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / periods.length;
  const bw = Math.min(96, slot * 0.5);
  const y = (c: number) => PAD.top + ih - (Math.max(0, c) / peak) * ih;
  const ticks = [0, 0.5, 1].map((f) => f * peak);
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
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Earnings forecast by quarter">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth={1} strokeDasharray={t ? "2 4" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">
              {money(Math.round(t))}
            </text>
          </g>
        ))}
        {periods.map((p, i) => {
          const cx = PAD.left + slot * (i + 0.5);
          const x = cx - bw / 2;
          const projected = p.cents > p.actualCents;
          return (
            <g key={p.label}>
              {/* projected part, faded, from the actual top to the projection */}
              {projected && <rect x={x} y={y(p.cents)} width={bw} height={Math.max(0, y(p.actualCents) - y(p.cents))} fill="#34d17e" opacity={0.35} rx={4} />}
              {p.actualCents > 0 && <rect x={x} y={y(p.actualCents)} width={bw} height={Math.max(0, y(0) - y(p.actualCents))} fill="#34d17e" />}
              {projected && (
                <g stroke="#e2e8f0" strokeWidth={1.5}>
                  <line x1={cx} x2={cx} y1={y(p.highCents)} y2={y(p.lowCents)} />
                  <line x1={cx - 8} x2={cx + 8} y1={y(p.highCents)} y2={y(p.highCents)} />
                  <line x1={cx - 8} x2={cx + 8} y1={y(p.lowCents)} y2={y(p.lowCents)} />
                </g>
              )}
              <text x={cx} y={y(p.highCents) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#ffffff">
                {money(p.cents)}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="#94a3b8">
                {p.label}
              </text>
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={ih} fill="transparent">
                <title>
                  {`${p.label}: ${money(p.cents)}${projected ? ` projected (likely ${money(p.lowCents)} – ${money(p.highCents)}; ${money(p.flatCents)} with no growth)` : " earned"}${p.actualCents && projected ? `, ${money(p.actualCents)} earned so far` : ""}`}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#34d17e]" />
          Earned
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#34d17e] opacity-40" />
          Projected
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-px bg-slate-200" />
          Likely range
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
        A projection, not a promise: a straight line through combined earnings from {shortDay(forecast.fitFrom)} to {shortDay(forecast.fitTo)}, about {money(forecast.perDayNow)} a day now and{" "}
        {forecast.per30Change >= 0 ? "+" : "−"}
        {money(Math.abs(forecast.per30Change))} a day every 30 days, carried forward. The likely range is that growth rate give or take its uncertainty (about 80%). &quot;If growth stops&quot; holds the last 30 days&apos; pace. The last {FORECAST_LAG_DAYS} days are projected too, because eBay reports late. Combined earnings before costs, at reference FX rates.
      </p>
    </div>
  );
}
