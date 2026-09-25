import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";
import { costAfterAdd, QUANTITY_CAP } from "@/lib/collection-cost";

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
            lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
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
  // What the owner paid (cents). Optional — powers the Premium P&L view.
  costBasisCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  // Whether costBasisCents is per copy (false/absent) or this add's whole
  // outlay (true). See lib/collection-cost.ts.
  costBasisIsTotal: z.boolean().optional(),
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

    // ADDING COPIES HAS TO KEEP THE ROW'S COST HONEST (lib/collection-cost.ts,
    // costAfterAdd). A row that records a TOTAL is an outlay for a specific
    // count: bumping the count and leaving the money alone made the new copies
    // free, and the P&L reported a gain nobody made. Every UI add (QuickView,
    // My Collection's search, the welcome checklist) sends no cost at all, so
    // this is the common path, not a rare one. A total the caller does send is
    // summed with what was already paid, never written over it (buying a third
    // copy for $25 must not erase the $40 paid for the first two), and a row
    // whose earlier copies have no recorded cost stays unknown rather than
    // becoming a cost of zero.
    //
    // That needs the row first: one indexed single-row read on the upsert's own
    // unique key, three narrow columns.
    const key = { userId_cardId_condition_isFoil: { userId: user.id, cardId: d.cardId, condition: d.condition, isFoil: d.isFoil } };
    const existing = await prisma.collectionCard.findUnique({
      where: key,
      select: { quantity: true, costBasisCents: true, costBasisIsTotal: true },
    });
    // The 999 cap holds for the row, not just for one add.
    const added = existing ? Math.max(0, Math.min(d.quantity, QUANTITY_CAP - existing.quantity)) : d.quantity;
    const cost = costAfterAdd(existing, { quantity: added, costBasisCents: d.costBasisCents, costBasisIsTotal: d.costBasisIsTotal });

    const item = await prisma.collectionCard.upsert({
      where: key,
      create: {
        userId: user.id, cardId: d.cardId, condition: d.condition, isFoil: d.isFoil,
        quantity: d.quantity, note: d.note ?? null,
        ...cost,
      },
      // `existing` null here means another request created the row between the
      // read and this write: count the copies and leave its cost to that request.
      update: existing
        ? { quantity: existing.quantity + added, ...(d.note ? { note: d.note } : {}), ...cost }
        : { quantity: { increment: d.quantity }, ...(d.note ? { note: d.note } : {}) },
    });
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ error: "Couldn't save that right now — please try again." }, { status: 500 });
  }
}
