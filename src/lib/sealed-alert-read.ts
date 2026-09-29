import { prisma } from "./db";
import type { Country } from "./country";
import { isPreorderSetCode } from "./constants";
import { sealedFloorCents } from "./ebay";
import { offerCurrencyOk } from "./offer-currency";
import { joinOverlapping, SEALED_GROUP_NAME, SEALED_SET_NAMES, typeLabel } from "./price-report";
import { canonicalSealedRow, dedupeStoreListings } from "./sealed-import";
import type { SealedWatchGroup } from "./sealed-watch";
import { isRealSealedStore } from "./sealed-watch";

// AN UNCACHED READ OF THE SEALED LISTINGS, FOR THE SEALED ALERT PASS ONLY
// (2026-09-29, DECISIONS.md "Sealed watches are checked about every six hours").
//
// The sealed import now runs four times a day (sealed-refresh.yml adds 01:00 and
// 13:00 UTC to the 07:00 and 19:00 of refresh-prices.yml) and the sealed watches
// are evaluated after each. getSealedGroups(market) is the wrong read for the
// two extra passes: it is a 48h Data Cache entry tagged CONTENT_TAG plus a
// 15-minute memo, so it would still hold the last purge's listings, and the only
// way to refresh it is revalidateTag(CONTENT_TAG) (lib/sealed-fresh.ts), which
// orphans every CONTENT_TAG cache on the site. Four extra purges a day is the
// deploy-cadence burn again (CLAUDE.md, "Deploys are gated"; the first egress
// audit's whole-table rereads). So the sealed pass reads the table itself,
// directly, and nothing is purged: the public /sealed page and the tag stay on
// the 07:00 / 19:00 rhythm.
//
// WHY THIS IS NOT A WRAP OF A SELF-CACHED LOADER. It calls neither
// getSealedGroups nor getPreorderGroups, nor sits inside an unstable_cache
// callback (tests/nested-cache.test.ts; db.ts egress rule 6): it is one narrow
// Prisma read, uncached by construction, made from a cron route.
//
// WHY IT IS NOT computeAllSealedGroups. That is private to sealed-import.ts, and
// a push touching that file starts a full price import (refresh-prices.yml's
// push paths). It also does what a watch has no use for: two more whole-table
// reads (canonical images, first-seen), the thumbnail ranking, the RRP badges.
// The run needs a product's name, type, set and REAL-STORE listings, so that is
// all this reads: no eBay row and no TCGplayer reference row leaves the
// database (isRealSealedStore is the run's own definition of a store), which
// also makes the read the smallest of the three. The grouping rules that decide
// WHICH listings a product has are the loader's own, shared not copied:
// canonicalSealedRow, dedupeStoreListings, the currency guard and the per-type
// price floor.
//
// EGRESS. One read per watched market per pass, `take`-capped: SealedListing is
// ~2.7k rows across every market, a fraction of them real stores. No write.

export const SEALED_ALERT_READ_CAP = 3000;

export interface SealedAlertRow {
  groupKey: string;
  title: string;
  productType: string;
  setCode: string | null;
  retailer: string;
  retailerName: string;
  priceCents: number;
  url: string;
  inStock: boolean;
  lastSeen: Date;
}

const own = (map: Readonly<Record<string, string>>, key: string): string | undefined => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);

/**
 * Stored rows to the run's groups, pre-orders included (the caller picks a
 * side). Pure. Mirrors getAllSealedGroups' grouping for everything that decides
 * a product's listings and its name; an eBay or TCGplayer row is dropped here as
 * well as in the query, so a caller handing in a wider read gets the same answer.
 */
export function groupSealedRowsForWatch(rows: SealedAlertRow[], market: Country, now: Date = new Date()): SealedWatchGroup[] {
  const groups = new Map<string, SealedWatchGroup>();
  for (const stored of rows) {
    const r = canonicalSealedRow(stored);
    if (!isRealSealedStore(r.retailer)) continue;
    if (!offerCurrencyOk(r.retailer, market)) continue; // a store charging another currency never shows in this market
    if (r.priceCents < sealedFloorCents(r.productType)) continue; // a mis-priced accessory, not a product
    let g = groups.get(r.groupKey);
    if (!g) {
      const setName = r.setCode ? own(SEALED_SET_NAMES, r.setCode) ?? r.setCode : null;
      const name = own(SEALED_GROUP_NAME, r.groupKey) ?? (!setName ? r.title : joinOverlapping(setName, typeLabel(r.setCode, r.productType)));
      g = { groupKey: r.groupKey, name, productType: r.productType, setCode: r.setCode, listings: [] };
      groups.set(r.groupKey, g);
    }
    g.listings.push({
      retailer: r.retailer,
      retailerName: r.retailerName,
      priceCents: r.priceCents,
      url: r.url,
      inStock: r.inStock,
      lastSeen: r.lastSeen.toISOString(),
    });
  }
  return Array.from(groups.values()).map((g) => ({ ...g, listings: dedupeStoreListings(g.listings, now.getTime()) }));
}

/** Every product in a market with a real-store listing, read now, from the table. Not cached, not memoised. */
export async function getAllSealedGroupsFresh(market: Country, now: Date = new Date()): Promise<SealedWatchGroup[]> {
  const rows = await prisma.sealedListing.findMany({
    where: { country: market, NOT: [{ retailer: "ebay" }, { retailer: { startsWith: "ebay_" } }, { retailer: "tcgplayer" }] },
    orderBy: { priceCents: "asc" },
    take: SEALED_ALERT_READ_CAP,
    select: { groupKey: true, title: true, productType: true, setCode: true, retailer: true, retailerName: true, priceCents: true, url: true, inStock: true, lastSeen: true },
  });
  return groupSealedRowsForWatch(rows, market, now);
}

/** Products that have shipped (getSealedGroups' side of the split), read fresh. */
export async function getSealedGroupsFresh(market: Country, now: Date = new Date()): Promise<SealedWatchGroup[]> {
  return (await getAllSealedGroupsFresh(market, now)).filter((g) => !isPreorderSetCode(g.setCode, now));
}

/** Products for a set that has not shipped (getPreorderGroups' side), read fresh. */
export async function getPreorderGroupsFresh(market: Country, now: Date = new Date()): Promise<SealedWatchGroup[]> {
  return (await getAllSealedGroupsFresh(market, now)).filter((g) => isPreorderSetCode(g.setCode, now));
}

/**
 * The two loaders runSealedWatches takes, sharing ONE read per market for the
 * pass (a run asks for the shipped side and, for a watched pre-order, the
 * other). The memo lives in the closure, so it is gone when the pass ends.
 */
export function freshSealedLoaders(now: Date = new Date(), read: (market: Country, now: Date) => Promise<SealedWatchGroup[]> = getAllSealedGroupsFresh) {
  const byMarket = new Map<Country, Promise<SealedWatchGroup[]>>();
  const all = (market: Country) => {
    let p = byMarket.get(market);
    if (!p) {
      p = read(market, now);
      byMarket.set(market, p);
      // A failed read must not be remembered as a result for a later call.
      p.catch(() => byMarket.delete(market));
    }
    return p;
  };
  return {
    groups: async (market: Country) => (await all(market)).filter((g) => !isPreorderSetCode(g.setCode, now)),
    preorderGroups: async (market: Country) => (await all(market)).filter((g) => isPreorderSetCode(g.setCode, now)),
    readsByMarket: () => [...byMarket.keys()],
  };
}
