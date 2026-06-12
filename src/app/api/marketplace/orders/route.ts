import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The signed-in user's marketplace orders, both sides: purchases (they're the
// buyer) and sales (they're the seller). Listing/card details come via the soft
// marketplaceListingId link; reviews are joined so the UI knows what's reviewable.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      buyer: { select: { id: true, displayName: true } },
      seller: { select: { id: true, displayName: true, sellerProfile: { select: { shopName: true } } } },
      review: { select: { rating: true } },
    },
  });

  // Hydrate card info for each order's listing (soft link — no Prisma relation).
  const listingIds = [...new Set(orders.map((o) => o.marketplaceListingId).filter((x): x is string => !!x))];
  const listings = await prisma.marketplaceListing.findMany({
    where: { id: { in: listingIds } },
    select: {
      id: true, condition: true, isFoil: true, currency: true,
      card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true } },
    },
  });
  const byListing = new Map(listings.map((l) => [l.id, l]));

  const shaped = orders.map((o) => ({
    id: o.id,
    role: o.buyerId === user.id ? ("buyer" as const) : ("seller" as const),
    status: o.status,
    quantity: o.quantity,
    totalCents: o.totalCents,
    shippingCents: o.shippingCents,
    feeCents: o.feeCents,
    createdAt: o.createdAt,
    shippedAt: o.shippedAt,
    receivedAt: o.receivedAt,
    trackingNote: o.trackingNote,
    reviewed: !!o.review,
    rating: o.review?.rating ?? null,
    counterparty:
      o.buyerId === user.id
        ? o.seller.sellerProfile?.shopName ?? o.seller.displayName
        : o.buyer.displayName,
    listing: byListing.get(o.marketplaceListingId ?? "") ?? null,
  }));

  return NextResponse.json({ orders: shaped });
}
