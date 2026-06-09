import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONDITION_KEYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  quantity: z.number().int().min(0).max(999).optional(),
  condition: z.enum(CONDITION_KEYS as [string, ...string[]]).optional(),
  isFoil: z.boolean().optional(),
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
      const merged = await prisma.$transaction([
        prisma.collectionCard.update({
          where: { id: clash.id },
          data: { quantity: clash.quantity + (d.quantity ?? item.quantity), ...(d.note !== undefined ? { note: d.note } : {}) },
        }),
        prisma.collectionCard.delete({ where: { id: item.id } }),
      ]);
      return NextResponse.json({ ok: true, item: merged[0], merged: true });
    }
  }

  const updated = await prisma.collectionCard.update({
    where: { id: item.id },
    data: {
      ...(d.quantity != null ? { quantity: d.quantity } : {}),
      ...(d.condition ? { condition: d.condition } : {}),
      ...(d.isFoil != null ? { isFoil: d.isFoil } : {}),
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
