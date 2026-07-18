import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/stripe";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { importMarketplaceListings, MARKETPLACE_AUTO_RELEASE_DAYS, MARKETPLACE_SHIP_DEADLINE_DAYS } from "@/lib/marketplace";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { sendFundsReleasedEmail, sendAutoCancelledBuyerEmail, sendAutoCancelledSellerEmail } from "@/lib/marketplace-email";

// Escrow enforcement, run every 6h by .github/workflows/marketplace-maintenance.yml
// (Vercel's Hobby-plan cron only fires once/day, too coarse for a 14-day release
// window measured in hours — GH Actions gives us the finer cadence for free).
//
// Three bounded jobs (see plan D3), each capped at 200 rows/run so a backlog can
// never turn one invocation into an unbounded scan:
//   (a) release abandoned checkout reservations (existing helper)
//   (b) auto-release funds on SHIPPED orders past the buyer-confirm window
//   (c) auto-refund PAID orders the seller never shipped in time
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 200;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releasedReservations = await releaseExpiredReservations().catch(() => 0);
  const autoReleased = await autoReleaseShipped();
  const autoCancelled = await autoCancelUnshipped();

  return NextResponse.json({ ok: true, releasedReservations, autoReleased, autoCancelled });
}

// SHIPPED long enough ago with no open dispute → COMPLETED + funds released. This
// is the real settlement path (a buyer clicking "confirm delivery" is the fast
// path; most orders will actually complete here).
async function autoReleaseShipped(): Promise<number> {
  const cutoff = new Date(Date.now() - MARKETPLACE_AUTO_RELEASE_DAYS * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "SHIPPED", shippedAt: { lt: cutoff }, disputedAt: null },
    select: { id: true, orderNumber: true, quantity: true, totalCents: true, currency: true, sellerId: true, marketplaceListingId: true },
    take: BATCH,
  });

  let n = 0;
  for (const o of orders) {
    try {
      await prisma.order.update({ where: { id: o.id }, data: { status: "COMPLETED", receivedAt: new Date() } });
      await releaseFundsForOrder(o.id);
      n++;

      const seller = await prisma.user.findUnique({ where: { id: o.sellerId }, select: { email: true } });
      const listing = o.marketplaceListingId
        ? await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
        : null;
      if (seller?.email) {
        await sendFundsReleasedEmail(seller.email, {
          orderId: o.id,
          orderNumber: o.orderNumber,
          cardName: listing?.card.name ?? "your order",
          quantity: o.quantity,
          totalCents: o.totalCents,
          currency: o.currency,
        }).catch(() => {});
      }
      if (listing) await revalidateCardPage(listing.cardId).catch(() => {});
    } catch {
      // Skip this order this run; it's picked up again on the next pass.
    }
  }
  return n;
}

// PAID but never shipped within the deadline → full refund + restock. Protects
// buyers from a seller who takes payment and disappears.
async function autoCancelUnshipped(): Promise<number> {
  const cutoff = new Date(Date.now() - MARKETPLACE_SHIP_DEADLINE_DAYS * 86_400_000);
  const orders = await prisma.order.findMany({
    where: { kind: "MARKETPLACE", status: "PAID", paidAt: { lt: cutoff }, shippedAt: null },
    select: {
      id: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      buyerId: true,
      sellerId: true,
      marketplaceListingId: true,
    },
    take: BATCH,
  });

  let n = 0;
  let touchedListings = false;
  for (const o of orders) {
    try {
      await refundOrder(o.id);
      await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
      if (o.marketplaceListingId) {
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { status: true } });
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: o.marketplaceListingId },
            data: { quantity: { increment: o.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
          });
          touchedListings = true;
        }
      }
      n++;

      const [buyer, seller] = await Promise.all([
        prisma.user.findUnique({ where: { id: o.buyerId }, select: { email: true } }),
        prisma.user.findUnique({ where: { id: o.sellerId }, select: { email: true } }),
      ]);
      const listing = o.marketplaceListingId
        ? await prisma.marketplaceListing.findUnique({ where: { id: o.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
        : null;
      const info = { orderId: o.id, orderNumber: o.orderNumber, cardName: listing?.card.name ?? "the item", quantity: o.quantity, totalCents: o.totalCents, currency: o.currency };
      if (buyer?.email) await sendAutoCancelledBuyerEmail(buyer.email, info).catch(() => {});
      if (seller?.email) await sendAutoCancelledSellerEmail(seller.email, info).catch(() => {});
      if (listing) await revalidateCardPage(listing.cardId).catch(() => {});
    } catch {
      // Skip this order this run; it's picked up again on the next pass.
    }
  }
  if (touchedListings) await importMarketplaceListings().catch(() => {});
  return n;
}
