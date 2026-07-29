"use client";

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

// The hero stat line — reactive to the country switcher. Reads the active market
// from CountryProvider and shows that market's priced / in-stock / store counts.
// Collapsed to a single thin text line (was 4 bordered boxes) so the hero reads
// as "search, then a fact, then go" rather than a dashboard.
export function HeroStats({
  totalCards,
  statsByCountry,
}: {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
}) {
  const { country } = useCountry();
  const s = statsByCountry[country] ?? statsByCountry.AU;
  const storeWord = s.stores === 1 ? "store" : "stores";

  return (
    <p className="animate-fade-in [animation-delay:420ms] num mt-3 text-center text-xs text-slate-500 sm:text-sm">
      <CountUp value={totalCards} /> cards · <CountUp value={s.priced} /> priced ·{" "}
      <CountUp value={s.inStock} /> in-stock listings · <CountUp value={s.stores} /> {country} {storeWord}
    </p>
  );
}
