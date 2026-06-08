import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasReward } from "@/lib/points";
import { formatMoney } from "@/lib/format";
import { SHARD } from "@/lib/points-config";

// Early-access price-history chart on the card page, gated behind the
// `perk_price_charts` Shard reward. Everyone sees the section — non-owners get a
// locked teaser that promotes the perk (a site-wide hook into the loyalty system);
// owners (and admins) get the real chart from the daily PriceHistory snapshots.
//
// PriceHistory is recorded for the AU market only, so the chart is AU-priced.
export async function PriceHistoryChart({ cardId }: { cardId: string }) {
  const user = await getCurrentUser();
  const entitled = !!user && (user.isAdmin || (await hasReward(user.id, "perk_price_charts")));

  if (!entitled) {
    return (
      <section className="card-surface mt-6 overflow-hidden p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold text-white">
            Price history
            <span className="chip bg-brand-500/15 text-brand-300">Early access</span>
          </h2>
        </div>
        <div className="relative mt-3">
          {/* Decorative blurred mock so the locked state still looks like a chart. */}
          <svg viewBox="0 0 300 90" className="h-28 w-full opacity-30 blur-[3px]" preserveAspectRatio="none" aria-hidden>
            <polyline
              fill="none"
              stroke="#34d17e"
              strokeWidth="2.5"
              points="0,60 40,52 80,58 120,40 160,46 200,28 240,34 300,18"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-sm font-semibold text-white">Track this card&apos;s price over time</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                Unlock the price-history chart with {SHARD.glyph} {SHARD.name} — earn them just by using RiftCompare.
              </p>
              <Link href="/rewards" className="btn-primary mt-3">
                Unlock with {SHARD.name}
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const rows = await prisma.priceHistory.findMany({
    where: { cardId },
    orderBy: { day: "asc" },
    take: 120,
    select: { day: true, lowestPriceCents: true },
  });

  return (
    <section className="card-surface mt-6 p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        Price history <span className="text-xs font-normal text-slate-500">(AU · lowest price)</span>
        <span className="chip bg-brand-500/15 text-brand-300">Early access</span>
      </h2>
      {rows.length < 2 ? (
        <p className="mt-3 text-sm text-slate-400">
          We&apos;re still collecting daily price points for this card — check back soon as the history builds up.
        </p>
      ) : (
        <Chart points={rows.map((r) => ({ t: r.day.getTime(), v: r.lowestPriceCents }))} />
      )}
    </section>
  );
}

// Pure inline-SVG line chart (no client JS, no chart library).
function Chart({ points }: { points: { t: number; v: number }[] }) {
  const W = 600;
  const H = 160;
  const pad = { l: 8, r: 8, t: 12, b: 18 };
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(1, max - min);
  const t0 = points[0]!.t;
  const tSpan = Math.max(1, points[points.length - 1]!.t - t0);

  const x = (t: number) => pad.l + ((t - t0) / tSpan) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  const line = points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${pad.l},${H - pad.b} ${line} ${(W - pad.r).toFixed(1)},${H - pad.b}`;

  const first = points[0]!.v;
  const last = points[points.length - 1]!.v;
  const delta = last - first;
  const pct = first > 0 ? Math.round((delta / first) * 100) : 0;
  const down = delta < 0;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-white">
          Now <span className="font-bold text-accent">{formatMoney(last, "AUD")}</span>
        </span>
        <span className="text-slate-500">Low {formatMoney(min, "AUD")}</span>
        <span className="text-slate-500">High {formatMoney(max, "AUD")}</span>
        {delta !== 0 && (
          <span className={down ? "text-brand-400" : "text-rose-400"}>
            {down ? "▼" : "▲"} {Math.abs(pct)}% over {points.length} days
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Price history chart">
        <defs>
          <linearGradient id="ph-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d17e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#34d17e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#ph-fill)" />
        <polyline points={line} fill="none" stroke="#34d17e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points[points.length - 1]!.t)} cy={y(last)} r="3.5" fill="#34d17e" />
      </svg>
    </div>
  );
}
