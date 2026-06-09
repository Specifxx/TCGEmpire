import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewMarketplaceListings, platformFeeCents } from "@/lib/marketplace";
import { stripe, stripeEnabled, releaseExpiredReservations, RESERVATION_MINUTES } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.object({ listingId: z.string().min(1), quantity: z.number().int().positive().max(999) })).min(1).max(50),
});

// Create a Stripe Checkout Session for a marketplace cart. Reserves stock
// (Skinport-style) by opening PENDING orders + decrementing availability for a
// hold window; the webhook flips them to PAID, expiry releases them.
export async function POST(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Card checkout isn't enabled yet" }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to buy" }, { status: 401 });
  if (!canViewMarketplaceListings(user.email)) {
    return NextResponse.json({ error: "The marketplace is in private beta" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });

  // Free up any abandoned reservations before we try to reserve.
  await releaseExpiredReservations().catch(() => {});

  // Stripe Checkout Sessions expire no sooner than 30 min; keep the stock hold in
  // step with the session so they release together.
  const holdMinutes = Math.min(Math.max(RESERVATION_MINUTES, 30), 1440);
  const reservedUntil = new Date(Date.now() + holdMinutes * 60_000);

  let reservation:
    | { orderIds: string[]; currency: string; lineItems: { name: string; amountCents: number; quantity: number }[]; shippingCents: number }
    | null = null;

  try {
    reservation = await prisma.$transaction(async (tx) => {
      const lines: { listing: any; quantity: number }[] = [];
      for (const it of parsed.data.items) {
        const listing = await tx.marketplaceListing.findUnique({
          where: { id: it.listingId },
          include: {
            card: { select: { name: true, setCode: true, collectorNumber: true } },
            seller: { select: { id: true, sellerProfile: { select: { shippingFlatCents: true, freeOverCents: true } } } },
          },
        });
        if (!listing || listing.status !== "ACTIVE" || listing.quantity < it.quantity) {
          throw new Error("A listing in your cart is no longer available");
        }
        if (listing.sellerId === user.id) throw new Error("You can't buy your own listing");
        lines.push({ listing, quantity: it.quantity });
      }

      const currency = lines[0].listing.currency as string;

      // Combine shipping per seller (free over their threshold).
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
      let shippingCents = 0;
      const shipBySeller = new Map<string, number>();
      for (const [sellerId, g] of bySeller) {
        const ship = g.freeOver > 0 && g.itemCents >= g.freeOver ? 0 : g.flat;
        shippingCents += ship;
        shipBySeller.set(sellerId, ship);
      }

      // Reserve: decrement stock + open a PENDING order per line.
      const orderIds: string[] = [];
      const lineItems: { name: string; amountCents: number; quantity: number }[] = [];
      const sellerShipApplied = new Set<string>();
      for (const { listing, quantity } of lines) {
        const remaining = listing.quantity - quantity;
        await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: { quantity: remaining, status: remaining <= 0 ? "SOLD_OUT" : "ACTIVE" },
        });
        // Attribute each seller's combined shipping to their first line.
        const sellerShip = sellerShipApplied.has(listing.sellerId) ? 0 : (shipBySeller.get(listing.sellerId) ?? 0);
        sellerShipApplied.add(listing.sellerId);
        const itemCents = listing.priceCents * quantity;
        const order = await tx.order.create({
          data: {
            kind: "MARKETPLACE",
            marketplaceListingId: listing.id,
            buyerId: user.id,
            sellerId: listing.sellerId,
            quantity,
            totalCents: itemCents + sellerShip,
            shippingCents: sellerShip,
            feeCents: platformFeeCents(itemCents),
            status: "PENDING",
            reservedUntil,
          },
        });
        orderIds.push(order.id);
        const card = listing.card;
        lineItems.push({
          name: `${card.name}${card.setCode ? ` (${card.setCode} ${card.collectorNumber ?? ""})` : ""} · ${listing.condition}${listing.isFoil ? " Foil" : ""}`.trim(),
          amountCents: listing.priceCents,
          quantity,
        });
      }
      return { orderIds, currency, lineItems, shippingCents };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Create the hosted Checkout Session. If this fails, release the reservation.
  try {
    const cur = reservation.currency.toLowerCase();
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: reservation.lineItems.map((li) => ({
        quantity: li.quantity,
        price_data: {
          currency: cur,
          unit_amount: li.amountCents,
          product_data: { name: li.name },
        },
      })),
      ...(reservation.shippingCents > 0
        ? {
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount" as const,
                  display_name: "Shipping",
                  fixed_amount: { amount: reservation.shippingCents, currency: cur },
                },
              },
            ],
          }
        : {}),
      expires_at: Math.floor(reservedUntil.getTime() / 1000),
      metadata: { orderIds: reservation.orderIds.join(","), kind: "MARKETPLACE" },
      success_url: `${SITE_URL}/marketplace?purchase=success`,
      cancel_url: `${SITE_URL}/marketplace?purchase=cancelled`,
    });

    await prisma.order.updateMany({
      where: { id: { in: reservation.orderIds } },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (e) {
    // Compensate: cancel the PENDING orders and restore stock.
    await releaseReservation(reservation.orderIds).catch(() => {});
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}

// Cancel specific PENDING orders and restore their stock (used when session
// creation fails after we've already reserved).
async function releaseReservation(orderIds: string[]): Promise<void> {
  for (const id of orderIds) {
    await prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id }, select: { status: true, marketplaceListingId: true, quantity: true } });
      if (o?.status !== "PENDING") return;
      await tx.order.update({ where: { id }, data: { status: "CANCELLED" } });
      if (o.marketplaceListingId) {
        const l = await tx.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { status: true } });
        await tx.marketplaceListing.update({
          where: { id: o.marketplaceListingId },
          data: { quantity: { increment: o.quantity }, ...(l?.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
        });
      }
    });
  }
}
