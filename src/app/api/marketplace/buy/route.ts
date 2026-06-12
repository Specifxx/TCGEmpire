import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { importMarketplaceListings, platformFeeCents } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

// TEST-MODE checkout. Settles against the demo wallet (User.balanceCents) so the buy
// flow can be tried end-to-end before real payments. Production payouts move to
// Stripe Connect (see docs/MARKETPLACE.md) — this endpoint is the seam for it.
//
// With `offerId`, the purchase completes an ACCEPTED offer: price and quantity come
// from the offer (not the listing), and the offer is marked COMPLETED in the same
// transaction so it can't be redeemed twice.
const schema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().positive().max(999).default(1),
  offerId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to buy" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { listingId, offerId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
        include: { seller: { select: { id: true, sellerProfile: { select: { shippingFlatCents: true, freeOverCents: true } } } } },
      });
      if (!listing || listing.status !== "ACTIVE") throw new Error("This listing is no longer available");
      if (listing.sellerId === user.id) throw new Error("You can't buy your own listing");

      // Accepted-offer path: the deal's price/quantity override the listing's.
      let unitCents = listing.priceCents;
      let quantity = parsed.data.quantity;
      if (offerId) {
        const offer = await tx.marketplaceOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.buyerId !== user.id || offer.listingId !== listing.id) {
          throw new Error("Offer not found");
        }
        if (offer.status !== "ACCEPTED") throw new Error("This offer isn't accepted (or was already used)");
        unitCents = offer.priceCents;
        quantity = offer.quantity;
        await tx.marketplaceOffer.update({ where: { id: offer.id }, data: { status: "COMPLETED" } });
      }
      if (listing.quantity < quantity) throw new Error("This listing is no longer available");

      const itemCents = unitCents * quantity;
      const prof = listing.seller.sellerProfile;
      const flat = prof?.shippingFlatCents ?? 0;
      const freeOver = prof?.freeOverCents ?? 0;
      const shippingCents = freeOver > 0 && itemCents >= freeOver ? 0 : flat;
      const totalCents = itemCents + shippingCents;
      const feeCents = platformFeeCents(itemCents);
      const sellerGets = itemCents + shippingCents - feeCents;

      const buyer = await tx.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      if (!buyer || buyer.balanceCents < totalCents) {
        throw new Error("Insufficient demo wallet balance for this test purchase");
      }

      await tx.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: totalCents } } });
      await tx.user.update({ where: { id: listing.sellerId }, data: { balanceCents: { increment: sellerGets } } });

      const remaining = listing.quantity - quantity;
      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { quantity: remaining, status: remaining <= 0 ? "SOLD_OUT" : "ACTIVE" },
      });

      const order = await tx.order.create({
        data: {
          kind: "MARKETPLACE",
          marketplaceListingId: listing.id,
          buyerId: user.id,
          sellerId: listing.sellerId,
          quantity,
          totalCents,
          shippingCents,
          feeCents,
        },
      });

      return { orderId: order.id, totalCents, newBalance: buyer.balanceCents - totalCents };
    });

    // Refresh the comparison rows (stock/price may have changed).
    await importMarketplaceListings().catch(() => {});
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
