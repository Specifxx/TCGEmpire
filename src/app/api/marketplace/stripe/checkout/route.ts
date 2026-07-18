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
// A cart CAN span multiple sellers — one Checkout Session, one card charge, one
// shared delivery address. What's per-seller: shipping cost (each seller has
// their own flat rate/postcode, so shipping is computed and charged as its own
// named line item per seller — Stripe's `shipping_options` mechanism only
// supports ONE shipping choice for a whole session, not several simultaneous
// per-seller charges, so plain price_data line items are used instead) and the
// eventual Connect payout (each Order already carries its own sellerId, so
// releaseFundsForOrder() transfers to the right seller regardless of how many
// others were in the same cart). Order numbers are already per LISTING LINE,
// so a multi-seller cart naturally gets one RC-###### per line, same as a
// multi-item single-seller cart always has.
//
// The shipping address is collected HERE (not via Stripe's own
// shipping_address_collection) so we can (a) show a live postcode-based cost
// estimate before payment and (b) always have somewhere to actually ship the
// order — Stripe Checkout alone never asked for one, which was a real gap.
// Country is never buyer-chosen: it's always the listings' own market (every
// listing in the cart must share one country/currency — same-region-only
// browsing already guarantees this in practice; asserted defensively below).
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
                sellerProfile: { select: { shopName: true, shippingFlatCents: true, freeOverCents: true, postcode: true, payoutsEnabled: true, suspendedAt: true } },
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
          throw new Error(`${listing.seller.sellerProfile?.shopName ?? "A seller"} hasn't finished payout setup yet — try again later`);
        }
        lines.push({ listing, quantity: it.quantity });
      }

      // Every listing in the cart must share one market/currency — same-region
      // browsing already guarantees this; this is just a defensive assertion.
      const country = lines[0].listing.country as string;
      const currency = lines[0].listing.currency as string;
      if (lines.some((l) => l.listing.country !== country)) {
        throw new Error("Your cart mixes markets — buy items from one region at a time");
      }
      if (!isLaunchCountry(country)) throw new Error("This listing's market isn't open yet");

      // Validate the shipping address against the shared market — country is
      // never taken from the client, it's always this.
      const addrCheck = validateShippingAddress(country, parsed.data.shippingAddress);
      if (!addrCheck.ok) throw new Error(addrCheck.error);
      const address = addrCheck.address;

      // Group by seller — shipping is computed per seller (their own flat
      // rate/postcode), and each seller's items get their own Order rows so
      // Connect payouts still land with the right seller.
      const bySeller = new Map<string, { listing: any; quantity: number }[]>();
      for (const line of lines) {
        const arr = bySeller.get(line.listing.sellerId) ?? [];
        arr.push(line);
        bySeller.set(line.listing.sellerId, arr);
      }

      const orderIds: string[] = [];
      const lineItems: { name: string; amountCents: number; quantity: number }[] = [];

      for (const [, sellerLines] of bySeller) {
        const profile = sellerLines[0].listing.seller.sellerProfile;
        const shopName = profile?.shopName ?? "Seller";
        const itemCents = sellerLines.reduce((sum, { listing, quantity }) => sum + listing.priceCents * quantity, 0);

        // Authoritative shipping cost for THIS seller — the exact same function
        // the live checkout preview calls (api/marketplace/shipping-estimate),
        // so what the buyer saw before paying is exactly what they're charged.
        const { cents: sellerShippingCents } = estimateShippingCents({
          country,
          sellerPostcode: profile?.postcode ?? null,
          buyerPostcode: address.postcode,
          baseCents: profile?.shippingFlatCents ?? 0,
          freeOverCents: profile?.freeOverCents ?? 0,
          itemCents,
        });

        // Reserve this seller's lines: decrement stock + open a PENDING order
        // per line, each stamped with its own official order number. Shipping
        // is attributed to the first line of THIS seller's group only.
        let shipApplied = false;
        for (const { listing, quantity } of sellerLines) {
          const remaining = listing.quantity - quantity;
          await tx.marketplaceListing.update({
            where: { id: listing.id },
            data: { quantity: remaining, status: remaining <= 0 ? "SOLD_OUT" : "ACTIVE" },
          });
          const sellerShip = shipApplied ? 0 : sellerShippingCents;
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

        // One named shipping line item per seller (not Stripe's shipping_options
        // — that only supports a single shipping CHOICE for the whole session,
        // not several simultaneous per-seller charges).
        if (sellerShippingCents > 0) {
          lineItems.push({ name: `Shipping — ${shopName}`, amountCents: sellerShippingCents, quantity: 1 });
        }
      }

      return { orderIds, currency, lineItems, address: { ...address, country } };
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
