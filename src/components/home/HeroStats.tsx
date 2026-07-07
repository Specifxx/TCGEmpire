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

// The hero stat row — reactive to the country switcher. Reads the active market from
// CountryProvider and shows that market's priced / in-stock / store counts + a
// market-labelled "US stores" tile. CountUp re-animates when the value changes.
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
    <div className="animate-fade-in [animation-delay:420ms] mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat value={totalCards} label="cards" />
      <Stat value={s.priced} label="priced" />
      <Stat value={s.inStock} label="in-stock listings" />
      <Stat value={s.stores} label={`${country} ${storeWord}`} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-3 transition-colors duration-200 hover:border-brand-500/40 hover:bg-ink-800">
      <div className="num text-xl font-extrabold text-accent sm:text-2xl">
        <CountUp value={value} />
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
