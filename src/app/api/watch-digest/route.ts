import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { newDigestToken, watchDigestArm } from "@/lib/watch-digest";

// Turn the weekly watched-cards email on or off for the signed-in account (lib/watch-digest.ts). Only the offer arm can
// turn it on: the control arm is never shown the button, and refusing here keeps the two arms clean.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rl = rateLimit(`watch-digest:${user.id}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => ({}))) as { on?: unknown };
  const on = body.on === true;
  const existing = await prisma.watchDigestSub.findUnique({ where: { userId: user.id }, select: { optedOutAt: true } });
  if (on) {
    if (watchDigestArm(user.id) !== "offer") return NextResponse.json({ error: "Not available" }, { status: 403 });
    if (existing) await prisma.watchDigestSub.update({ where: { userId: user.id }, data: { optedOutAt: null, email: user.email } });
    else await prisma.watchDigestSub.create({ data: { userId: user.id, email: user.email, token: newDigestToken() } });
  } else if (existing && !existing.optedOutAt) {
    await prisma.watchDigestSub.update({ where: { userId: user.id }, data: { optedOutAt: new Date() } });
  }
  return NextResponse.json({ ok: true, on }, { headers: { "Cache-Control": "no-store" } });
}
