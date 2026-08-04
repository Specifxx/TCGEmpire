import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getChaseCards } from "@/lib/cheapest-cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { EbayPicksLive, type PickListing } from "./EbayPicksLive";

/**
 * Server half of the tailored eBay unit.
 *
 * Picks the set's chase cards, then pulls the CHEAPEST cached eBay listing for
 * each (rank 0) in every market at once, so the client half can select the
 * visitor's market without this component reading cookies — the pages that host
 * it stay statically cacheable. Same split as EbayAdCarousel.
 *
 * Costs no eBay API quota: EbayAdListing rows are captured as a side effect of
 * the daily per-card Browse call (searchEbayLowest's captureAdListings).
 *
 * STALENESS IS THE FAILURE MODE THAT MATTERS. Carousel rows previously outlived
 * the listings they described, so a page could advertise sold items under a
 * "live" heading with affiliate links on them — stale is worse than empty here
 * precisely because it claims to be live. The writer now clears rows per market,
 * and MAX_AGE_HOURS is the belt-and-braces on the read side: a row the daily
 * import hasn't refreshed within two cycles is dropped rather than shown.
 */
const MAX_AGE_HOURS = 48;

// One row per card per market, so 6 cards is ~36 rows of 8 narrow columns. Well
// inside lib/db.ts's per-request egress rules, and cached below regardless.
const LISTING_SELECT = {
  cardId: true,
  country: true,
  priceCents: true,
  shippingCents: true,
  currency: true,
  url: true,
  imageUrl: true,
  title: true,
} as const;

async function loadPicks(setCode: string, limit: number): Promise<PickListing[]> {
  // Card SELECTION uses one fixed market so every visitor gets the same tiles
  // (and one cache entry); only the LISTINGS are per-market. Same baseline
  // pattern the homepage uses for popular/chase cards.
  const cards = await getChaseCards(limit, DEFAULT_COUNTRY, setCode);
  if (cards.length === 0) return [];
  const nameById = new Map(cards.map((c) => [c.id, c.name]));

  const rows = await prisma.ebayAdListing.findMany({
    where: {
      cardId: { in: cards.map((c) => c.id) },
      rank: 0, // the cheapest listing we captured for that card in that market
      updatedAt: { gte: new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000) },
    },
    select: LISTING_SELECT,
    take: cards.length * 8,
  });

  return rows
    .filter((r) => r.imageUrl && nameById.has(r.cardId))
    .map((r) => ({ ...r, cardName: nameById.get(r.cardId) as string }));
}

export async function EbayPicks({
  setCode = "VEN",
  limit = 6,
  heading,
  fallbackQuery = "Riftbound Vendetta",
  className,
}: {
  setCode?: string;
  limit?: number;
  heading?: string;
  fallbackQuery?: string;
  className?: string;
}) {
  // Cached hard: this is the same handful of rows on five high-traffic pages, and
  // /browse is force-dynamic so without this it would hit Postgres per request.
  // CONTENT_TAG is cleared by the daily import, so fresh listings appear then.
  let listings: PickListing[] = [];
  try {
    listings = await unstable_cache(() => loadPicks(setCode, limit), ["ebay-picks", setCode, String(limit)], {
      revalidate: 3600,
      tags: [CONTENT_TAG],
    })();
  } catch {
    // A database blip must not take down a content page for an ad unit; the
    // client half renders the generic eBay CTA when it gets nothing.
    listings = [];
  }

  return (
    <EbayPicksLive
      listings={listings}
      fallbackQuery={fallbackQuery}
      className={className}
      {...(heading ? { heading } : {})}
    />
  );
}
