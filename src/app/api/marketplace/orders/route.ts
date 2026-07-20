import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { shipByDate, autoReleaseDate } from "@/lib/marketplace-policy";
import { estimateDeliveryWindow } from "@/lib/delivery-estimate";

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
      seller: { select: { id: true, displayName: true, sellerProfile: { select: { shopName: true, handlingDays: true } } } },
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

  // Unread message count per parcel — messages are stored against one anchor
  // order id per group (the alphabetically-first sibling; see
  // api/marketplace/orders/[id]/messages/route.ts), so derive that same anchor
  // per groupKey here to look counts up correctly.
  const idsByGroupKey = new Map<string, string[]>();
  for (const o of orders) {
    const key = `${o.stripeSessionId ?? o.id}:${o.sellerId}`;
    const arr = idsByGroupKey.get(key) ?? [];
    arr.push(o.id);
    idsByGroupKey.set(key, arr);
  }
  const anchorByGroupKey = new Map([...idsByGroupKey].map(([key, ids]) => [key, ids.slice().sort()[0]!]));
  const anchorIds = [...new Set(anchorByGroupKey.values())];
  const unreadCounts = anchorIds.length
    ? await prisma.orderMessage.groupBy({
        by: ["orderId"],
        where: { orderId: { in: anchorIds }, senderId: { not: user.id }, readAt: null },
        _count: { _all: true },
      })
    : [];
  const unreadByAnchor = new Map(unreadCounts.map((r) => [r.orderId, r._count._all]));

  const shaped = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    // Groups line-item orders that were actually one checkout + one seller
    // (a multi-item, and/or multi-seller, cart still creates one Order row per
    // LISTING LINE — this key lets the UI treat "one parcel" as one unit for
    // bulk ship/confirm actions instead of making the buyer/seller repeat the
    // same action once per line).
    groupKey: `${o.stripeSessionId ?? o.id}:${o.sellerId}`,
    sellerId: o.sellerId,
    role: o.buyerId === user.id ? ("buyer" as const) : ("seller" as const),
    status: o.status,
    quantity: o.quantity,
    totalCents: o.totalCents,
    shippingCents: o.shippingCents,
    feeCents: o.feeCents,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    receivedAt: o.receivedAt,
    transferredAt: o.transferredAt,
    trackingNote: o.trackingNote,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    disputedAt: o.disputedAt,
    // Concrete dates computed server-side (never client math — see
    // marketplace-policy.ts) so the UI always shows exactly what the cron
    // actually enforces. eta is a no-carrier-API estimate (delivery-estimate.ts).
    shipByAt: o.paidAt ? shipByDate(o.paidAt) : null,
    autoReleaseAt: o.shippedAt ? autoReleaseDate(o.shippedAt) : null,
    eta: estimateDeliveryWindow({
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      handlingDays: o.seller.sellerProfile?.handlingDays ?? 2,
      country: o.shipCountry,
    }),
    // Shipping address — only meaningful on the seller's own "Sales" rows (where
    // to send the parcel); harmless to also echo back to the buyer on their own
    // "Purchases" rows since it's their own data. Never another party's.
    shipName: o.shipName,
    shipLine1: o.shipLine1,
    shipLine2: o.shipLine2,
    shipCity: o.shipCity,
    shipRegion: o.shipRegion,
    shipPostcode: o.shipPostcode,
    shipCountry: o.shipCountry,
    shipPhone: o.shipPhone,
    releaseRequestedAt: o.releaseRequestedAt,
    cancelRequestedAt: o.cancelRequestedAt,
    cancelReason: o.cancelReason,
    // Which side proposed the cancellation — as a role, not a raw user id, so the
    // client can just compare it to this row's own `role` (no need to know its
    // own user id).
    cancelRequestedByRole: o.cancelRequestedBy == null ? null : o.cancelRequestedBy === o.buyerId ? ("buyer" as const) : ("seller" as const),
    reviewed: !!o.review,
    rating: o.review?.rating ?? null,
    counterparty:
      o.buyerId === user.id
        ? o.seller.sellerProfile?.shopName ?? o.seller.displayName
        : o.buyer.displayName,
    listing: byListing.get(o.marketplaceListingId ?? "") ?? null,
    unreadMessages: unreadByAnchor.get(anchorByGroupKey.get(`${o.stripeSessionId ?? o.id}:${o.sellerId}`)!) ?? 0,
  }));

  return NextResponse.json({ orders: shaped });
}
