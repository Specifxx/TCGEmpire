import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET: the signed-in user's collection ("My Cards"), newest first, with card data.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  try {
    const items = await prisma.collectionCard.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 2000, // egress rule: even power collections stay bounded per request

      include: {
        card: {
          select: {
            id: true, name: true, slug: true, setCode: true, collectorNumber: true,
            imageThumbUrl: true, variant: true, isPromo: true, rarity: true,
            lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
          },
        },
      },
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Couldn't load your collection right now — please try again." }, { status: 500 });
  }
}

const schema = z.object({
  cardId: z.string().min(1),
  condition: z.enum(CONDITION_KEYS as [string, ...string[]]).default("NM"),
  isFoil: z.boolean().default(false),
  quantity: z.number().int().min(1).max(999).default(1),
  // What the owner paid per unit (cents). Optional — powers the Premium P&L view.
  costBasisCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  note: z.string().trim().max(120).optional().nullable(),
});

// POST: add a card to the collection (or increment quantity if the same
// card/condition/foil is already there). Used by the scanner's "add to my cards".
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  try {
    const card = await prisma.card.findUnique({ where: { id: d.cardId }, select: { id: true } });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const item = await prisma.collectionCard.upsert({
      where: { userId_cardId_condition_isFoil: { userId: user.id, cardId: d.cardId, condition: d.condition, isFoil: d.isFoil } },
      create: { userId: user.id, cardId: d.cardId, condition: d.condition, isFoil: d.isFoil, quantity: d.quantity, note: d.note ?? null, costBasisCents: d.costBasisCents ?? null },
      update: { quantity: { increment: d.quantity }, ...(d.note ? { note: d.note } : {}), ...(d.costBasisCents !== undefined ? { costBasisCents: d.costBasisCents } : {}) },
    });
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ error: "Couldn't save that right now — please try again." }, { status: 500 });
  }
}
