import { NextResponse } from "next/server";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { findActiveAffiliate } from "@/lib/creator-affiliate";
import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_MAX_AGE } from "@/lib/creator-affiliate-code";

export const dynamic = "force-dynamic";

// Apply (POST {code}) or remove (DELETE) a creator code from /premium's code box
// (2026-10-16). A valid, active code is remembered in the rc_aff cookie that
// checkout reads. Rate-limited per IP so the endpoint can't be used to guess codes.
const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function POST(req: Request) {
  const rl = rateLimit(`creator-code:${clientIp(req)}`, 20, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const a = await findActiveAffiliate(body?.code).catch(() => null);
  if (!a) return NextResponse.json({ error: "That code isn't valid. Check the spelling with the creator." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const res = NextResponse.json({ ok: true, code: a.code, name: a.name, percentOff: a.percentOff }, { headers: { "Cache-Control": "private, no-store" } });
  res.cookies.set(AFFILIATE_COOKIE, a.code, { ...cookieOpts, maxAge: AFFILIATE_COOKIE_MAX_AGE });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  res.cookies.set(AFFILIATE_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  return res;
}
