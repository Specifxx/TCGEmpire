import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const schema = z.object({
  id: z.string().min(1),
  status: z.enum(STATUSES).optional(),
  adminNote: z.string().max(4000).optional(),
});

// Admin-only ticket triage: change status / leave an internal note. The read side
// (listing tickets) lives directly in app/admin/support/page.tsx — this route is
// just the write side, so it requires a real admin session (no ?key= bypass here,
// unlike the read-only /admin/messages pattern).
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, status, adminNote } = parsed.data;

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: { ...(status ? { status } : {}), ...(adminNote !== undefined ? { adminNote } : {}) },
  });
  return NextResponse.json({ ok: true, ticket });
}
