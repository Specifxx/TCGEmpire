import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to buy" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { listingId, quantity } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (!listing || listing.status !== "ACTIVE" || listing.quantity < quantity) {
        throw new Error("This listing is no longer available");
      }
      if (listing.sellerId === user.id) {
        throw new Error("You can't buy your own listing");
      }
      const total = listing.priceCents * quantity;

      const buyer = await tx.user.findUnique({ where: { id: user.id } });
      if (!buyer || buyer.balanceCents < total) {
        throw new Error("Insufficient wallet balance — top up to continue");
      }

      await tx.user.update({
        where: { id: buyer.id },
        data: { balanceCents: { decrement: total } },
      });
      await tx.user.update({
        where: { id: listing.sellerId },
        data: { balanceCents: { increment: total } },
      });

      const remaining = listing.quantity - quantity;
      await tx.listing.update({
        where: { id: listing.id },
        data: {
          quantity: remaining,
          status: remaining <= 0 ? "SOLD" : "ACTIVE",
        },
      });

      const order = await tx.order.create({
        data: {
          listingId: listing.id,
          buyerId: buyer.id,
          sellerId: listing.sellerId,
          quantity,
          totalCents: total,
        },
      });

      return { order, newBalance: buyer.balanceCents - total };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
