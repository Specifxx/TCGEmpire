"use client";

import Link from "next/link";
import { CardTile, type CardTileData } from "@/components/CardTile";
import { Reveal } from "@/components/Reveal";
import { useCountry } from "@/components/CountryProvider";
import type { Country } from "@/lib/country";
import type { VendettaPulse } from "@/lib/vendetta";

// Replaces the old marquee's hype ("Riftbound: Vendetta is here", repeated six
// times) with real numbers: the cheapest sealed booster box in the visitor's
// market (store named), how the set's prices have moved since the earliest
// snapshot we have, and a handful of chase cards with live prices. #e5484d
// (Vendetta's "Fury" red) is used ONLY here and on genuine Vendetta badges
// sitewide — nowhere else on the homepage spends that colour as decoration.
export function VendettaBlock({
  pulseByCountry,
  chaseCards,
}: {
  pulseByCountry: Record<Country, VendettaPulse>;
  chaseCards: CardTileData[];
}) {
  const { country, fmt } = useCountry();
  const pulse = pulseByCountry[country] ?? pulseByCountry.AU;

  // Nothing real to show yet (e.g. a market with no Vendetta listings at all
  // and no price history) — stay silent rather than render an empty shell.
  if (!pulse.cheapestBox && pulse.pricePct == null && chaseCards.length === 0) return null;

  return (
    <Reveal>
      <section
        aria-labelledby="vendetta-heading"
        className="card-surface relative overflow-hidden p-4 sm:p-5"
        style={{ borderColor: "#e5484d4d" }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="chip text-[11px] font-bold uppercase tracking-wide" style={{ backgroundColor: "#e5484d26", color: "#e5484d" }}>
              Vendetta
            </span>
            <h2 id="vendetta-heading" className="text-xl font-extrabold text-white">The new set, priced</h2>
          </div>
          <Link href="/sets/vendetta" className="btn shrink-0 font-bold text-white" style={{ backgroundColor: "#e5484d" }}>
            Shop Vendetta →
          </Link>
        </div>

        {/* Only 2-column when there's genuinely a second tile to show — a
            "price history isn't ready yet" placeholder used to fill that slot
            unconditionally, which both stated the obvious (new set, no
            history yet) and forced a dead second column once removed. The
            cheapest-box tile (real data or its own "will appear here" note)
            simply spans the full row alone until price-history exists. */}
        <div className={`mb-4 grid gap-3 ${pulse.pricePct != null ? "sm:grid-cols-2" : ""}`}>
          {pulse.cheapestBox ? (
            <div className="rounded-lg border border-ink-800 bg-ink-900 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest booster box</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="num text-xl font-extrabold text-accent">{fmt(pulse.cheapestBox.priceCents)}</span>
                <span className="text-sm text-slate-400">at {pulse.cheapestBox.retailerName}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-ink-800 bg-ink-900 p-3 text-sm text-slate-500">
              Sealed booster box prices will appear here the moment a store lists one in your market.
            </div>
          )}
          {pulse.pricePct != null && (
            <div className="rounded-lg border border-ink-800 bg-ink-900 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Prices since {pulse.sinceLabel}</div>
              <div className={`num mt-1 flex items-center gap-1.5 text-xl font-extrabold ${pulse.pricePct >= 0 ? "text-up" : "text-down"}`}>
                <span aria-hidden>{pulse.pricePct >= 0 ? "▲" : "▼"}</span>
                {Math.abs(pulse.pricePct)}%
                <span className="text-xs font-medium text-slate-500">{pulse.pricePct >= 0 ? "up" : "down"} since release</span>
              </div>
            </div>
          )}
        </div>

        {chaseCards.length > 0 && (
          <>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Chase cards</div>
            {/* Same size/format as the "Most popular Vendetta cards" row below
                (default-size CardTile, same w-36/sm:w-44 tile width, same
                horizontal-scroll row + edge fade) — neither a capped-and-
                centred grid nor a "compact" tile actually filled the row;
                matching the carousel's own proven layout does, since there
                are now up to 8 real chase cards to fill it with instead of a
                fixed 4. */}
            <div className="relative">
              <Reveal stagger className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
                {chaseCards.map((c) => (
                  <div key={c.id} className="w-36 shrink-0 sm:w-44">
                    <CardTile card={c} />
                  </div>
                ))}
              </Reveal>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent sm:w-16"
              />
            </div>
          </>
        )}
      </section>
    </Reveal>
  );
}
