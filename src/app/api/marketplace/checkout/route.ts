import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { importMarketplaceListings, platformFeeCents, canViewMarketplaceListings } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

// Cart checkout. TEST MODE — settles the whole cart against the demo wallet, with
// shipping combined per seller (free over the seller's threshold). The single seam
// that becomes a Stripe PaymentIntent + per-seller transfers in production.
const schema = z.object({
  items: z.array(z.object({ listingId: z.string().min(1), quantity: z.number().int().positive().max(999) })).min(1).max(50),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to buy" }, { status: 401 });
  if (!canViewMarketplaceListings(user.email, user.isAdmin)) {
    return NextResponse.json({ error: "The marketplace is in private beta" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Load every listing fresh + its seller's shipping policy.
      const lines: { listing: any; quantity: number }[] = [];
      for (const it of parsed.data.items) {
        const listing = await tx.marketplaceListing.findUnique({
          where: { id: it.listingId },
          include: { seller: { select: { id: true, sellerProfile: { select: { shippingFlatCents: true, freeOverCents: true } } } } },
        });
        if (!listing || listing.status !== "ACTIVE" || listing.quantity < it.quantity) {
          throw new Error("A listing in your cart is no longer available");
        }
        if (listing.sellerId === user.id) throw new Error("You can't buy your own listing");
        lines.push({ listing, quantity: it.quantity });
      }

      // Group by seller to combine shipping (free over the seller's threshold).
      const bySeller = new Map<string, { itemCents: number; flat: number; freeOver: number }>();
      for (const { listing, quantity } of lines) {
        const g = bySeller.get(listing.sellerId) ?? {
          itemCents: 0,
          flat: listing.seller.sellerProfile?.shippingFlatCents ?? 0,
          freeOver: listing.seller.sellerProfile?.freeOverCents ?? 0,
        };
        g.itemCents += listing.priceCents * quantity;
        bySeller.set(listing.sellerId, g);
      }

      let totalCents = 0;
      const sellerPayouts = new Map<string, number>();
      for (const [sellerId, g] of bySeller) {
        const shipping = g.freeOver > 0 && g.itemCents >= g.freeOver ? 0 : g.flat;
        totalCents += g.itemCents + shipping;
        const fee = platformFeeCents(g.itemCents);
        sellerPayouts.set(sellerId, g.itemCents + shipping - fee);
      }

      const buyer = await tx.user.findUnique({ where: { id: user.id }, select: { balanceCents: true } });
      if (!buyer || buyer.balanceCents < totalCents) {
        throw new Error("Insufficient demo wallet balance for this purchase");
      }

      // Move money + fulfil each line.
      await tx.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: totalCents } } });
      for (const [sellerId, payout] of sellerPayouts) {
        await tx.user.update({ where: { id: sellerId }, data: { balanceCents: { increment: payout } } });
      }
      let orders = 0;
      for (const { listing, quantity } of lines) {
        const remaining = listing.quantity - quantity;
        await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: { quantity: remaining, status: remaining <= 0 ? "SOLD_OUT" : "ACTIVE" },
        });
        await tx.order.create({
          data: {
            kind: "MARKETPLACE",
            marketplaceListingId: listing.id,
            buyerId: user.id,
            sellerId: listing.sellerId,
            quantity,
            totalCents: listing.priceCents * quantity,
          },
        });
        orders++;
      }

      return { totalCents, orders, newBalance: buyer.balanceCents - totalCents };
    });

    await importMarketplaceListings().catch(() => {});
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
