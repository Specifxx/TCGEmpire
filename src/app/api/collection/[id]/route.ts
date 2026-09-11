import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";
import { costAfterQuantityChange, investedCents } from "@/lib/collection-cost";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  quantity: z.number().int().min(0).max(999).optional(),
  condition: z.enum(CONDITION_KEYS as [string, ...string[]]).optional(),
  isFoil: z.boolean().optional(),
  costBasisCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  // Whether costBasisCents is the price of ONE copy (false/absent) or the whole
  // row's outlay (true). See lib/collection-cost.ts.
  costBasisIsTotal: z.boolean().optional(),
  note: z.string().trim().max(120).optional().nullable(),
});

async function own(userId: string, id: string) {
  const item = await prisma.collectionCard.findUnique({ where: { id } });
  return item && item.userId === userId ? item : null;
}

// PATCH: edit a collection entry (qty/condition/foil/note). Quantity 0 deletes it.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const item = await own(user.id, params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  if (d.quantity === 0) {
    await prisma.collectionCard.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Changing condition/foil could collide with an existing (user,card,cond,foil)
  // row; merge into it rather than violating the unique key.
  const nextCondition = d.condition ?? item.condition;
  const nextFoil = d.isFoil ?? item.isFoil;
  if (nextCondition !== item.condition || nextFoil !== item.isFoil) {
    const clash = await prisma.collectionCard.findUnique({
      where: { userId_cardId_condition_isFoil: { userId: user.id, cardId: item.cardId, condition: nextCondition, isFoil: nextFoil } },
    });
    if (clash && clash.id !== item.id) {
      // Merging two rows merges what was PAID for them. The surviving row's cost
      // is otherwise kept as-is while it absorbs the other's copies, which reads
      // as "these extra cards were free". Both outlays are known → record their
      // sum as a total (see lib/collection-cost.ts). If either side has no cost
      // recorded, there is no honest sum to write, so the survivor keeps its own
      // figure rather than inventing one.
      const movedQty = d.quantity ?? item.quantity;
      const clashPaid = investedCents(clash);
      const itemPaid = investedCents({ ...item, quantity: movedQty });
      const mergedCost =
        clashPaid != null && itemPaid != null
          ? { costBasisCents: clashPaid + itemPaid, costBasisIsTotal: true }
          : {};
      const merged = await prisma.$transaction([
        prisma.collectionCard.update({
          where: { id: clash.id },
          data: { quantity: clash.quantity + movedQty, ...mergedCost, ...(d.note !== undefined ? { note: d.note } : {}) },
        }),
        prisma.collectionCard.delete({ where: { id: item.id } }),
      ]);
      return NextResponse.json({ ok: true, item: merged[0], merged: true });
    }
  }

  // A quantity change has to carry a TOTAL cost basis with it. Per-unit is
  // unaffected (one copy still cost what it cost), but a total is an outlay for a
  // specific number of copies — leave it alone while the count grows and the
  // portfolio reports the same money spent on more cards. Only when the caller
  // isn't setting the cost itself in this same request; an explicit value wins.
  const rescaled =
    d.costBasisCents === undefined && d.quantity != null && d.quantity !== item.quantity
      ? costAfterQuantityChange(item, d.quantity)
      : undefined;

  const updated = await prisma.collectionCard.update({
    where: { id: item.id },
    data: {
      ...(d.quantity != null ? { quantity: d.quantity } : {}),
      ...(d.condition ? { condition: d.condition } : {}),
      ...(d.isFoil != null ? { isFoil: d.isFoil } : {}),
      ...(d.costBasisCents !== undefined ? { costBasisCents: d.costBasisCents } : {}),
      ...(d.costBasisIsTotal !== undefined ? { costBasisIsTotal: d.costBasisIsTotal } : {}),
      ...(rescaled !== undefined && rescaled !== null ? { costBasisCents: rescaled } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    },
  });
  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const item = await own(user.id, params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.collectionCard.delete({ where: { id: item.id } });
  return NextResponse.json({ ok: true });
}
