import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Stops every release alert for the address behind `token`. POST only: the
// email's link opens /alerts/release, which POSTs here, and mail clients'
// RFC 8058 one-click Unsubscribe POSTs here directly. Never on GET, so a link
// scanner prefetching the email cannot unsubscribe anyone.
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const body = await req.json().catch(() => null);
    token = typeof body?.token === "string" ? body.token : "";
  }
  if (!token || token.length > 100) return NextResponse.json({ error: "Missing token." }, { status: 400 });
  const { count } = await prisma.setReleaseAlert.deleteMany({ where: { unsubToken: token } });
  return NextResponse.json({ ok: true, removed: count });
}
