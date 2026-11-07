import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { adminSetFeature } from "@/lib/featured/server";
import { FEATURED_TAG } from "@/lib/featured/core";

// Take a member's featured listing down, or send it back for another eBay check
// (/admin/featured). Same gate as /api/admin/feedback.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action === "remove" || body?.action === "recheck" ? body.action : null;
  if (!id || !action) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  try {
    await adminSetFeature(id, action);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  revalidateTag(FEATURED_TAG);
  return NextResponse.json({ ok: true });
}
