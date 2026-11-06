import type { Country } from "./country";
import { prisma } from "./db";
import { getSealedGroups } from "./sealed-import";
import { getPriceMovers, cachedOrDirect } from "./price-history";
import { getLiveAuctions, type AuctionRow } from "./ebay-auctions";
import { getCheapestOnEbayFor } from "./arbitrage";
import { ebayAffiliateUrl } from "./affiliate";
import {
  auctionWatch,
  dropsWatch,
  gradedWatch,
  sealedWatch,
  GRADED_WATCH_MAX_AGE_HOURS,
  type DropWatchRow,
  type GradedListingRow,
  type GradedWatchCard,
  type GradedWatchRow,
  type SealedWatchRow,
} from "./price-watch";

// The loaders behind the price watch sections (lib/price-watch.ts has the pure
// rules). Every input caches itself; nothing here wraps another loader in
// a second cache (CLAUDE.md, tests/nested-cache.test.ts). The one new read,
// getGradedWatch, is two bounded selects held six hours: never lower than the
// page's own revalidate (lib/db.ts, rule 5).

/** Six hours: the floor for pages buyers act on, and the sale pages' own revalidate. */
export const PRICE_WATCH_TTL = 21600;
/** Graded rows read per market; one row per card survives (gradedWatch), so this is the pool, not the page. */
const GRADED_WATCH_POOL = 120;

export interface PriceWatchData {
  sealed: SealedWatchRow[];
  drops: DropWatchRow[];
  graded: GradedWatchRow[];
  auctions: AuctionRow[];
}

/**
 * The dearest live slabs of a market, one per card, from the same
 * EbayGradedListing rows the card pages and /graded read (a public model, so
 * the file snapshot answers it in `files` mode). URLs are tagged here with the
 * page's source so the row is one tracked click.
 */
export function getGradedWatch(country: Country, source: string): Promise<GradedWatchRow[]> {
  return cachedOrDirect(
    async () => {
      const listings = (await prisma.ebayGradedListing.findMany({
        where: { country, updatedAt: { gte: new Date(Date.now() - GRADED_WATCH_MAX_AGE_HOURS * 3_600_000) } },
        orderBy: { priceCents: "desc" },
        take: GRADED_WATCH_POOL,
        select: {
          cardId: true, itemId: true, priceCents: true, shippingCents: true, currency: true,
          url: true, title: true, imageUrl: true, grader: true, grade: true, updatedAt: true,
        },
      })) as GradedListingRow[];
      const ids = [...new Set(listings.map((l) => l.cardId))];
      const cards = ids.length
        ? await prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, setName: true, collectorNumber: true }, take: ids.length })
        : ([] as GradedWatchCard[]);
      return gradedWatch(listings, new Map(cards.map((c) => [c.id, c]))).map((r) => ({ ...r, url: ebayAffiliateUrl(r.url, source) }));
    },
    ["rc-graded-watch-v1", country, source],
    { revalidate: PRICE_WATCH_TTL, tags: ["graded-watch"] },
  );
}

/** Everything the PriceWatch component draws for one market. Each source is guarded: one failing never empties the rest. */
export async function getPriceWatch(country: Country, source: string): Promise<PriceWatchData> {
  const [groups, movers, auctions, graded] = await Promise.all([
    getSealedGroups(country).catch(() => []),
    getPriceMovers(country, 8).catch(() => ({ spiking: [], plummeting: [], value: [] })),
    getLiveAuctions(country).catch(() => [] as AuctionRow[]),
    getGradedWatch(country, source).catch(() => [] as GradedWatchRow[]),
  ]);
  const plummeting = movers.plummeting;
  const ebayByCard = await getCheapestOnEbayFor(country, plummeting.map((m) => m.card.id)).catch(() => new Map());
  return {
    sealed: sealedWatch(groups),
    drops: dropsWatch(plummeting, ebayByCard, (url) => ebayAffiliateUrl(url, source)),
    graded,
    auctions: auctionWatch(auctions),
  };
}
