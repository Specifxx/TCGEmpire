import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// The signed-in user's saved wishlist (card ids). Logged-out users use the cookie
// wishlist only, so this returns an empty list for them.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ids: [] });
  const rows = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { cardId: true },
  });
  return NextResponse.json({ ids: rows.map((r) => r.cardId) });
}

const putSchema = z.object({ ids: z.array(z.string()).max(5000) });

// Replace the user's saved wishlist with the given ids (the merged set the client
// computes on sign-in + after every change).
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const ids = Array.from(new Set(parsed.data.ids));
  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { userId: user.id } }),
    ...(ids.length
      ? [prisma.wishlistItem.createMany({ data: ids.map((cardId) => ({ userId: user.id, cardId })), skipDuplicates: true })]
      : []),
  ]);
  return NextResponse.json({ ok: true, count: ids.length });
}
