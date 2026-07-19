import { prisma } from "@/lib/db";
import { MARKETPLACE_PUBLIC } from "@/lib/marketplace";
import { MarketplaceHeroLive } from "./MarketplaceHeroLive";

// Server half of the card-page marketplace hero — the "main attention grab" the
// user asked for, shown ONLY when this card actually has active listings (D6 in
// the plan). Deliberately cookie-free (no getCountry() here) so the card page
// keeps its ISR cache valid across every visitor's market; the client half
// (MarketplaceHeroLive) re-localises to the visitor's own country after
// hydration, same pattern as CardPriceMetrics/CardPriceComparison.
export async function MarketplaceHeroBlock({ cardId }: { cardId: string }) {
  if (!MARKETPLACE_PUBLIC) return null;

  const listings = await prisma.marketplaceListing.findMany({
    where: { cardId, status: "ACTIVE", quantity: { gt: 0 } },
    select: { priceCents: true, quantity: true, country: true, currency: true },
    take: 50,
  });
  if (listings.length === 0) return null;

  // The id is the anchor target for the card page's Product JSON-LD offer URLs
  // (…#marketplace-listings) — keep the two in sync.
  return (
    <div id="marketplace-listings">
      <MarketplaceHeroLive cardId={cardId} initial={listings} />
    </div>
  );
}
