import { prisma } from "@/lib/db";
import { EbayAdCarouselLive, type AdListing } from "./EbayAdCarouselLive";

// Server half — fetches every market's cached eBay ad listings for this card
// (a handful of rows at most, cookie-free, so the card page stays ISR-cacheable)
// and hands them to the client half, which picks the visitor's own market via
// useCountry(). See EbayAdCarouselLive for the render + fallback behaviour.
export async function EbayAdCarousel({ cardId, query, className, compact }: { cardId: string; query: string; className?: string; compact?: boolean }) {
  const rows = await prisma.ebayAdListing.findMany({
    where: { cardId },
    orderBy: [{ country: "asc" }, { rank: "asc" }],
    select: { country: true, rank: true, priceCents: true, shippingCents: true, currency: true, url: true, title: true, imageUrl: true },
  });
  return <EbayAdCarouselLive listings={rows as AdListing[]} query={query} className={className} compact={compact} />;
}
