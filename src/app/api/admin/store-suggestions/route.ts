import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin-only mutations for the store-suggestion review queue. Authorised by either
// a logged-in admin OR the ADMIN_TOKEN (same gate as the admin pages), so it works
// whether you review from an admin session or via the ?key= link.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    if (action === "delete") {
      await prisma.storeSuggestion.delete({ where: { id } });
    } else if (action === "added" || action === "rejected" || action === "pending") {
      await prisma.storeSuggestion.update({ where: { id }, data: { status: action } });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
