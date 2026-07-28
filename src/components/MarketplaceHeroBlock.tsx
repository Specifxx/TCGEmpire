import Link from "next/link";
import { prisma } from "@/lib/db";
import { MARKETPLACE_PUBLIC } from "@/lib/marketplace";
import { MarketplaceHeroLive } from "./MarketplaceHeroLive";

// Server half of the card-page marketplace hero — the "main attention grab" the
// user asked for, shown when this card actually has active listings (D6 in the
// plan). Deliberately cookie-free (no getCountry() here) so the card page
// keeps its ISR cache valid across every visitor's market; the client half
// (MarketplaceHeroLive) re-localises to the visitor's own country after
// hydration, same pattern as CardPriceMetrics/CardPriceComparison.
//
// When a card has NO active listings (most cards, early on — the marketplace's
// bootleneck right now is supply, not visibility), show a one-line seller
// recruitment nudge instead of nothing. Card pages are the highest-intent,
// highest-volume traffic the site has (someone searching THIS exact card's
// price) — the previous silent `return null` wasted that as a place to recruit
// the sellers the marketplace actually needs. Static/generic copy only (no
// per-card data beyond the name, no cookies) so it stays ISR-cache-safe.
export async function MarketplaceHeroBlock({ cardId, cardName }: { cardId: string; cardName: string }) {
  if (!MARKETPLACE_PUBLIC) return null;

  const listings = await prisma.marketplaceListing.findMany({
    where: { cardId, status: "ACTIVE", quantity: { gt: 0 } },
    select: {
      priceCents: true,
      quantity: true,
      country: true,
      currency: true,
      seller: { select: { displayName: true, sellerProfile: { select: { shopName: true, isOfficial: true } } } },
    },
    take: 50,
  });

  if (listings.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No one&apos;s listed <span className="text-slate-400">{cardName}</span> on our{" "}
        <Link href="/marketplace/sell" className="text-brand-400 hover:underline">Marketplace</Link> yet — list yours in
        under 2 minutes and be the first.
      </p>
    );
  }

  // The id is the anchor target for the card page's Product JSON-LD offer URLs
  // (…#marketplace-listings) — keep the two in sync.
  return (
    <div id="marketplace-listings">
      <MarketplaceHeroLive cardId={cardId} initial={listings} />
    </div>
  );
}
