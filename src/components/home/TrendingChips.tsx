"use client";

import { useRef } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import type { CardTileData } from "@/components/CardTile";
import { trackEvent } from "@/lib/analytics";
import { useQuickView } from "@/components/QuickView";

// Under the hero search bar: instant paths into the database for a visitor who
// doesn't know what to search yet. Same demand signal (most-searched priced
// cards) that used to also power a "Most popular cards" section further down
// the homepage — that section is gone (its job is /browse's now, per the
// homepage-redesign brief), but the underlying signal lives on here, where it
// can shorten search→compare→buy to one click.
function TrendingChip({ c }: { c: CardTileData }) {
  const { open } = useQuickView();
  // Same instant-preview pattern as CardTile/MarketPulse/TodaysTopDeals: left
  // click opens the QuickView popup instead of navigating away — a chip's
  // whole point is "shortcut past typing," so it shouldn't cost a full page
  // load either. The real href stays on the <Link> for SEO, sharing and
  // middle/ctrl-click; the pointerdown-distance/time check ignores a click
  // synthesized from a drag/scroll gesture, same as every other quick-view
  // trigger on the page.
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onClick(e: React.MouseEvent) {
    track("trending_chip_click", { card: c.slug ?? c.id });
    // Closes the GA4-blind gap flagged in DECISIONS.md's Phase 2 entry: a
    // trending-chip click is real search-intent evidence (a visitor took the
    // "instant path in" instead of typing), and
    // docs/homepage-measurement.md's "search initiation rate" metric is
    // defined as search_initiated OR search_submitted OR a trending-chip
    // selection. Reusing search_initiated with a dedicated `trigger` value
    // (rather than inventing a third event name) means that metric's GA4
    // query stays a simple "search_initiated OR search_submitted" — no
    // separate trending_chip_click GA4 event to also union in. Fires
    // regardless of whether the click opens QuickView or falls through to a
    // real navigation — either way it's the same search-intent signal.
    trackEvent("search_initiated", { trigger: "trending_chip", card_id: c.id, variant: "hero" });
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
      // min-h-11: .chip's own py-0.5 measured ~22px tall on a real 390px
      // viewport, short of the 44px mobile tap-target floor every other
      // interactive control on the page gets (see globals.css's
      // pointer:coarse block, which bumps this exact utility to 48px on
      // touch) — .chip itself stays untouched since most of its other
      // sitewide uses are non-interactive labels/badges, not tap targets.
      className="chip min-h-11 max-w-[9.5rem] border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
    >
      <span className="truncate">{cardDisplayName(c.name, c)}</span>
    </Link>
  );
}

export function TrendingChips({ cards }: { cards: CardTileData[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="animate-fade-in [animation-delay:320ms] mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-1.5">
      <span className="rb-eyebrow text-slate-600">Trending</span>
      {cards.slice(0, 6).map((c) => (
        <TrendingChip key={c.id} c={c} />
      ))}
    </div>
  );
}
