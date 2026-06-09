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
        await markPaid(session);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await releaseSession(session);
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
