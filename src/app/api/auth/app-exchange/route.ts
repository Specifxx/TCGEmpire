import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { redeemAppCode } from "@/lib/app-auth";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// The last step of a sign-in started inside the Android app (lib/app-auth.ts): the WebView trades the one-time code and its own
// verifier for a session cookie in ITS jar. Same-origin POST only; the code alone redeems nothing.
export async function POST(req: Request) {
  const limit = rateLimit(`app-exchange:ip:${clientIp(req)}`, 20, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const userId = await redeemAppCode(body?.code, body?.verifier);
  if (!userId) return NextResponse.json({ error: "That sign-in has expired. Please try again." }, { status: 400 });
  try {
    await createSession(userId);
  } catch {
    return NextResponse.json({ error: "Couldn't sign you in. Please try again." }, { status: 500 });
  }
  void prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
