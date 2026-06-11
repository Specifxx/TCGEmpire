"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import type { Mover, PriceMovers } from "@/lib/price-history";
import { useQuickView } from "./QuickView";
import { Sparkline } from "./PriceChart";

// "Price Watch" — this week's biggest movers and best-value buys in the viewer's
// market (its own currency). Rows open the quick-view (with its interactive chart).
// Built to feel analytical (sparklines + signed % deltas), à la Steam. Used both as
// the homepage teaser (showHeader, with a "see all" link to the full /movers page)
// and as the body of the dedicated /movers page (showHeader off — that page brings
// its own <h1>).
export function PriceWatch({
  movers,
  currency,
  place,
  showHeader = true,
}: {
  movers: PriceMovers;
  currency: string;
  place: string;
  showHeader?: boolean;
}) {
  const { spiking, plummeting, value } = movers;
  if (!spiking.length && !plummeting.length && !value.length) return null;

  return (
    <section>
      {showHeader && (
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
              📈 Price Watch
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              This week&apos;s biggest movers across {place} — tap any card for its full price chart.
            </p>
          </div>
          <Link href="/movers" className="btn-ghost text-xs shrink-0">
            See all movers →
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Spiking this week" accent="text-rose-400" subtitle="Up the most (7 days)" movers={spiking} kind="up" currency={currency} empty="No notable risers yet." />
        <Panel title="Biggest drops this week" accent="text-brand-400" subtitle="Down the most (7 days)" movers={plummeting} kind="down" currency={currency} empty="No notable fallers yet." />
        <Panel title="Best value right now" accent="text-gold" subtitle="Largest discount off recent high" movers={value} kind="down" currency={currency} empty="No standout deals yet." />
      </div>
    </section>
  );
}

function Panel({ title, subtitle, accent, movers, kind, currency, empty }: { title: string; subtitle: string; accent: string; movers: Mover[]; kind: "up" | "down"; currency: string; empty: string }) {
  return (
    <div className="card-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className={`font-bold ${accent}`}>{title}</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-600">{subtitle}</span>
      </div>
      {movers.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-600">{empty}</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {movers.map((m) => (
            <Row key={m.card.id} m={m} up={kind === "up"} currency={currency} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ m, up, currency }: { m: Mover; up: boolean; currency: string }) {
  const { open } = useQuickView();
  const c = m.card;
  const pos = m.pct > 0;
  return (
    <li>
      <button onClick={() => open(c)} className="flex w-full items-center gap-2.5 py-2 text-left hover:bg-ink-800/50">
        <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
          {c.imageThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageThumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{cardDisplayName(c.name, c)}</div>
          <div className="text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</div>
        </div>
        <Sparkline points={m.points} up={up} />
        <div className="w-16 shrink-0 text-right">
          <div className="text-sm font-bold text-white">{formatMoney(m.nowCents, currency)}</div>
          <div className={`text-[11px] font-semibold ${pos ? "text-rose-400" : "text-brand-400"}`}>
            {pos ? "▲" : "▼"} {Math.abs(m.pct)}%
          </div>
        </div>
      </button>
    </li>
  );
}
