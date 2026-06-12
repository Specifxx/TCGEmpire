import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice } from "@/lib/country";
import { canViewMarketplaceListings, getSellerRatings } from "@/lib/marketplace";
import { stripeEnabled } from "@/lib/stripe";
import { MarketplaceClient, type MktCard } from "@/components/MarketplaceClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace — buy Riftbound cards",
  description: "Buy Riftbound cards directly from verified sellers on RiftCompare.",
  robots: { index: false, follow: true }, // private beta — not indexed yet
};

export default async function MarketplacePage() {
  const user = await getCurrentUser();
  const country = getCountry();
  const info = COUNTRIES[country];

  // Private beta: only allow-listed testers see listings; everyone else gets the
  // Coming-Soon teaser (and verified sellers get their dashboard).
  if (!canViewMarketplaceListings(user?.email)) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card-surface border-brand-500/30 p-8 text-center">
          <span className="chip mb-3 inline-flex bg-brand-500/15 font-bold uppercase tracking-wide text-brand-300">Coming soon</span>
          <h1 className="font-display text-3xl font-extrabold text-white">RiftCompare Marketplace</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">
            Buy Riftbound cards directly from verified sellers — fast, secure, with prices you can trust. We&apos;re
            putting the finishing touches on payments and shipping.
          </p>
          {user?.isVerifiedSeller && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/marketplace/sell" className="btn-primary">Open your seller dashboard →</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "ACTIVE", quantity: { gt: 0 }, country },
    orderBy: { createdAt: "desc" },
    take: 300, // egress rule: no unbounded reads on a per-request page

    include: {
      card: {
        select: {
          id: true, name: true, slug: true, setCode: true, collectorNumber: true,
          imageThumbUrl: true, variant: true, isPromo: true, rarity: true,
          lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
        },
      },
      seller: { select: { id: true, displayName: true, sellerProfile: { select: { shopName: true, isOfficial: true, shippingNote: true } } } },
    },
  });

  // Seller ratings in one query for every seller on the page.
  const ratings = await getSellerRatings([...new Set(listings.map((l) => l.sellerId))]);

  // Group by card; sort each card's offers official-store-first, then cheapest.
  const byCard = new Map<string, MktCard>();
  for (const l of listings) {
    const r = ratings.get(l.sellerId);
    const offer = {
      id: l.id,
      priceCents: l.priceCents,
      condition: l.condition,
      isFoil: l.isFoil,
      quantity: l.quantity,
      currency: l.currency,
      sellerId: l.sellerId,
      sellerName: l.seller.sellerProfile?.shopName ?? l.seller.displayName,
      isOfficial: !!l.seller.sellerProfile?.isOfficial,
      shippingNote: l.seller.sellerProfile?.shippingNote ?? null,
      ratingAvg: r?.avg ?? null,
      ratingCount: r?.count ?? 0,
    };
    const existing = byCard.get(l.cardId);
    if (existing) existing.offers.push(offer);
    else {
      // The site's own lowest store price for this market — the delta benchmark
      // ("12% under market") shown against every offer.
      const marketCents = pickPrice(l.card, country);
      const { lowestPriceCents, lowestPriceCentsNz, lowestPriceCentsUs, lowestPriceCentsUk, ...cardLite } = l.card;
      byCard.set(l.cardId, { card: cardLite, marketCents, offers: [offer] });
    }
  }
  const cards: MktCard[] = [...byCard.values()].map((c) => {
    c.offers.sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || a.priceCents - b.priceCents);
    return c;
  });
  // Cards with the cheapest offer first.
  cards.sort((a, b) => Math.min(...a.offers.map((o) => o.priceCents)) - Math.min(...b.offers.map((o) => o.priceCents)));

  return <MarketplaceClient cards={cards} place={info.place} stripeEnabled={stripeEnabled()} signedIn={!!user} />;
}
