"use client";

import Link from "next/link";
import { useCountry } from "@/components/CountryProvider";
import { CountUp } from "@/components/CountUp";
import type { Country } from "@/lib/country";

// Per-market figures for the hero stat tiles. Serialized for all four markets so the
// tiles can localise to the visitor's market client-side (the page itself is ISR-
// cached and market-neutral). `cards` is global, so it lives outside this.
export interface MarketStat {
  priced: number;
  inStock: number;
  stores: number;
}

const statLinkCls = "text-slate-400 underline-offset-2 transition-colors hover:text-brand-400 hover:underline";

// The hero stat line — reactive to the country switcher. Reads the active market
// from CountryProvider and shows that market's priced / in-stock / store counts.
// Collapsed to a single thin text line (was 4 bordered boxes) so the hero reads
// as "search, then a fact, then go" rather than a dashboard.
//
// `freshness` is a pre-formatted "Xh ago"-style string, computed SERVER-SIDE
// once (see app/page.tsx) from the real max(RetailerPrice.lastSeen) and passed
// down as plain text — deliberately NOT recomputed client-side. This page is
// ISR-cached, so the server-render timestamp and the moment a visitor hydrates
// can be up to an hour apart; a component that called timeAgo() again on the
// client would read a DIFFERENT elapsed time than what the server rendered and
// throw a hydration mismatch. Baking the string once, like every other server-
// computed figure on this page, avoids that entirely.
export function HeroStats({
  totalCards,
  statsByCountry,
  freshness,
}: {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  freshness?: string | null;
}) {
  const { country } = useCountry();
  const s = statsByCountry[country] ?? statsByCountry.AU;
  const storeWord = s.stores === 1 ? "store" : "stores";

  return (
    <div className="mt-3 text-center">
      {/* No entrance animation here (unlike its siblings in CinematicHero): this
          line is Lighthouse's LCP element on mobile, and an opacity-0 → 1 fade
          with a staggered delay pushes back the moment it's actually painted,
          directly inflating LCP. It's real informational content, not
          decoration, so it renders immediately with the rest of the SSR'd hero. */}
      <p className="num text-xs text-slate-500 sm:text-sm">
        <Link href="/browse" className={statLinkCls}>
          <CountUp value={totalCards} /> cards
        </Link>{" "}
        · <CountUp value={s.priced} /> priced ·{" "}
        <Link href="/tools/deal-finder" className={statLinkCls}>
          <CountUp value={s.inStock} /> in-stock listings
        </Link>{" "}
        ·{" "}
        <Link href="/stores/tracked" className={statLinkCls}>
          {/* The one clause that's actually about the VISITOR's own market —
              emphasised (brighter + bold) rather than reworded, so the region
              wording visibly follows the selected market post-hydration
              without touching the market-neutral H1 above it. */}
          <span className="font-semibold text-slate-300">
            <CountUp value={s.stores} /> {country} {storeWord}
          </span>
        </Link>
      </p>
      {freshness && (
        <p className="mt-1 text-[11px] text-slate-600">
          <span aria-hidden="true" className="text-up">●</span> Prices updated {freshness}
        </p>
      )}
    </div>
  );
}
