import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { importMarketplaceListings } from "@/lib/marketplace";

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
// decremented at reservation time).
async function markPaid(session: Stripe.Checkout.Session) {
  const ids = orderIdsFrom(session);
  if (!ids.length) return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
  await prisma.order.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "PAID", reservedUntil: null, stripePaymentIntent: pi },
  });
  await importMarketplaceListings().catch(() => {});
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
// grant the first period (the period end comes off the subscription itself).
async function premiumStarted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subId = typeof session.subscription === "string" ? session.subscription : null;

  let until: Date | null = null;
  if (subId) {
    try {
      const sub = await stripe().subscriptions.retrieve(subId);
      until = new Date(sub.current_period_end * 1000);
    } catch {
      /* fall through to the grace default */
    }
  }
  // Even if the subscription read fails, grant ~a month — the invoice.paid event
  // (and the next renewal) will re-stamp the precise period end.
  if (!until) until = new Date(Date.now() + 32 * 86400_000);

  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: until, ...(customerId ? { stripeCustomerId: customerId } : {}) },
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
