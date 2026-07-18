import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";

const schema = z.object({
  cardId: z.string().min(1),
  condition: z.enum(["ANY", ...CONDITION_KEYS] as [string, ...string[]]),
  isFoil: z.boolean().default(false),
  // Max $100,000/unit — keeps the escrowed total (× qty 99) under the DB Int limit.
  maxPriceCents: z.number().int().min(25, "Minimum bid is $0.25").max(10000000, "Maximum bid is $100,000"),
  quantity: z.number().int().min(1).max(99).default(1),
});

// Create a buy order (bid). Funds are escrowed from the buyer's wallet up front.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to place a buy order" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { cardId, condition, isFoil, maxPriceCents, quantity } = parsed.data;
  const total = maxPriceCents * quantity;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.card.findUnique({ where: { id: cardId } });
      if (!card) throw new Error("Card not found");

      const buyer = await tx.user.findUnique({ where: { id: user.id } });
      if (!buyer || buyer.balanceCents < total) {
        throw new Error("Insufficient wallet balance to escrow this bid");
      }

      await tx.user.update({
        where: { id: buyer.id },
        data: { balanceCents: { decrement: total } },
      });

      const order = await tx.buyOrder.create({
        data: {
          cardId,
          buyerId: buyer.id,
          condition,
          isFoil,
          maxPriceCents,
          quantity,
          reservedCents: total,
          status: "OPEN",
        },
      });
      return { order, newBalance: buyer.balanceCents - total };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not place buy order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Cancel one of your own open buy orders and refund the escrowed balance.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.buyOrder.findUnique({ where: { id } });
      if (!order || order.buyerId !== user.id) throw new Error("Buy order not found");
      if (order.status !== "OPEN") throw new Error("Buy order is not open");

      if (order.reservedCents > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { balanceCents: { increment: order.reservedCents } },
        });
      }
      await tx.buyOrder.update({
        where: { id },
        data: { status: "CANCELLED", reservedCents: 0 },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not cancel";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
