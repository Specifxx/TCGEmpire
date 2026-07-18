import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CARRIERS } from "@/lib/tracking";
import { releaseFundsForOrder } from "@/lib/connect";
import { revalidateCardPage } from "@/lib/revalidate-card";
import { sendShippedEmail, sendFundsReleasedEmail } from "@/lib/marketplace-email";
import { nextNumber, formatOrderNumber } from "@/lib/order-number";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["ship", "receive", "report"]),
  // ship
  carrier: z.enum(CARRIERS).optional(),
  trackingNumber: z.string().trim().min(3).max(60).optional(),
  // legacy free-text, kept for backward compatibility with any in-flight clients
  tracking: z.string().max(120).optional(),
  // report
  message: z.string().trim().min(10).max(2000).optional(),
});

// Fulfilment state machine for a marketplace order:
//   PAID --(seller: ship, carrier + tracking number required)--> SHIPPED
//   SHIPPED --(buyer, or seller confirming via tracking: receive)--> COMPLETED, funds released
//   any --(buyer or seller: report)--> opens a support ticket + disputedAt, blocking auto-release
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`order-action:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action, carrier, trackingNumber, tracking, message } = parsed.data;

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
    },
  });
  if (!order || order.kind !== "MARKETPLACE") return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "ship") {
    if (order.sellerId !== user.id) return NextResponse.json({ error: "Only the seller can mark shipped" }, { status: 403 });
    if (order.status !== "PAID") return NextResponse.json({ error: `Can't ship a ${order.status} order` }, { status: 400 });
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
    if (order.buyerId !== user.id && order.sellerId !== user.id) {
      return NextResponse.json({ error: "Only the buyer or seller can report this order" }, { status: 403 });
    }
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

  // receive — the buyer confirming, or the seller closing it out themselves once
  // tracking shows delivery (so payout isn't stuck waiting on the buyer).
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "Only the buyer or seller can confirm delivery" }, { status: 403 });
  }
  if (order.status !== "SHIPPED") return NextResponse.json({ error: "This order hasn't been shipped yet" }, { status: 400 });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "COMPLETED", receivedAt: new Date() },
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
