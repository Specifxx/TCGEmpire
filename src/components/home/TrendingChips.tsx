"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import type { CardTileData } from "@/components/CardTile";

// Under the hero search bar: instant paths into the database for a visitor who
// doesn't know what to search yet. Same demand signal that powers "Most popular
// cards" below (most-searched priced cards) — not a separate "trending" concept,
// just the top slice of it surfaced earlier, where it can shorten
// search→compare→buy to one click.
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
          onClick={() => track("trending_chip_click", { card: c.slug ?? c.id })}
          className="chip max-w-[9.5rem] border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
        >
          <span className="truncate">{cardDisplayName(c.name, c)}</span>
        </Link>
      ))}
    </div>
  );
}
