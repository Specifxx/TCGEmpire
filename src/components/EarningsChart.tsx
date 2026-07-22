"use client";

import { formatMoney } from "@/lib/format";
import { formatDay } from "@/lib/delivery-estimate";

export interface EarningsPoint {
  weekStart: string;
  soldNetCents: number;
  paidOutNetCents: number;
}

// Weekly "sold vs paid out" bar chart — pure SVG, no chart library, matching
// the style of PriceChart/Sparkline elsewhere in the app. Two bars per week:
// net sales that WEEK (regardless of status) vs. what actually TRANSFERRED to
// the seller's Stripe balance that week — the two numbers the seller actually
// wants side by side ("am I making money" vs "is it actually reaching me").
const W = 640;
const H = 170;
const PAD = { l: 46, r: 8, t: 10, b: 20 };

export function EarningsChart({ points, currency }: { points: EarningsPoint[]; currency: string }) {
  const hasData = points.some((p) => p.soldNetCents > 0 || p.paidOutNetCents > 0);
  if (!hasData) {
    return <p className="text-sm text-slate-500">No sales yet — this fills in once your first order comes through.</p>;
  }

  const max = Math.max(1, ...points.flatMap((p) => [p.soldNetCents, p.paidOutNetCents]));
  const n = points.length;
  const groupW = (W - PAD.l - PAD.r) / n;
  const barW = Math.max(2.5, groupW * 0.32);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const base = H - PAD.b;

  const totalSold = points.reduce((s, p) => s + p.soldNetCents, 0);
  const totalPaidOut = points.reduce((s, p) => s + p.paidOutNetCents, 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-sm bg-brand-400" /> Sold — <strong className="text-slate-200">{formatMoney(totalSold, currency)}</strong>
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-sm bg-sky-400" /> Paid out — <strong className="text-slate-200">{formatMoney(totalPaidOut, currency)}</strong>
        </span>
        <span className="text-slate-600">last {n} weeks</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Weekly sales vs payouts">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1" />
        ))}
        <text x={PAD.l - 6} y={y(max) + 3} textAnchor="end" className="fill-slate-500" fontSize="9">{formatMoney(max, currency)}</text>
        <text x={PAD.l - 6} y={base + 3} textAnchor="end" className="fill-slate-500" fontSize="9">0</text>

        {points.map((p, i) => {
          const gx = PAD.l + i * groupW + groupW / 2;
          const soldY = y(p.soldNetCents);
          const paidY = y(p.paidOutNetCents);
          return (
            <g key={p.weekStart}>
              <rect x={gx - barW - 1} y={soldY} width={barW} height={Math.max(0, base - soldY)} fill="#34d17e" rx="1.5">
                <title>{`Sold ${formatMoney(p.soldNetCents, currency)} — week of ${formatDay(p.weekStart)}`}</title>
              </rect>
              <rect x={gx + 1} y={paidY} width={barW} height={Math.max(0, base - paidY)} fill="#38bdf8" rx="1.5">
                <title>{`Paid out ${formatMoney(p.paidOutNetCents, currency)} — week of ${formatDay(p.weekStart)}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1" />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{formatDay(points[0].weekStart)}</span>
        <span>{formatDay(points[points.length - 1].weekStart)}</span>
      </div>
    </div>
  );
}
