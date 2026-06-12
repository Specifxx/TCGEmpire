import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSellerRating } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

// GET ?sellerId=… → a seller's rating aggregate + recent reviews (storefront).
export async function GET(req: Request) {
  const sellerId = new URL(req.url).searchParams.get("sellerId");
  if (!sellerId) return NextResponse.json({ error: "sellerId required" }, { status: 400 });
  const [rating, reviews] = await Promise.all([
    getSellerRating(sellerId),
    prisma.marketplaceReview.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { rating: true, comment: true, createdAt: true, buyer: { select: { displayName: true } } },
    }),
  ]);
  return NextResponse.json({ rating, reviews });
}

const schema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(400).optional(),
});

// POST → review a marketplace order you bought, once it's shipped (or completed).
// One review per order, enforced by the DB's unique orderId.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  const { orderId, rating, comment } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, kind: true, status: true, buyerId: true, sellerId: true },
  });
  if (!order || order.kind !== "MARKETPLACE") return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.buyerId !== user.id) return NextResponse.json({ error: "Only the buyer can review" }, { status: 403 });
  if (order.status !== "SHIPPED" && order.status !== "COMPLETED") {
    return NextResponse.json({ error: "You can review once the order has shipped" }, { status: 400 });
  }

  try {
    await prisma.marketplaceReview.create({
      data: { orderId, buyerId: user.id, sellerId: order.sellerId, rating, comment: comment?.trim() || null },
    });
  } catch {
    return NextResponse.json({ error: "You've already reviewed this order" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
