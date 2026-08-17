"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import type { CardTileData } from "@/components/CardTile";
import { gaEvent } from "@/lib/ga-events";

// Under the hero search bar: instant paths into the database for a visitor who
// doesn't know what to search yet. Same demand signal (most-searched priced
// cards) that used to also power a "Most popular cards" section further down
// the homepage — that section is gone (its job is /browse's now, per the
// homepage-redesign brief), but the underlying signal lives on here, where it
// can shorten search→compare→buy to one click.
export function TrendingChips({ cards }: { cards: CardTileData[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="animate-fade-in [animation-delay:320ms] mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-1.5">
      <span className="rb-eyebrow text-slate-600">Trending</span>
      {cards.slice(0, 6).map((c) => (
        <Link
          key={c.id}
          href={cardHref(c)}
          prefetch={false}
          onClick={() => {
            track("trending_chip_click", { card: c.slug ?? c.id });
            // Closes the GA4-blind gap flagged in DECISIONS.md's Phase 2
            // entry: a trending-chip click is real search-intent evidence
            // (a visitor took the "instant path in" instead of typing), and
            // docs/homepage-measurement.md's "search initiation rate" metric
            // is defined as search_initiated OR search_submitted OR a
            // trending-chip selection. Reusing search_initiated with a
            // dedicated `trigger` value (rather than inventing a third event
            // name) means that metric's GA4 query stays a simple
            // "search_initiated OR search_submitted" — no separate
            // trending_chip_click GA4 event to also union in.
            gaEvent("search_initiated", { trigger: "trending_chip", card_id: c.id, variant: "hero" });
          }}
          className="chip max-w-[9.5rem] border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
        >
          <span className="truncate">{cardDisplayName(c.name, c)}</span>
        </Link>
      ))}
    </div>
  );
}
