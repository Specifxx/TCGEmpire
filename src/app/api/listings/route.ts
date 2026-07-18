import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";
import { cardHref } from "@/lib/card-url";

const schema = z.object({
  cardId: z.string().min(1),
  condition: z.enum(CONDITION_KEYS as [string, ...string[]]),
  isFoil: z.boolean().default(false),
  // Max $100,000/unit. Kept well under the DB Int (32-bit) limit even at qty 99
  // (100_000 × 100 cents × 99 ≈ 9.9e8 < 2.1e9) so totals can never overflow.
  priceCents: z.number().int().min(25, "Minimum price is $0.25").max(10000000, "Maximum price is $100,000"),
  quantity: z.number().int().min(1).max(99).default(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to sell" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const card = await prisma.card.findUnique({ where: { id: parsed.data.cardId } });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const listing = await prisma.listing.create({
    data: {
      cardId: parsed.data.cardId,
      sellerId: user.id,
      condition: parsed.data.condition,
      isFoil: parsed.data.isFoil,
      priceCents: parsed.data.priceCents,
      quantity: parsed.data.quantity,
      status: "ACTIVE",
    },
  });

  // Return the canonical slug href so the client lands on /card/<slug>, not the cuid.
  return NextResponse.json({ ok: true, listingId: listing.id, cardId: card.id, cardHref: cardHref(card) });
}

// Cancel one of your own listings.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  await prisma.listing.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ ok: true });
}
