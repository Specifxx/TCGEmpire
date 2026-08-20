// Shared per-market stat tiles + freshness signal for the homepage hero, factored
// out so the 4 region home pages (/au, /uk, /sg, /ca — see app/[region]/page.tsx)
// can show a real, region-scoped first-paint stat without re-deriving this query set
// or drifting from the homepage's own numbers.
//
// unstable_cache-wrapped with a FIXED key (no per-route/per-country key): the
// underlying query set covers all five markets in one batch already, so every
// caller — "/" and all four region pages — shares the exact same cache entry
// instead of each route paying for its own copy of the same aggregates. Same
// egress discipline as getTopDeals() in app/page.tsx.
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { priceField, type Country } from "./country";
import { RETAILER_LIST } from "./retailers";
import { CONTENT_TAG } from "./revalidate-content";
import { timeAgo } from "./format";
import type { MarketStat } from "@/components/home/HeroStats";

const COUNTRY_CODES: Country[] = ["AU", "US", "UK", "SG", "CA"];

export interface HomeStats {
  totalCards: number;
  statsByCountry: Record<Country, MarketStat>;
  freshness: string | null;
}

async function computeHomeStats(): Promise<HomeStats> {
  const [totalCards, pricedCounts, inStockGroups, storeRows, lastPriceRefresh] = await Promise.all([
    prisma.card.count(),
    Promise.all(COUNTRY_CODES.map((c) => prisma.card.count({ where: { [priceField(c)]: { not: null } } }))),
    prisma.retailerPrice.groupBy({
      by: ["country"],
      where: { inStock: true, NOT: { retailer: { startsWith: "marketguide" } } },
      _count: { _all: true },
    }),
    Promise.all([
      prisma.retailerPrice.groupBy({ by: ["country", "retailer"], where: { NOT: { retailer: { startsWith: "ebay" } } } }),
      prisma.sealedListing.groupBy({ by: ["country", "retailer"], where: { NOT: { retailer: { startsWith: "ebay" } } } }),
    ]).then(([singles, sealed]) => [...singles, ...sealed]),
    prisma.retailerPrice.aggregate({ _max: { lastSeen: true } }),
  ]);

  const inStockByCountry: Record<string, number> = {};
  for (const g of inStockGroups) inStockByCountry[g.country] = g._count._all;

  // Same RETAILER_LIST intersection app/page.tsx used inline — a store removed
  // from retailers.ts must stop counting, and TCGplayer/Cardmarket/Marketplace
  // pseudo-retailers must never count as independent "stores".
  const validRetailerKeys = new Set(RETAILER_LIST.map((r) => r.key));
  const storesByCountry: Record<string, Set<string>> = {};
  for (const r of storeRows) {
    if (!validRetailerKeys.has(r.retailer)) continue;
    (storesByCountry[r.country] ??= new Set()).add(r.retailer);
  }

  const statsByCountry = Object.fromEntries(
    COUNTRY_CODES.map((c, i) => [c, { priced: pricedCounts[i], inStock: inStockByCountry[c] ?? 0, stores: storesByCountry[c]?.size ?? 0 }]),
  ) as Record<Country, MarketStat>;

  return {
    totalCards,
    statsByCountry,
    freshness: lastPriceRefresh._max.lastSeen ? timeAgo(lastPriceRefresh._max.lastSeen) : null,
  };
}

export const getHomeStats = unstable_cache(computeHomeStats, ["home-stats-v1"], {
  revalidate: 3600,
  tags: [CONTENT_TAG],
});
