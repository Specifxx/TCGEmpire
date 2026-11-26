import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { premiumCors, premiumSiteForOrigin } from "@/lib/sister-premium";
import { communityMember } from "@/lib/community-member";
import { myContributions } from "@/lib/contributions-server";
import { CONTRIBUTION_POINTS, DAILY_CONTRIBUTION_CAP } from "@/lib/contributions";

export const dynamic = "force-dynamic";

// The member's own community card: their handle and what they contributed this month and in all. POST { token? }.

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const rl = rateLimit(`community-me:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const member = await communityMember(req, body?.token);
  if (!member) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    const mine = await myContributions(member.id);
    return NextResponse.json({ ok: true, handle: member.handle, ...mine, points: CONTRIBUTION_POINTS, dailyCap: DAILY_CONTRIBUTION_CAP }, { headers });
  } catch (e) {
    console.warn("[community] me failed:", e);
    return NextResponse.json({ error: "Couldn't load. Try again." }, { status: 503, headers });
  }
}
