import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

// Mark one notification read (id) or the whole feed read (all) — scoped to the
// signed-in user's own rows either way (updateMany's where always includes
// userId, so there's no way to touch another user's notification by id).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(parsed.data.id ? { id: parsed.data.id } : {}) },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
