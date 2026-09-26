"use client";

import type { ReactNode } from "react";
import { CardQuickLink } from "./CardQuickLink";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";
import { cardDisplayName } from "@/lib/card-name";

// An article's card mention (2026-09-26): the linked name plus an inline chip
// with the card's cheapest price in the VIEWER's market — the same localised
// figure a CardTile shows (useCountry().price). Click opens the existing
// QuickView; the href stays a real /card/… link for crawlers and new tabs.
export function CardPriceChip({ card, children }: { card: CardTileData; children: ReactNode }) {
  const { price, fmt } = useCountry();
  const cents = price(card);
  return (
    <CardQuickLink card={card} className="text-brand-400 underline decoration-brand-400/40 underline-offset-2 hover:text-brand-300">
      {children}
      {cents != null && (
        <span className="num ml-1 inline-block rounded bg-ink-800 px-1.5 py-px align-[1px] text-[0.8em] font-semibold text-slate-100 no-underline ring-1 ring-ink-700">
          {fmt(cents)}
        </span>
      )}
    </CardQuickLink>
  );
}

/** "Prices for cards in this post" — every card the post links, cheapest price in the viewer's market. */
export function PostPriceTable({ cards }: { cards: CardTileData[] }) {
  const { price, fmt, country } = useCountry();
  return (
    <section aria-labelledby="post-prices-h" className="card-surface mt-8 overflow-hidden">
      <h2 id="post-prices-h" className="p-4 text-lg font-bold text-white sm:px-5">
        Prices for cards in this post
      </h2>
      <ul className="divide-y divide-ink-800 border-t border-ink-800">
        {cards.map((c) => {
          const cents = price(c);
          return (
            <li key={c.id}>
              <CardQuickLink card={c} className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-ink-900/40 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{cardDisplayName(c.name, c)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.setName} · {c.collectorNumber}
                  </span>
                </span>
                <span className="num shrink-0 text-sm font-semibold text-white">
                  {cents != null ? fmt(cents) : <span className="font-normal text-slate-500">No {country} listing yet</span>}
                </span>
              </CardQuickLink>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-ink-800 px-4 py-2 text-xs text-slate-500 sm:px-5">
        Cheapest in-stock price we track in your market, updated daily. Tap a card for every store.
      </p>
    </section>
  );
}
