import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { premiumCors, premiumSiteForOrigin } from "@/lib/sister-premium";
import { communityMember } from "@/lib/community-member";
import { loyaltyCheckIn, myLoyalty, redeemReward } from "@/lib/loyalty-server";
import { LEVELS, LOYALTY_ENABLED } from "@/lib/loyalty";
import { STREAK_CAP } from "@/lib/streak";

export const dynamic = "force-dynamic";

// Member rewards (lib/loyalty.ts), from RiftCompare or a sister site (its premium-session token, exact origin).
// POST { token?, action?: "get" | "checkin" | "redeem", reward? } -> the member's points, streak, level and rewards.

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  if (!LOYALTY_ENABLED) return NextResponse.json({ error: "Rewards are off." }, { status: 404, headers });
  const rl = rateLimit(`loyalty:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; action?: unknown; reward?: unknown } | null;
  const member = await communityMember(req, body?.token);
  if (!member) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    let note: string | null = null;
    if (body?.action === "checkin") await loyaltyCheckIn(member.id, member.site);
    else if (body?.action === "redeem") {
      const r = await redeemReward(member.id, body.reward, member.site);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers });
      note = r.premiumUntil ? `Done. Premium now runs to ${r.premiumUntil.slice(0, 10)}.` : "Done.";
    }
    const mine = await myLoyalty(member.id);
    return NextResponse.json({ ok: true, ...mine, note, streakCap: STREAK_CAP, levels: LEVELS }, { headers });
  } catch (e) {
    console.warn("[loyalty] failed:", e);
    return NextResponse.json({ error: "Couldn't load. Try again." }, { status: 503, headers });
  }
}
