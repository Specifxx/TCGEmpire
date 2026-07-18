import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CARRIERS } from "@/lib/tracking";
import { releaseFundsForOrder, refundOrder } from "@/lib/connect";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { importMarketplaceListings } from "@/lib/marketplace";
import {
  sendShippedEmail,
  sendFundsReleasedEmail,
  sendReleaseRequestedEmail,
  sendCancelRequestedEmail,
  sendCancelledMutualEmail,
  sendCancelDeclinedEmail,
} from "@/lib/marketplace-email";
import { nextNumber, formatOrderNumber } from "@/lib/order-number";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["ship", "receive", "report", "request-release", "request-cancel", "accept-cancel", "decline-cancel", "withdraw-cancel"]),
  // ship
  carrier: z.enum(CARRIERS).optional(),
  trackingNumber: z.string().trim().min(3).max(60).optional(),
  // legacy free-text, kept for backward compatibility with any in-flight clients
  tracking: z.string().max(120).optional(),
  // report
  message: z.string().trim().min(10).max(2000).optional(),
  // request-cancel
  reason: z.string().trim().min(5).max(300).optional(),
});

// Fulfilment state machine for a marketplace order:
//   PAID --(seller: ship, carrier + tracking number required)--> SHIPPED
//   SHIPPED --(BUYER ONLY: receive)--> COMPLETED, funds released
//   SHIPPED --(seller: request-release)--> pings admins to check tracking sooner;
//     does NOT release anything itself — a seller confirming their own delivery
//     is a conflict of interest, so release only ever comes from the buyer, an
//     admin (see api/admin/marketplace), or the auto-release cron's rolling
//     14-day timeout.
//   PAID/SHIPPED --(either party: request-cancel)--> pending; the OTHER party
//     must accept-cancel (→ CANCELLED + full refund + restock) or decline-cancel
//     (→ back to normal). No admin gate here: both sides consenting removes the
//     conflict-of-interest concern that gates delivery confirmation.
//   any --(buyer or seller: report)--> opens a support ticket + disputedAt, blocking auto-release
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`order-action:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action, carrier, trackingNumber, tracking, message, reason } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      kind: true,
      status: true,
      buyerId: true,
      sellerId: true,
      orderNumber: true,
      quantity: true,
      totalCents: true,
      currency: true,
      marketplaceListingId: true,
      releaseRequestedAt: true,
      cancelRequestedBy: true,
      cancelRequestedAt: true,
    },
  });
  if (!order || order.kind !== "MARKETPLACE") return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isParty = order.buyerId === user.id || order.sellerId === user.id;

  if (action === "ship") {
    if (order.sellerId !== user.id) return NextResponse.json({ error: "Only the seller can mark shipped" }, { status: 403 });
    if (order.status !== "PAID") return NextResponse.json({ error: `Can't ship a ${order.status} order` }, { status: 400 });
    if (order.cancelRequestedAt) return NextResponse.json({ error: "A cancellation is pending on this order — resolve it first" }, { status: 400 });
    if (!carrier || !trackingNumber) {
      return NextResponse.json({ error: "Carrier and tracking number are required" }, { status: 400 });
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "SHIPPED", shippedAt: new Date(), carrier, trackingNumber, trackingNote: tracking?.trim() || null },
    });

    const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } });
    const listing = order.marketplaceListingId
      ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : null;
    if (buyer?.email) {
      await sendShippedEmail(
        buyer.email,
        { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "your order", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency },
        carrier,
        trackingNumber
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true, status: "SHIPPED" });
  }

  if (action === "report") {
    if (!isParty) return NextResponse.json({ error: "Only the buyer or seller can report this order" }, { status: 403 });
    if (!message) return NextResponse.json({ error: "Please describe the problem" }, { status: 400 });
    const number = await nextNumber("support");
    await prisma.$transaction([
      prisma.supportTicket.create({
        data: {
          number,
          userId: user.id,
          email: user.email,
          name: user.displayName,
          category: "ORDER",
          orderId: order.id,
          subject: `Problem with order ${formatOrderNumber(order.orderNumber) ?? order.id}`,
          message,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { disputedAt: new Date() } }),
    ]);
    return NextResponse.json({ ok: true, ticket: formatOrderNumber(number) });
  }

  if (action === "request-release") {
    if (order.sellerId !== user.id) return NextResponse.json({ error: "Only the seller can request a release" }, { status: 403 });
    if (order.status !== "SHIPPED") return NextResponse.json({ error: "This order hasn't shipped yet" }, { status: 400 });
    if (order.cancelRequestedAt) return NextResponse.json({ error: "A cancellation is pending on this order" }, { status: 400 });
    if (order.releaseRequestedAt) return NextResponse.json({ ok: true, alreadyRequested: true });

    await prisma.order.update({ where: { id: order.id }, data: { releaseRequestedAt: new Date() } });
    const listing = order.marketplaceListingId
      ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : null;
    await sendReleaseRequestedEmail({
      orderId: order.id,
      orderNumber: order.orderNumber,
      cardName: listing?.card.name ?? "the item",
      quantity: order.quantity,
      totalCents: order.totalCents,
      currency: order.currency,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // ── Mutual-agreement cancellation ──────────────────────────────────────────
  if (action === "request-cancel") {
    if (!isParty) return NextResponse.json({ error: "Only the buyer or seller can request a cancellation" }, { status: 403 });
    if (order.status !== "PAID" && order.status !== "SHIPPED") {
      return NextResponse.json({ error: `Can't cancel a ${order.status} order` }, { status: 400 });
    }
    if (order.cancelRequestedAt) return NextResponse.json({ error: "A cancellation is already pending" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Please give a short reason" }, { status: 400 });

    await prisma.order.update({
      where: { id: order.id },
      data: { cancelRequestedBy: user.id, cancelRequestedAt: new Date(), cancelReason: reason },
    });

    const otherId = user.id === order.buyerId ? order.sellerId : order.buyerId;
    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { email: true } });
    const listing = order.marketplaceListingId
      ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : null;
    if (other?.email) {
      await sendCancelRequestedEmail(
        other.email,
        { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "the item", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency },
        user.displayName,
        reason
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "withdraw-cancel") {
    if (order.cancelRequestedBy !== user.id) return NextResponse.json({ error: "Only whoever requested it can withdraw" }, { status: 403 });
    if (!order.cancelRequestedAt) return NextResponse.json({ error: "No pending cancellation" }, { status: 400 });
    await prisma.order.update({ where: { id: order.id }, data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline-cancel" || action === "accept-cancel") {
    if (!order.cancelRequestedAt || !order.cancelRequestedBy) return NextResponse.json({ error: "No pending cancellation" }, { status: 400 });
    if (order.cancelRequestedBy === user.id) return NextResponse.json({ error: "Wait for the other party to respond" }, { status: 403 });
    if (!isParty) return NextResponse.json({ error: "Only the buyer or seller can respond" }, { status: 403 });

    const listing = order.marketplaceListingId
      ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { id: true, cardId: true, status: true, card: { select: { name: true } } } })
      : null;
    const info = { orderId: order.id, orderNumber: order.orderNumber, cardName: listing?.card.name ?? "the item", quantity: order.quantity, totalCents: order.totalCents, currency: order.currency };

    if (action === "decline-cancel") {
      await prisma.order.update({ where: { id: order.id }, data: { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null } });
      const requester = await prisma.user.findUnique({ where: { id: order.cancelRequestedBy }, select: { email: true } });
      if (requester?.email) await sendCancelDeclinedEmail(requester.email, info).catch(() => {});
      return NextResponse.json({ ok: true, status: "declined" });
    }

    // accept-cancel — full refund + restock, no partial/manual amount involved.
    await refundOrder(order.id);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    if (listing) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { quantity: { increment: order.quantity }, ...(listing.status === "SOLD_OUT" ? { status: "ACTIVE" } : {}) },
      });
      await importMarketplaceListings().catch(() => {});
      await revalidateCardPage(listing.cardId).catch(() => {});
    }
    const [buyer, seller] = await Promise.all([
      prisma.user.findUnique({ where: { id: order.buyerId }, select: { email: true } }),
      prisma.user.findUnique({ where: { id: order.sellerId }, select: { email: true } }),
    ]);
    if (buyer?.email) await sendCancelledMutualEmail(buyer.email, info).catch(() => {});
    if (seller?.email) await sendCancelledMutualEmail(seller.email, info).catch(() => {});
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }

  // receive — BUYER ONLY. A seller confirming their own delivery is exactly the
  // conflict of interest this whole flow exists to avoid.
  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "Only the buyer can confirm delivery" }, { status: 403 });
  }
  if (order.status !== "SHIPPED") return NextResponse.json({ error: "This order hasn't been shipped yet" }, { status: 400 });
  if (order.cancelRequestedAt) return NextResponse.json({ error: "A cancellation is pending on this order — resolve it first" }, { status: 400 });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "COMPLETED", receivedAt: new Date(), releasedBy: "BUYER" },
  });

  await releaseFundsForOrder(order.id).catch(() => {});

  const seller = await prisma.user.findUnique({ where: { id: order.sellerId }, select: { email: true } });
  const listing = order.marketplaceListingId
    ? await prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { cardId: true, card: { select: { name: true } } } })
    : null;
  if (seller?.email) {
    await sendFundsReleasedEmail(seller.email, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      cardName: listing?.card.name ?? "your order",
      quantity: order.quantity,
      totalCents: order.totalCents,
      currency: order.currency,
    }).catch(() => {});
  }
  if (listing) await revalidateCardPage(listing.cardId).catch(() => {});

  return NextResponse.json({ ok: true, status: "COMPLETED" });
}
