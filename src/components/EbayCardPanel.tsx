import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { COUNTRY_LIST, priceField } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { EbayCardPanelLive } from "./EbayCardPanelLive";
import type { GradedRow } from "./EbayGradedLive";
import type { AuctionRow } from "./EbayAuctionsLive";
import type { AdListing } from "./EbayAdCarouselLive";

/**
 * Server half of the card page's tabbed eBay panel: Listings / Graded /
 * Auctions.
 *
 * Loads EVERY market's rows and lets the client half select the visitor's, so
 * the card page stays statically cacheable — the same split EbayPicks,
 * EbayAdCarousel and EbayAuctions already use. Reading the country here would
 * force the route dynamic and undo the ISR work the page depends on.
 */

/** Rows not refreshed within this window are not served. */
const GRADED_MAX_AGE_HOURS = 72;

/** Per-market cheapest tracked RAW price, keyed `country|cardId`. */
async function marketPrices(cardIds: string[]): Promise<Map<string, number>> {
  if (cardIds.length === 0) return new Map();
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      ...Object.fromEntries(COUNTRY_LIST.map((c) => [priceField(c.code), true])),
    } as any,
  });
  const out = new Map<string, number>();
  for (const c of cards as any[]) {
    for (const info of COUNTRY_LIST) {
      const v = c[priceField(info.code)];
      if (typeof v === "number" && v > 0) out.set(`${info.code}|${c.id}`, v);
    }
  }
  return out;
}

async function loadGraded(cardId: string): Promise<GradedRow[]> {
  const rows = await prisma.ebayGradedListing.findMany({
    where: {
      cardId,
      // A fixed-price listing has no end time — it just sells — so freshness is
      // by age. A sold slab still on screen sends a buyer to a dead page with an
      // affiliate tag on it, which is the same failure the auction panel guards
      // against with endsAt. The importer also sweeps rows that stop returning.
      updatedAt: { gte: new Date(Date.now() - GRADED_MAX_AGE_HOURS * 3600 * 1000) },
    },
    orderBy: [{ grade: "desc" }, { priceCents: "asc" }],
    take: 24,
    select: {
      itemId: true, cardId: true, country: true, priceCents: true, shippingCents: true,
      currency: true, url: true, title: true, imageUrl: true, grader: true, grade: true,
    },
  });
  const prices = await marketPrices([cardId]);
  return rows.map((r) => ({ ...r, marketCents: prices.get(`${r.country}|${r.cardId}`) ?? null }));
}

async function loadAuctions(cardId: string): Promise<AuctionRow[]> {
  const rows = await prisma.ebayAuction.findMany({
    where: { cardId, endsAt: { gt: new Date() } },
    orderBy: { endsAt: "asc" },
    take: 12,
    select: {
      itemId: true, cardId: true, country: true, currentBidCents: true, bidCount: true,
      buyItNowCents: true, currency: true, endsAt: true, url: true, title: true,
      imageUrl: true, isGraded: true,
    },
  });
  const prices = await marketPrices([cardId]);
  return rows.map((r) => ({
    ...r,
    endsAt: r.endsAt.toISOString(),
    marketCents: prices.get(`${r.country}|${r.cardId}`) ?? null,
  }));
}

/** Ad-carousel rows — the Listings tab. Same query EbayAdCarousel used. */
async function loadListings(cardId: string): Promise<AdListing[]> {
  return (await prisma.ebayAdListing.findMany({
    where: { cardId },
    orderBy: [{ country: "asc" }, { rank: "asc" }],
    select: {
      country: true, rank: true, priceCents: true, shippingCents: true,
      currency: true, url: true, title: true, imageUrl: true,
    },
  })) as AdListing[];
}

export async function EbayCardPanel({
  cardId,
  query,
  className,
}: {
  cardId: string;
  /** Card name for the generic "search eBay" fallback in the Listings tab. */
  query: string;
  className?: string;
}) {
  let graded: GradedRow[] = [];
  let auctions: AuctionRow[] = [];
  let listings: AdListing[] = [];
  try {
    // Five minutes, not the hour used elsewhere on this page: an auction ending
    // in two hours cannot sit behind a one-hour cache and still be honest.
    [graded, auctions, listings] = await unstable_cache(
      () => Promise.all([loadGraded(cardId), loadAuctions(cardId), loadListings(cardId)]),
      ["ebay-card-panel", cardId],
      { revalidate: 300, tags: [CONTENT_TAG] },
    )();
  } catch {
    // A database blip must never take down a card page for a panel.
    graded = [];
    auctions = [];
    listings = [];
  }

  return (
    <EbayCardPanelLive
      cardId={cardId}
      query={query}
      listings={listings}
      graded={graded}
      auctions={auctions}
      className={className}
    />
  );
}
