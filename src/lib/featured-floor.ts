import type { Country } from "./country";
import type { PriceMovers } from "./price-history";

// What the FRONT PAGE features (owner, 2026-11-12): the dearer items, because a
// buyer who clicks a US$150 booster box earns far more commission than one who
// clicks a US$0.50 common. Cheap items stay searchable, listed and linkable;
// they are just not featured on the home pages and deal shelves. Selection only:
// a floor on the featured lists, never a re-order of a product's store rows.
//
// US$5 for a single and US$50 for sealed, from the real data: 75% of priced US
// singles are under US$3 (median 15c) while the top 10% start at ~US$75; US
// sealed boxes/cases/displays are US$57+ at the median and packs, Showdown and
// Champion starter decks sit under US$50. Other markets get hand-rounded
// equivalents, like the budget tiers in TodaysTopDeals (not FX-converted).
export const FEATURE_FLOOR_CENTS: Record<Country, { card: number; sealed: number }> = {
  US: { card: 500, sealed: 5000 },
  AU: { card: 800, sealed: 8000 },
  UK: { card: 400, sealed: 4000 },
  SG: { card: 700, sealed: 7000 },
  CA: { card: 700, sealed: 7000 },
  EU: { card: 450, sealed: 4500 },
};

/** Movers worth featuring: at or above the card floor, falling back to the raw list when too few clear it. */
export function featuredMovers(m: PriceMovers, country: Country, limit: number): PriceMovers {
  const floor = FEATURE_FLOOR_CENTS[country].card;
  const pick = <T extends { nowCents: number }>(xs: T[]): T[] => {
    const dear = xs.filter((x) => x.nowCents >= floor);
    return (dear.length >= Math.min(limit, 3) ? dear : xs).slice(0, limit);
  };
  return { ...m, spiking: pick(m.spiking), plummeting: pick(m.plummeting), value: pick(m.value) };
}
