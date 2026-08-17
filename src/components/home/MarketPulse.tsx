"use client";

import { useRef } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { COUNTRIES, type Country } from "@/lib/country";
import type { Mover, PriceMovers } from "@/lib/price-history";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { useCountry } from "@/components/CountryProvider";
import { useQuickView } from "@/components/QuickView";

// "Market pulse" — the day's top 4 risers + top 4 fallers, reusing the exact
// Daily Movers data (lib/price-history.ts's getPriceMovers, the same source
// /movers and the Price Watch teaser use) rather than a new signal. Sits between
// the hero and Today's Top Deals: the strongest "come back tomorrow" hook a
// price-comparison site has, so it earns a spot above the fold.
//
// Deliberately NOT wrapped in <Reveal> (unlike most sections below it) — it's
// close enough to the hero to often be in the initial viewport, and HeroStats
// sets the precedent that near-fold real content renders immediately rather
// than fading in. Fixed-size rows mean no reserved-space/CLS concern either way.
function PulseCard({ m, up, currency }: { m: Mover; up: boolean; currency: string }) {
  const c = m.card;
  const { open } = useQuickView();
  // Same instant-preview pattern as CardTile: left-click opens the quick-view
  // popup instead of navigating away, so a scan through the day's risers/fallers
  // doesn't cost a full page load per card. The real href stays on the <Link>
  // for SEO, sharing, and middle/ctrl-click (open in new tab) — only a plain
  // left click is intercepted. Drag/scroll-synthesized clicks are ignored via
  // the same pointerdown-distance/time check CardTile uses, so this never pops
  // the preview open mid-scroll on touch.
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onClick(e: React.MouseEvent) {
    track("market_pulse_click", { card: c.slug ?? c.id, direction: up ? "up" : "down" });
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const down = downRef.current;
    if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8 || Date.now() - down.t > 600)) return;
    e.preventDefault();
    open(c);
  }
  return (
    <Link
      href={cardHref(c)}
      prefetch={false}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className="card-surface flex w-32 shrink-0 snap-start flex-col gap-1.5 p-2.5 transition-colors hover:border-brand-500/60 hover:bg-ink-800 sm:w-auto"
    >
      <div className="flex items-center gap-2">
        <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-ink-900">
          {c.imageThumbUrl && (
            // Plain <img>, not next/image — same reasoning as PriceWatch.tsx's Row:
            // a fixed-size box already reserves the layout space, so there's
            // nothing next/image's own sizing buys here for a 28x40 thumbnail.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.imageThumbUrl}
              alt={cardImageAlt(c)}
              width={28}
              height={40}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{cardDisplayName(c.name, c)}</div>
          <div className="truncate text-[10px] text-slate-500">
            {c.setCode} · {c.collectorNumber}
          </div>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="num text-sm font-bold text-accent">{formatMoney(m.nowCents, currency)}</span>
        <span className={`num flex shrink-0 items-center gap-0.5 text-xs font-bold ${up ? "text-up" : "text-down"}`}>
          {up ? "▲" : "▼"} {Math.abs(m.pct)}%
        </span>
      </div>
    </Link>
  );
}

export function MarketPulse({ moversByCountry }: { moversByCountry: Record<Country, PriceMovers> }) {
  const { country } = useCountry();
  const info = COUNTRIES[country];
  const movers = moversByCountry[country] ?? moversByCountry.AU;
  const risers = movers.spiking.slice(0, 4);
  const fallers = movers.plummeting.slice(0, 4);
  if (risers.length === 0 && fallers.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Market pulse</h2>
          <p className="mt-0.5 text-xs text-slate-500">Today&apos;s biggest risers and fallers in {info.place}.</p>
        </div>
        <Link href="/market" className="btn-ghost hidden text-xs sm:inline-flex">
          View market index →
        </Link>
      </div>

      <div className="flex snap-x gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:gap-3 lg:grid-cols-8">
        {risers.map((m) => (
          <PulseCard key={`up-${m.card.id}`} m={m} up currency={info.currency} />
        ))}
        {fallers.map((m) => (
          <PulseCard key={`down-${m.card.id}`} m={m} up={false} currency={info.currency} />
        ))}
      </div>

      <Link href="/market" className="mt-3 block text-center text-xs font-semibold text-brand-300 hover:underline sm:hidden">
        View market index →
      </Link>
    </section>
  );
}
