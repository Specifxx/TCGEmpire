import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { importMarketplaceListings } from "@/lib/marketplace";
import { notify } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { formatOrderNumber } from "@/lib/order-number";
import {
  sendOrderCompletedBuyerEmail,
  sendFundsReleasedEmail,
  sendSellerRefundedEmail,
  sendSellerRefundConfirmedEmail,
  type OrderEmailInfo,
} from "@/lib/marketplace-email";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum([
    "force-release",
    "force-refund",
    "clear-dispute",
    "mark-reviewed",
    "flag-dispute",
    "suspend-seller",
    "unsuspend-seller",
    "delist-listing",
  ]),
  orderId: z.string().optional(),
  userId: z.string().optional(),
  listingId: z.string().optional(),
});

// Trust & safety tools for admins only — resolving a disputed order (force the
// payout through or refund the buyer), reviewing a SHIPPED order's tracking
// before release, suspending a bad-actor seller, or pulling a single listing.
// force-release/mark-reviewed are THE release gate now: a buyer confirming
// delivery is the only other trigger, and a seller can no longer self-confirm
// their own delivery (see orders/[id]/route.ts) — see the auto-release cron for
// the rolling-window timeout that backstops this when nobody's looked.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, orderId, userId, listingId } = parsed.data;

  switch (action) {
    case "force-release": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      const before = await loadOrderForEmail(orderId);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          receivedAt: new Date(),
          disputedAt: null,
          releasedBy: "ADMIN",
          adminReviewedAt: new Date(),
          adminReviewedBy: user.email,
        },
      });
      await releaseFundsForOrder(orderId);
      // Every other release path (buyer confirms, the 14-day auto-release) tells
      // both sides their money moved — an admin override used to leave both of
      // them finding out only if they happened to check My orders.
      if (before) {
        if (before.buyerEmail) await sendOrderCompletedBuyerEmail(before.buyerEmail, before.info, { releasedBy: "admin" }).catch(() => {});
        if (before.sellerEmail) await sendFundsReleasedEmail(before.sellerEmail, before.info).catch(() => {});
        await notify(before.buyerId, "order_completed", "Order complete", `Order for ${before.info.cardName} was marked complete by our team after review.`, "/marketplace/orders").catch(() => {});
        await notify(before.sellerId, "funds_released", "Funds released", `${formatMoney(before.info.totalCents - (before.info.feeCents ?? 0), before.info.currency)} sent for ${before.info.cardName} (order ${formatOrderNumber(before.info.orderNumber) ?? before.info.orderId}).`, "/marketplace/orders?tab=Sales").catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
    // "I checked tracking — not clearly delivered yet, keep waiting." Doesn't
    // release or dispute anything; just stamps the audit trail and resets the
    // auto-release cron's rolling window so the order isn't force-completed out
    // from under an admin who's actively watching it.
    case "mark-reviewed": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      await prisma.order.update({ where: { id: orderId }, data: { adminReviewedAt: new Date(), adminReviewedBy: user.email } });
      return NextResponse.json({ ok: true });
    }
    // An admin spotting a problem directly (vs. a buyer/seller filing a report) —
    // blocks auto-release the same way a support-ticket dispute does. Notified
    // in-app only (no email), matching reportOrderGroup's own restraint for the
    // buyer/seller-filed version of this same event.
    case "flag-dispute": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, sellerId: true, orderNumber: true } });
      await prisma.order.update({
        where: { id: orderId },
        data: { disputedAt: new Date(), adminReviewedAt: new Date(), adminReviewedBy: user.email },
      });
      if (order) {
        const msg = `Order ${formatOrderNumber(order.orderNumber) ?? orderId} has been flagged for review — it's paused until our team resolves it.`;
        await notify(order.buyerId, "order_disputed", "A problem was flagged", msg, "/marketplace/orders").catch(() => {});
        await notify(order.sellerId, "order_disputed", "A problem was flagged", msg, "/marketplace/orders?tab=Sales").catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
    case "force-refund": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      const before = await loadOrderForEmail(orderId);
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { marketplaceListingId: true, quantity: true } });
      await refundOrder(orderId);
      await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", disputedAt: null } });
      if (order?.marketplaceListingId) {
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { status: true, cardId: true } });
        if (listing) {
          await prisma.marketplaceListing.update({
            where: { id: order.marketplaceListingId },
            data: { quantity: { increment: order.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
          });
          await importMarketplaceListings().catch(() => {});
          await revalidateCardPage(listing.cardId).catch(() => {});
        }
      }
      // Same reasoning as force-release above — sellerRefundOrder already emails
      // both sides for a seller-initiated refund; this admin path (triggered by
      // a dispute) previously emailed neither.
      if (before) {
        if (before.buyerEmail) await sendSellerRefundedEmail(before.buyerEmail, before.info, null, "admin").catch(() => {});
        if (before.sellerEmail) await sendSellerRefundConfirmedEmail(before.sellerEmail, before.info, false, "admin").catch(() => {});
        await notify(before.buyerId, "order_refunded", "Order refunded", `Our team refunded ${formatMoney(before.info.totalCents, before.info.currency)} for ${before.info.cardName}.`, "/marketplace/orders").catch(() => {});
        await notify(before.sellerId, "order_refunded", "Order refunded", `Order ${formatOrderNumber(before.info.orderNumber) ?? before.info.orderId} was refunded by our team after review.`, "/marketplace/orders?tab=Sales").catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
    case "clear-dispute": {
      if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, sellerId: true, orderNumber: true } });
      await prisma.order.update({ where: { id: orderId }, data: { disputedAt: null, adminReviewedAt: new Date(), adminReviewedBy: user.email } });
      if (order) {
        const msg = `The review is done — order ${formatOrderNumber(order.orderNumber) ?? orderId} is unpaused and continues as normal.`;
        await notify(order.buyerId, "order_disputed", "Review resolved", msg, "/marketplace/orders").catch(() => {});
        await notify(order.sellerId, "order_disputed", "Review resolved", msg, "/marketplace/orders?tab=Sales").catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
    case "suspend-seller": {
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      await prisma.sellerProfile.update({ where: { userId }, data: { suspendedAt: new Date() } });
      await prisma.marketplaceListing.updateMany({ where: { sellerId: userId, status: "ACTIVE" }, data: { status: "PAUSED" } });
      await importMarketplaceListings().catch(() => {});
      return NextResponse.json({ ok: true });
    }
    case "unsuspend-seller": {
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      await prisma.sellerProfile.update({ where: { userId }, data: { suspendedAt: null } });
      return NextResponse.json({ ok: true });
    }
    case "delist-listing": {
      if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });
      const listing = await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
      await importMarketplaceListings().catch(() => {});
      await revalidateCardPage(listing.cardId).catch(() => {});
      return NextResponse.json({ ok: true });
    }
  }
}

// Snapshot of an order's identity + both parties' emails, taken BEFORE the
// status-changing update, so force-release/force-refund can tell both sides
// what happened — every other path that completes/refunds an order already
// does this (receiveOrder, autoReleaseShipped, sellerRefundOrder); these two
// admin actions previously didn't, leaving both parties to find out only if
// they happened to check My orders.
async function loadOrderForEmail(orderId: string): Promise<{
  buyerId: string;
  sellerId: string;
  buyerEmail: string | null;
  sellerEmail: string | null;
  info: OrderEmailInfo;
} | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
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
  if (!order) return null;
  const [buyer, seller, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: order.sellerId }, select: { email: true } }),
    order.marketplaceListingId
      ? prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : Promise.resolve(null),
  ]);
  return {
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    buyerEmail: buyer?.email ?? null,
    sellerEmail: seller?.email ?? null,
    info: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      cardName: listing?.card.name ?? "your order",
      quantity: order.quantity,
      totalCents: order.totalCents,
      feeCents: order.feeCents,
      currency: order.currency,
    },
  };
}
