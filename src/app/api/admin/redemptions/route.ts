import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin queue for personalised "experience" redemptions (deck reviews, shout-outs,
// …) that a human fulfils. Cosmetics/perks are auto-fulfilled and don't appear here.
async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.redemption.findMany({
    where: { kind: "experience" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { user: { select: { email: true, displayName: true } } },
  });
  return NextResponse.json({
    redemptions: rows.map((r) => ({
      id: r.id,
      rewardName: r.rewardName,
      cost: r.cost,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      email: r.user.email,
      displayName: r.user.displayName,
    })),
  });
}

const schema = z.object({ id: z.string().min(1), status: z.enum(["PENDING", "DONE"]) });

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await prisma.redemption.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
