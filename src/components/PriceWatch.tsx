"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import type { Mover, PriceMovers } from "@/lib/price-history";
import { useQuickView } from "./QuickView";
import { Sparkline } from "./PriceChart";
import { cardImageAlt } from "@/lib/image-alt";

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
              Price Watch
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

      {/* `grid-cols-1` is load-bearing (2026-09-23). With no base column the
          grid gets one implicit `auto` track as wide as its longest UNWRAPPED
          name ('Rengar, Pridestalker (Showcase, Signature)'), so the rows'
          `truncate` never engaged and Chrome Android laid /movers out at a
          693px viewport on every phone, zooming the whole site out.
          grid-cols-1 is minmax(0,1fr), capped at the container. Three columns
          from xl, not lg: beside the 17rem rail, main is ~704px at 1024 and
          three 224px panels left every name 0px wide. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Spiking this week" accent="text-up" subtitle="Up the most (7 days)" movers={spiking} kind="up" currency={currency} empty="No notable risers yet." />
        <Panel title="Biggest drops this week" accent="text-down" subtitle="Down the most (7 days)" movers={plummeting} kind="down" currency={currency} empty="No notable fallers yet." />
        <Panel title="Best value right now" accent="text-gold" subtitle="Largest discount off recent high" movers={value} kind="down" currency={currency} empty="No standout deals yet." />
      </div>
    </section>
  );
}

function Panel({ title, subtitle, accent, movers, kind, currency, empty }: { title: string; subtitle: string; accent: string; movers: Mover[]; kind: "up" | "down"; currency: string; empty: string }) {
  return (
    <div className="card-surface p-4">
      {/* Title over subtitle, always. Side by side, the longer titles wrapped
          and the shorter didn't, so the three panels' first rows started at
          different heights (465/489/489px at 1280, measured 2026-09-23). */}
      <div className="mb-2 flex flex-col items-start gap-0.5">
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
      {/* Real href for crawlers, sharing and middle/ctrl-click; a plain left-click
          still opens the instant quick view (same pattern as CardTile). */}
      <Link
        href={cardHref(c)}
        prefetch={false}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          open(c);
        }}
        className="flex w-full items-center gap-2.5 py-2 text-left hover:bg-ink-800/50"
      >
        <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
          {c.imageThumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imageThumbUrl} alt={cardImageAlt(c)} width={36} height={48} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{cardDisplayName(c.name, c)}</div>
          <div className="text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</div>
        </div>
        {/* The sparkline goes wherever it would squeeze the name to a stub
            (2026-09-23): below 360px (84px price + 80px sparkline left names
            24px at 320; 114px without it) and in the three-column 1280–1535
            band (names 45px with it, 135–189px without). The quick view keeps
            the full chart. `upIsGood`: these panels use the MARKET convention
            like their titles and the % beside it, so a riser is green here,
            not the per-card buyer red that drew red lines next to "+170%". */}
        <div className="hidden shrink-0 min-[360px]:block xl:hidden 2xl:block">
          <Sparkline points={m.points} up={up} upIsGood />
        </div>
        {/* A floor, not a fixed width: the old w-16 (64px) overflowed for 19
            of 60 prices ('US$1,099.99' is 84px), and a 5-digit price must
            grow the column rather than spill across the panel edge. */}
        <div className="min-w-[5.25rem] shrink-0 whitespace-nowrap text-right">
          <div className="num text-sm font-bold text-white">{formatMoney(m.nowCents, currency)}</div>
          <div className={`num text-[11px] font-semibold ${pos ? "text-up" : "text-down"}`}>
            {pos ? "+" : "−"}{Math.abs(m.pct)}%
          </div>
        </div>
      </Link>
    </li>
  );
}
