import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { importMarketplaceListings } from "@/lib/marketplace";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { sendOrderReceiptEmail, sendSaleNotificationEmail } from "@/lib/marketplace-email";
import { shipByDate } from "@/lib/marketplace-policy";
import { notify } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";

export const dynamic = "force-dynamic";
// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = "nodejs";

// Confirm or release marketplace orders based on Stripe Checkout events.
export async function POST(req: Request) {
  if (!stripeEnabled() || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === "premium") await premiumStarted(session);
        else await markPaid(session);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind !== "premium") await releaseSession(session);
        break;
      }
      // Premium renewals: every successful subscription invoice re-stamps
      // premiumUntil with the new period end. A cancelled/lapsed sub simply
      // stops getting stamped and entitlement runs out on its own.
      case "invoice.paid": {
        await premiumRenewed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        break;
    }
  } catch {
    // Returning 500 makes Stripe retry — acceptable for transient DB blips.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function orderIdsFrom(session: Stripe.Checkout.Session): string[] {
  const meta = session.metadata?.orderIds ?? "";
  return meta.split(",").map((s) => s.trim()).filter(Boolean);
}

// Payment succeeded → finalise the reserved orders as PAID (stock already
// decremented at reservation time). Also stamps paidAt (anchors the ship-deadline
// cron), emails the buyer a receipt + the seller a sale notice, and revalidates
// each affected card page so the marketplace hero/price row updates immediately.
async function markPaid(session: Stripe.Checkout.Session) {
  const ids = orderIdsFrom(session);
  if (!ids.length) return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;

  // Read the still-PENDING orders BEFORE updating, so we know exactly which ones
  // this call actually finalised (Stripe may retry the same event).
  const pending = await prisma.order.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    select: {
      id: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      feeCents: true,
      currency: true,
      buyerId: true,
      sellerId: true,
      marketplaceListingId: true,
    },
  });
  if (!pending.length) return;

  const paidAt = new Date();
  await prisma.order.updateMany({
    where: { id: { in: pending.map((o) => o.id) }, status: "PENDING" },
    data: { status: "PAID", reservedUntil: null, stripePaymentIntent: pi, paidAt },
  });
  await importMarketplaceListings().catch(() => {});

  const listingIds = pending.map((o) => o.marketplaceListingId).filter((x): x is string => !!x);
  const listings = listingIds.length
    ? await prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, cardId: true, card: { select: { name: true } } } })
    : [];
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const userIds = Array.from(new Set(pending.flatMap((o) => [o.buyerId, o.sellerId])));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const seenCards = new Set<string>();
  for (const o of pending) {
    const listing = o.marketplaceListingId ? listingById.get(o.marketplaceListingId) : undefined;
    const cardName = listing?.card.name ?? "your card";
    const info = { orderId: o.id, orderNumber: o.orderNumber, cardName, quantity: o.quantity, totalCents: o.totalCents, feeCents: o.feeCents, currency: o.currency };
    const buyerEmail = emailById.get(o.buyerId);
    const sellerEmail = emailById.get(o.sellerId);
    if (buyerEmail) await sendOrderReceiptEmail(buyerEmail, info).catch(() => {});
    if (sellerEmail) await sendSaleNotificationEmail(sellerEmail, info, shipByDate(paidAt)).catch(() => {});
    await notify(o.buyerId, "order_confirmed", "Order confirmed", `${o.quantity} × ${cardName} — the seller has been notified.`, "/marketplace/orders").catch(() => {});
    await notify(o.sellerId, "sale", "You made a sale", `${o.quantity} × ${cardName} sold for ${formatMoney(o.totalCents, o.currency)} — you'll receive ${formatMoney(o.totalCents - o.feeCents, o.currency)} after the marketplace fee.`, "/marketplace/sell").catch(() => {});
    if (listing && !seenCards.has(listing.cardId)) {
      seenCards.add(listing.cardId);
      await revalidateCardPage(listing.cardId).catch(() => {});
    }
  }
}

// Session expired or payment failed → cancel the PENDING orders and restore stock.
async function releaseSession(session: Stripe.Checkout.Session) {
  const ids = orderIdsFrom(session);
  for (const id of ids) {
    await prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({
        where: { id },
        select: { status: true, marketplaceListingId: true, quantity: true },
      });
      if (o?.status !== "PENDING") return;
      await tx.order.update({ where: { id }, data: { status: "CANCELLED", reservedUntil: null } });
      if (o.marketplaceListingId) {
        const l = await tx.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { status: true } });
        if (l) {
          await tx.marketplaceListing.update({
            where: { id: o.marketplaceListingId },
            data: { quantity: { increment: o.quantity }, ...(l.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
          });
        }
      }
    });
  }
  await importMarketplaceListings().catch(() => {});
}

// ── RiftCompare Premium (subscriptions) ────────────────────────────────────────

// First successful premium checkout: link the Stripe customer to the account and
// grant the first period (the period end comes off the subscription itself). For a
// free trial, the card is fingerprinted and checked against past trials FIRST — a
// reused card's trial is cancelled and NO entitlement is granted (entitlement is
// only ever written here, so a blocked abuser never gets a moment of access).
async function premiumStarted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return;
  const isTrial = session.metadata?.trial === "1";
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subId = typeof session.subscription === "string" ? session.subscription : null;

  let until: Date | null = null;
  if (subId) {
    try {
      // Expand the default payment method so we can read the card fingerprint.
      const sub = await stripe().subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
      until = new Date(sub.current_period_end * 1000);

      if (isTrial) {
        const pm = sub.default_payment_method;
        const fingerprint = pm && typeof pm !== "string" ? pm.card?.fingerprint ?? null : null;
        if (fingerprint) {
          const seen = await prisma.trialRedemption.findUnique({ where: { cardFingerprint: fingerprint } });
          if (seen && seen.userId !== userId) {
            // This card already had a free trial (on any account) → refuse this one.
            await stripe().subscriptions.cancel(subId).catch(() => {});
            // Mark the account as having attempted a trial so it can't loop, but grant
            // nothing.
            await prisma.user.update({ where: { id: userId }, data: { trialStartedAt: new Date() } }).catch(() => {});
            return;
          }
          if (!seen) {
            await prisma.trialRedemption.create({ data: { cardFingerprint: fingerprint, userId } }).catch(() => {});
          }
        }
      }
    } catch {
      /* fall through to the grace default */
    }
  }
  // If the subscription read failed: grant a short grace window that the precise
  // period end (invoice.paid / renewal) will correct — PREMIUM_TRIAL_DAYS for a
  // trial, ~a month for a paid start. Was hardcoded to 1 day here, which under-
  // granted once the trial length moved off its original 1-day value.
  if (!until) until = new Date(Date.now() + (isTrial ? PREMIUM_TRIAL_DAYS : 32) * 86400_000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      premiumUntil: until,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(isTrial ? { trialStartedAt: new Date() } : {}),
    },
  }).catch(() => {});
}

// Renewal invoices: resolve the user via subscription metadata (preferred) or the
// stored Stripe customer id, then extend premiumUntil to the new period end.
async function premiumRenewed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subId) return; // not a subscription invoice

  let userId: string | null = null;
  let until: Date | null = null;
  try {
    const sub = await stripe().subscriptions.retrieve(subId);
    userId = (sub.metadata?.userId as string | undefined) ?? null;
    until = new Date(sub.current_period_end * 1000);
  } catch {
    return;
  }
  if (!userId) {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
    if (!customerId) return;
    const u = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    userId = u?.id ?? null;
  }
  if (!userId || !until) return;
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: until } }).catch(() => {});
}
