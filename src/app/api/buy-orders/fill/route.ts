import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  buyOrderId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

// A seller fills (sells into) an open buy order. Escrowed funds are released to
// the seller and a BUYORDER trade is recorded.
export async function POST(req: Request) {
  const seller = await getCurrentUser();
  if (!seller) {
    return NextResponse.json({ error: "Please sign in to sell" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { buyOrderId, quantity } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.buyOrder.findUnique({ where: { id: buyOrderId } });
      if (!order || order.status !== "OPEN") {
        throw new Error("This buy order is no longer open");
      }
      if (order.buyerId === seller.id) {
        throw new Error("You can't fill your own buy order");
      }
      const remaining = order.quantity - order.quantityFilled;
      if (quantity > remaining) {
        throw new Error("Not enough copies remaining on this buy order");
      }

      const payout = order.maxPriceCents * quantity;

      // Release escrow to the seller.
      await tx.user.update({
        where: { id: seller.id },
        data: { balanceCents: { increment: payout } },
      });

      const filled = order.quantityFilled + quantity;
      await tx.buyOrder.update({
        where: { id: order.id },
        data: {
          quantityFilled: filled,
          reservedCents: { decrement: payout },
          status: filled >= order.quantity ? "FILLED" : "OPEN",
        },
      });

      const trade = await tx.order.create({
        data: {
          kind: "BUYORDER",
          buyOrderId: order.id,
          buyerId: order.buyerId,
          sellerId: seller.id,
          quantity,
          totalCents: payout,
        },
      });
      return { trade, payout };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not fill buy order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
