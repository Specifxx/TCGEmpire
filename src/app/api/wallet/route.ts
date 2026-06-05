import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  // Amount to add in cents. MVP demo top-up (no real payment).
  amountCents: z.number().int().min(100).max(1000000),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { balanceCents: { increment: parsed.data.amountCents } },
  });
  return NextResponse.json({ ok: true, balanceCents: updated.balanceCents });
}
