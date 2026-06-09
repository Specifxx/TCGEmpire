// Stripe (plain Checkout) — foundations for the single-seller marketplace.
//
// Because you (Specifix) are the only seller, we DON'T need Stripe Connect: money
// from a marketplace sale goes straight to your Stripe account. We just create a
// hosted Checkout Session, redirect the buyer, and confirm payment via webhook.
//
// Stock is reserved Skinport-style: at checkout we decrement availability and open
// a PENDING order with a short reservation window. The webhook flips it to PAID on
// success; expiry/failure releases the stock back.
//
// INERT until STRIPE_SECRET_KEY is set — callers check `stripeEnabled()` and fall
// back to the existing demo-wallet checkout.
import Stripe from "stripe";
import { prisma } from "./db";

const SECRET = process.env.STRIPE_SECRET_KEY ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// How long a checkout holds the buyer's stock before it's released (minutes).
export const RESERVATION_MINUTES = Number(process.env.MARKETPLACE_RESERVE_MINUTES ?? 20);

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!SECRET) throw new Error("Stripe is not configured");
  if (!_stripe) _stripe = new Stripe(SECRET, { apiVersion: "2025-02-24.acacia" });
  return _stripe;
}

export function stripeEnabled(): boolean {
  return Boolean(SECRET);
}

// Release any PENDING marketplace reservations whose hold has expired: restore the
// listing's stock and mark the orders CANCELLED. Cheap to call opportunistically
// (e.g. before a new checkout) so abandoned carts free their stock without a cron.
export async function releaseExpiredReservations(): Promise<number> {
  const expired = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "PENDING", reservedUntil: { lt: new Date() } },
    select: { id: true, marketplaceListingId: true, quantity: true },
  });
  if (!expired.length) return 0;

  for (const o of expired) {
    await prisma.$transaction(async (tx) => {
      // Re-check it's still pending inside the txn to avoid racing the webhook.
      const fresh = await tx.order.findUnique({ where: { id: o.id }, select: { status: true } });
      if (fresh?.status !== "PENDING") return;
      await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
      if (o.marketplaceListingId) {
        const listing = await tx.marketplaceListing.findUnique({
          where: { id: o.marketplaceListingId },
          select: { quantity: true, status: true },
        });
        if (listing) {
          await tx.marketplaceListing.update({
            where: { id: o.marketplaceListingId },
            data: {
              quantity: { increment: o.quantity },
              // Re-activate a listing that had sold out while reserved.
              ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}),
            },
          });
        }
      }
    }).catch(() => {});
  }
  return expired.length;
}
