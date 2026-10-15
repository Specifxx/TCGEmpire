import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin-only: delete a contact message from /admin/messages (owner, 2026-10-15:
// "I need an option to delete contact messages in the inbox"). Same dual gate as
// the other admin mutations (logged-in admin OR ADMIN_TOKEN via the body's key),
// and a 404 rather than a 403 for anyone else, so the route does not advertise
// itself. Mirrors /api/admin/feedback's delete.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (body?.action !== "delete") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  try {
    // deleteMany, not delete: a double click (or two tabs) must not turn the
    // second request into a 500 for a row that is already gone.
    await prisma.contactMessage.deleteMany({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
