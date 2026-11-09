import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { approveAd, endAd, rejectAd } from "@/lib/sister-ads/server";

// Approve, reject or end a sister site's paid featured listing (/admin/sister-ads).
// Same gate as /api/admin/featured.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!id || !["approve", "reject", "end"].includes(action)) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  try {
    if (action === "approve") {
      const r = await approveAd(id);
      return NextResponse.json(r, { status: r.ok ? 200 : 409 });
    }
    if (action === "reject") {
      const r = await rejectAd(id, String(body?.reason ?? ""));
      return NextResponse.json(r, { status: r.ok ? 200 : 409 });
    }
    await endAd(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/sister-ads]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
