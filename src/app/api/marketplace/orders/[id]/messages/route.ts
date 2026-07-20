import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { sendNewMessageEmail } from "@/lib/marketplace-email";

export const dynamic = "force-dynamic";

// Resolves the full parcel (every Order row sharing the same checkout + seller
// as the given order id) and the deterministic anchor id every message for
// this parcel is stored against — the alphabetically-first sibling order id,
// mirroring the groupKey MarketplaceOrders.tsx and the maintenance cron already
// compute, without needing a dedicated DB column for it.
async function loadParcel(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, kind: true, orderNumber: true, quantity: true, buyerId: true, sellerId: true, stripeSessionId: true, marketplaceListingId: true },
  });
  if (!order || order.kind !== "MARKETPLACE") return null;

  const siblings = await prisma.order.findMany({
    where: order.stripeSessionId
      ? { stripeSessionId: order.stripeSessionId, sellerId: order.sellerId }
      : { id: order.id },
    select: { id: true },
  });
  const anchorId = siblings.map((s) => s.id).sort()[0]!;
  return { order, anchorId };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parcel = await loadParcel(params.id);
  if (!parcel) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const { order, anchorId } = parcel;
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }

  const rows = await prisma.orderMessage.findMany({
    where: { orderId: anchorId },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: { id: true, senderId: true, body: true, createdAt: true },
  });
  // `mine` instead of raw senderId — the client only needs bubble alignment,
  // never the other party's user id.
  const messages = rows.map((m) => ({ id: m.id, mine: m.senderId === user.id, body: m.body, createdAt: m.createdAt }));

  // Mark incoming messages (not sent by me) read now that I've opened the thread.
  await prisma.orderMessage.updateMany({
    where: { orderId: anchorId, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  }).catch(() => {});

  return NextResponse.json({ messages });
}

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`order-message:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const parcel = await loadParcel(params.id);
  if (!parcel) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const { order, anchorId } = parcel;
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }

  const created = await prisma.orderMessage.create({
    data: { orderId: anchorId, senderId: user.id, body: parsed.data.body },
    select: { id: true, body: true, createdAt: true },
  });
  const message = { ...created, mine: true };

  const recipientId = order.buyerId === user.id ? order.sellerId : order.buyerId;
  const [recipient, listing] = await Promise.all([
    prisma.user.findUnique({ where: { id: recipientId }, select: { email: true } }),
    order.marketplaceListingId
      ? prisma.marketplaceListing.findUnique({ where: { id: order.marketplaceListingId }, select: { card: { select: { name: true } } } })
      : null,
  ]);
  const cardName = listing?.card.name ?? "your order";
  const preview = parsed.data.body.length > 80 ? `${parsed.data.body.slice(0, 80)}…` : parsed.data.body;

  await notify(recipientId, "new_message", `New message from ${user.displayName}`, preview, "/marketplace/orders").catch(() => {});
  if (recipient?.email) {
    await sendNewMessageEmail(
      recipient.email,
      { orderId: order.id, orderNumber: order.orderNumber, cardName, quantity: order.quantity, totalCents: 0, currency: "AUD" },
      user.displayName,
      parsed.data.body
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, message });
}
