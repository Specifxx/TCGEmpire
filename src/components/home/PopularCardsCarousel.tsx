"use client";

import { useState } from "react";
import Link from "next/link";
import { CardTile, type CardTileData } from "@/components/CardTile";
import { Reveal } from "@/components/Reveal";
import type { Mover, RecentUpdate } from "@/lib/price-history";

// One tab's worth of content: either a plain card list (Vendetta / All-time) or
// a list with a per-card % delta (price movers, or the recently-updated feed).
// Rendering all these shapes through the same tab strip is what actually merges
// what used to be three separate homepage sections instead of just visually
// pairing them. `deltas` only ever needs `.pct` — it deliberately isn't typed as
// the full `Mover` (which also carries a sparkline `points` series this
// component doesn't render), so any per-card-delta list can feed a tab, not
// just real movers.
type Tab = {
  key: string;
  label: string;
  heading: string;
  description: string;
  allHref: string;
  allLabel: string;
  cards: CardTileData[];
  deltas?: { pct: number }[]; // when set, render the % delta caption under each tile
};

// Unifies what used to be three separate, near-identically-shaped homepage
// sections — "Most popular Vendetta cards", "Most popular Riftbound cards",
// and the always-expanded "Recently updated prices" grid — into one compact,
// tabbed, one-row horizontal scroll, plus a "Biggest movers" tab so
// price-movement content lives here too instead of its own section. Every
// tab's cards stay in the DOM at all times (only visibility toggles) — same
// crawlability as the old always-rendered sections, and keeps the page's
// existing ItemList JSON-LD blocks (built from the all-time and
// recently-updated lists) matching what's actually in the page.
export function PopularCardsCarousel({
  vendetta,
  allTime,
  movers,
  recentlyUpdated,
  storeCount,
  storeWord,
}: {
  vendetta: CardTileData[];
  allTime: CardTileData[];
  movers: Mover[];
  recentlyUpdated: RecentUpdate[];
  storeCount: number;
  storeWord: string;
}) {
  const tabs: Tab[] = [
    ...(vendetta.length > 0
      ? [
          {
            key: "vendetta",
            label: "Vendetta",
            heading: "Most popular Vendetta cards",
            description: "The most-searched Vendetta cards right now — live prices compared across every store we track.",
            allHref: "/sets/vendetta",
            allLabel: "See all Vendetta prices →",
            cards: vendetta,
          },
        ]
      : []),
    {
      key: "alltime",
      label: "All-time",
      heading: "Most popular Riftbound cards",
      description: `The most-searched cards right now — compare ${storeCount} local ${storeWord} for every one to find the best price.`,
      allHref: "/browse",
      allLabel: "View all →",
      cards: allTime,
    },
    ...(movers.length > 0
      ? [
          {
            key: "movers",
            label: "Biggest movers",
            heading: "Biggest movers",
            description: "Riftbound cards moving the most this week, up or down.",
            allHref: "/movers",
            allLabel: "See all movers →",
            cards: movers.map((m) => m.card),
            deltas: movers,
          },
        ]
      : []),
    ...(recentlyUpdated.length > 0
      ? [
          {
            key: "recent",
            label: "Recently updated",
            heading: "Recently updated prices",
            description: `${recentlyUpdated.length} Riftbound cards whose price just changed — updated with every price refresh.`,
            allHref: "/movers",
            allLabel: "See all movers →",
            cards: recentlyUpdated.map((u) => u.card),
            deltas: recentlyUpdated,
          },
        ]
      : []),
  ];

  const [active, setActive] = useState(tabs[0]?.key);
  if (tabs.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-pressed={active === t.key}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
              active === t.key ? "bg-brand-500 text-white" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? "" : "hidden"}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">{t.heading}</h2>
              <p className="mt-0.5 text-sm text-slate-400">{t.description}</p>
            </div>
            <Link href={t.allHref} className="btn-ghost text-xs shrink-0">{t.allLabel}</Link>
          </div>
          {/* Right-edge fade + scroll-padding signal there's more to scroll to —
              without it the last card just sits flush against the container
              edge with a bare scrollbar underneath, no cue anything continues
              past it. The mask is a decorative overlay (aria-hidden), not part
              of the scroll container itself, so it never blocks pointer/touch
              scrolling. */}
          <div className="relative">
            <Reveal stagger className="scroll-px-1 -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
              {t.cards.map((c, i) => {
                const pct = t.deltas?.[i]?.pct;
                return (
                  <div key={c.id} className="w-36 shrink-0 snap-start sm:w-44">
                    <CardTile card={c} />
                    {pct != null && (
                      <p className={`num mt-1 text-center text-xs font-bold ${pct > 0 ? "text-up" : "text-down"}`}>
                        {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </Reveal>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent sm:w-16"
            />
          </div>
        </div>
      ))}
    </section>
  );
}
