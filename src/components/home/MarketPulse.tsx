"use client";

import { useRef } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { COUNTRIES, type Country } from "@/lib/country";
import type { MoverSummary, PulseMovers } from "@/lib/price-history";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { useCountry } from "@/components/CountryProvider";
import { useQuickView } from "@/components/QuickView";

// "Market pulse" — the day's top risers + fallers, reusing the exact Daily
// Movers data (lib/price-history.ts's getPriceMovers, the same source /movers
// and the Price Watch teaser use) rather than a new signal. Sits between the
// hero and Today's Top Deals: the strongest "come back tomorrow" hook a
// price-comparison site has, so it earns a spot above the fold.
//
// Trimmed to 3 risers + 3 fallers (was 4+4=8) and put on a slow, continuous
// right-to-left marquee instead of a static grid — 8 cards across a grid read
// as a wall of numbers, and a visitor's eye had nowhere obvious to start.
// Fewer cards, always in motion, reads as "the market is alive" at a glance
// instead of "study this table."
//
// Deliberately NOT wrapped in <Reveal> (unlike most sections below it) — it's
// close enough to the hero to often be in the initial viewport, and HeroStats
// sets the precedent that near-fold real content renders immediately rather
// than fading in. Fixed-size rows mean no reserved-space/CLS concern either way.
const COUNT_PER_SIDE = 3;

function PulseCard({ m, up, currency, duplicate }: { m: MoverSummary; up: boolean; currency: string; duplicate: boolean }) {
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
      // Fixed width regardless of breakpoint — a marquee track needs every
      // card the same size for the "translate by exactly one copy's width"
      // loop trick (see the animate-marquee keyframes) to stay seamless.
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : undefined}
      className="card-surface flex w-36 shrink-0 flex-col gap-1.5 p-2.5 transition-colors hover:border-brand-500/60 hover:bg-ink-800 sm:w-40"
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
        {/* line-clamp-2, not truncate: at this card width most Riftbound
            names (e.g. "Jayce, Manslayer", "Miss Fortune") were getting cut
            off mid-word on a single line. Two lines plus the wider card
            above fits the great majority in full; `title` gives the rest a
            hover fallback. Fixed-height row (h-8 ~ 2 lines at text-xs)
            keeps every card the same size for the marquee's width math. */}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 h-8 text-xs font-semibold leading-tight text-white" title={cardDisplayName(c.name, c)}>
            {cardDisplayName(c.name, c)}
          </div>
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

export function MarketPulse({ moversByCountry }: { moversByCountry: Record<Country, PulseMovers> }) {
  const { country } = useCountry();
  const info = COUNTRIES[country];
  const movers = moversByCountry[country] ?? moversByCountry.AU;
  const risers = movers.spiking.slice(0, COUNT_PER_SIDE);
  const fallers = movers.plummeting.slice(0, COUNT_PER_SIDE);
  if (risers.length === 0 && fallers.length === 0) return null;

  // Interleaved (up, down, up, down…) rather than "all risers then all
  // fallers" — a marquee is read as one continuous strip, not two grouped
  // halves, so mixing them keeps green/red variety in view at all times
  // instead of a visitor watching six green cards scroll by before the first
  // red one appears.
  const pulse: (MoverSummary & { up: boolean })[] = [];
  for (let i = 0; i < Math.max(risers.length, fallers.length); i++) {
    if (risers[i]) pulse.push({ ...risers[i], up: true });
    if (fallers[i]) pulse.push({ ...fallers[i], up: false });
  }

  // The marquee loops by translating exactly -50%, so the track must render
  // the same card list TWICE back-to-back — the second copy is purely visual
  // (aria-hidden, unfocusable) filler that seamlessly continues the first as
  // it scrolls off, not a duplicate the user is meant to notice or reach.
  //
  // On a quiet day `pulse` can be short (as few as 1-2 movers) — even
  // doubled, a handful of 144px cards falls well short of the page's 1400px
  // max content width (.container-app). The track then sits flush left
  // inside the wider overflow-hidden wrapper, leaving a permanent gap of
  // bare background to its right — and because that short track keeps
  // scrolling left inside its own small width, the boundary between "cards"
  // and "empty" visibly creeps toward the left edge before snapping back,
  // reading as a black bar that slides left. Cycling the real movers up to
  // MIN_COPY_CARDS before duplicating guarantees each half is comfortably
  // wider than any real layout, however few movers exist today. Only the
  // genuine first pass through the unique movers (i < pulse.length) is
  // real/focusable content; every cycled repeat and the whole second half
  // are `duplicate` (aria-hidden, unfocusable) filler.
  const MIN_COPY_CARDS = 16;
  const copyLen = Math.max(pulse.length, MIN_COPY_CARDS);
  const track: { m: (typeof pulse)[number]; duplicate: boolean }[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < copyLen; i++) {
      track.push({ m: pulse[i % pulse.length], duplicate: pass === 1 || i >= pulse.length });
    }
  }

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

      {/* Soft fade at both edges so cards don't feel like they're cut off
          mid-scroll — a small touch that reads as intentional motion design
          rather than an overflow accident. group-hover pauses the scroll so a
          visitor can actually read/click a card instead of chasing it.
          motion-reduce freezes the track at its start position for anyone who
          has asked their OS to minimise motion — the (aria-hidden,
          unfocusable) duplicate half then just sits clipped out of view by
          this wrapper's overflow-hidden, exactly as if it were never
          rendered, so no separate reduced-motion layout is needed. */}
      <div
        className="group overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]"
        role="region"
        aria-label="Today's biggest risers and fallers"
      >
        <div className="flex w-max animate-marquee gap-2.5 group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {track.map(({ m, duplicate }, i) => (
            <PulseCard key={`${m.up ? "up" : "down"}-${m.card.id}-${i}`} m={m} up={m.up} currency={info.currency} duplicate={duplicate} />
          ))}
        </div>
      </div>

      <Link href="/market" className="mt-3 block text-center text-xs font-semibold text-brand-300 hover:underline sm:hidden">
        View market index →
      </Link>
    </section>
  );
}
