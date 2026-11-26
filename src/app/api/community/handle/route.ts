import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { premiumCors, premiumSiteForOrigin } from "@/lib/sister-premium";
import { communityMember } from "@/lib/community-member";
import { checkHandle } from "@/lib/handles";

export const dynamic = "force-dynamic";

// Choose or change the member's community handle (lib/handles.ts), from RiftCompare or a sister site (its token, exact origin).
// POST { token?, handle } -> { ok, handle } or { error }. An empty handle removes it: the member's contributions keep counting,
// and their name disappears from every list.

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const rl = rateLimit(`community-handle:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; handle?: unknown } | null;
  const member = await communityMember(req, body?.token);
  if (!member) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  if (body?.handle === "" || body?.handle === null) {
    await prisma.user.update({ where: { id: member.id }, data: { handle: null } });
    return NextResponse.json({ ok: true, handle: null }, { headers });
  }
  const c = checkHandle(body?.handle);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400, headers });
  if (c.handle === member.handle) return NextResponse.json({ ok: true, handle: c.handle }, { headers });
  const taken = await prisma.user.findUnique({ where: { handle: c.handle }, select: { id: true } });
  if (taken && taken.id !== member.id) return NextResponse.json({ error: `@${c.handle} is taken. Try another.` }, { status: 409, headers });
  try {
    await prisma.user.update({ where: { id: member.id }, data: { handle: c.handle } });
  } catch {
    return NextResponse.json({ error: `@${c.handle} is taken. Try another.` }, { status: 409, headers });
  }
  return NextResponse.json({ ok: true, handle: c.handle }, { headers });
}
