import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["ship", "receive"]),
  tracking: z.string().max(120).optional(),
});

// Fulfilment state machine for a marketplace order:
//   PAID --(seller: ship, optional tracking note)--> SHIPPED
//   SHIPPED --(buyer, or seller confirming via tracking: receive)--> COMPLETED
// Funds are held (in the seller's own Stripe balance — payout schedule set to
// Manual) until COMPLETED, so the seller can also close out an order themselves
// once tracking shows it delivered, without waiting on the buyer to click confirm.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action, tracking } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, status: true, buyerId: true, sellerId: true },
  });
  if (!order || order.kind !== "MARKETPLACE") return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "ship") {
    if (order.sellerId !== user.id) return NextResponse.json({ error: "Only the seller can mark shipped" }, { status: 403 });
    if (order.status !== "PAID") return NextResponse.json({ error: `Can't ship a ${order.status} order` }, { status: 400 });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "SHIPPED", shippedAt: new Date(), trackingNote: tracking?.trim() || null },
    });
    return NextResponse.json({ ok: true, status: "SHIPPED" });
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
  return NextResponse.json({ ok: true, status: "COMPLETED" });
}
