import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewMarketplaceListings, platformFeeCents, isLaunchCountry } from "@/lib/marketplace";
import { estimateShippingCents, validateShippingAddress } from "@/lib/shipping";
import { stripe, stripeEnabled, releaseExpiredReservations, RESERVATION_MINUTES } from "@/lib/stripe";
import { nextNumber } from "@/lib/order-number";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.object({ listingId: z.string().min(1), quantity: z.number().int().positive().max(999) })).min(1).max(50),
  shippingAddress: z.object({
    name: z.string().trim().min(2).max(100),
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().nullable(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postcode: z.string().trim().min(1).max(20),
    phone: z.string().trim().max(30).optional().nullable(),
  }),
  saveAddress: z.boolean().optional(),
});

// Create a Stripe Checkout Session for a marketplace cart. Reserves stock
// (Skinport-style) by opening PENDING orders + decrementing availability for a
// hold window; the webhook flips them to PAID, expiry releases them.
//
// Launch constraints (single seller per checkout — see plan D1): one parcel, one
// currency, one refund path, one Connect transfer_group. A cart spanning sellers
// is rejected up front rather than silently split.
//
// The shipping address is collected HERE (not via Stripe's own
// shipping_address_collection) so we can (a) show a live postcode-based cost
// estimate before payment and (b) always have somewhere to actually ship the
// order — Stripe Checkout alone never asked for one, which was a real gap.
// Country is never buyer-chosen: it's always the listing's own market (checkout
// is same-region-only), so there's no address/listing mismatch to guard against.
export async function POST(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Card checkout isn't enabled yet" }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to buy" }, { status: 401 });
  if (!canViewMarketplaceListings(user.email, user.isAdmin)) {
    return NextResponse.json({ error: "The marketplace is in private beta" }, { status: 403 });
  }

  const rl = rateLimit(`mp-checkout:${clientIp(req)}:${user.id}`, 10, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });

  // Free up any abandoned reservations before we try to reserve.
  await releaseExpiredReservations().catch(() => {});

  // Stripe Checkout Sessions expire no sooner than 30 min; keep the stock hold in
  // step with the session so they release together.
  const holdMinutes = Math.min(Math.max(RESERVATION_MINUTES, 30), 1440);
  const reservedUntil = new Date(Date.now() + holdMinutes * 60_000);

  let reservation:
    | {
        orderIds: string[];
        currency: string;
        lineItems: { name: string; amountCents: number; quantity: number }[];
        shippingCents: number;
        address: { name: string; line1: string; line2: string | null; city: string; region: string; postcode: string; country: string; phone: string | null };
      }
    | null = null;

  try {
    reservation = await prisma.$transaction(async (tx) => {
      const lines: { listing: any; quantity: number }[] = [];
      for (const it of parsed.data.items) {
        const listing = await tx.marketplaceListing.findUnique({
          where: { id: it.listingId },
          include: {
            card: { select: { name: true, setCode: true, collectorNumber: true } },
            seller: {
              select: {
                id: true,
                sellerProfile: { select: { shippingFlatCents: true, freeOverCents: true, postcode: true, payoutsEnabled: true, suspendedAt: true } },
              },
            },
          },
        });
        if (!listing || listing.status !== "ACTIVE" || listing.quantity < it.quantity) {
          throw new Error("A listing in your cart is no longer available");
        }
        if (listing.sellerId === user.id) throw new Error("You can't buy your own listing");
        if (listing.seller.sellerProfile?.suspendedAt) throw new Error("This seller is no longer active");
        if (!listing.seller.sellerProfile?.payoutsEnabled) {
          throw new Error("This seller hasn't finished payout setup yet — try again later");
        }
        lines.push({ listing, quantity: it.quantity });
      }

      // Single seller per checkout — one parcel, one currency, one Connect transfer.
      const sellerIds = new Set(lines.map((l) => l.listing.sellerId));
      if (sellerIds.size > 1) {
        throw new Error("Checkout is one seller at a time — buy each seller's items separately");
      }

      const country = lines[0].listing.country as string;
      if (!isLaunchCountry(country)) throw new Error("This listing's market isn't open yet");

      // Validate the shipping address against the LISTING's market — country is
      // never taken from the client, it's always this.
      const addrCheck = validateShippingAddress(country, parsed.data.shippingAddress);
      if (!addrCheck.ok) throw new Error(addrCheck.error);
      const address = addrCheck.address;

      const currency = lines[0].listing.currency as string;
      const profile = lines[0].listing.seller.sellerProfile;
      const itemCents = lines.reduce((sum, { listing, quantity }) => sum + listing.priceCents * quantity, 0);

      // Authoritative shipping cost — the exact same function the live checkout
      // preview calls (api/marketplace/shipping-estimate), so what the buyer saw
      // before paying is exactly what they're charged.
      const { cents: shippingCents } = estimateShippingCents({
        country,
        sellerPostcode: profile?.postcode ?? null,
        buyerPostcode: address.postcode,
        baseCents: profile?.shippingFlatCents ?? 0,
        freeOverCents: profile?.freeOverCents ?? 0,
        itemCents,
      });

      // Reserve: decrement stock + open a PENDING order per line, each stamped with
      // its own official order number and a copy of the shipping address (shipping
      // cost is attributed to the first line only, matching the single line-item
      // "Shipping" charge below).
      const orderIds: string[] = [];
      const lineItems: { name: string; amountCents: number; quantity: number }[] = [];
      let shipApplied = false;
      for (const { listing, quantity } of lines) {
        const remaining = listing.quantity - quantity;
        await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: { quantity: remaining, status: remaining <= 0 ? "SOLD_OUT" : "ACTIVE" },
        });
        const sellerShip = shipApplied ? 0 : shippingCents;
        shipApplied = true;
        const lineItemCents = listing.priceCents * quantity;
        const orderNumber = await nextNumber("orders", tx);
        const order = await tx.order.create({
          data: {
            kind: "MARKETPLACE",
            marketplaceListingId: listing.id,
            buyerId: user.id,
            sellerId: listing.sellerId,
            quantity,
            totalCents: lineItemCents + sellerShip,
            shippingCents: sellerShip,
            feeCents: platformFeeCents(lineItemCents),
            status: "PENDING",
            reservedUntil,
            orderNumber,
            currency,
            shipName: address.name,
            shipLine1: address.line1,
            shipLine2: address.line2 ?? null,
            shipCity: address.city,
            shipRegion: address.region,
            shipPostcode: address.postcode,
            shipCountry: country,
            shipPhone: address.phone ?? null,
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
      return { orderIds, currency, lineItems, shippingCents, address: { ...address, country } };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Save as the user's new default address for next time (best-effort, never
  // blocks checkout).
  if (parsed.data.saveAddress) {
    await prisma.user
      .update({
        where: { id: user.id },
        data: {
          shipName: reservation.address.name,
          shipLine1: reservation.address.line1,
          shipLine2: reservation.address.line2,
          shipCity: reservation.address.city,
          shipRegion: reservation.address.region,
          shipPostcode: reservation.address.postcode,
          shipCountry: reservation.address.country,
          shipPhone: reservation.address.phone,
        },
      })
      .catch(() => {});
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
