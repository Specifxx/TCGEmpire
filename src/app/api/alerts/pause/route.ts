import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { pauseAddress, resumeAddress } from "@/lib/alert-mute";

// POST { paused } — the signed-in account's own "Pause alert emails" switch on
// /watching (the account-side twin of the email footer's token page). Writes
// or deletes the AlertMute row for the account's address, which is the address
// its PriceAlert rows are written with. The watchlist itself is untouched;
// GET /api/alerts/watchlist reports `paused`.
//
// Session cookie ⇒ cookies() ⇒ never cacheable.
export const dynamic = "force-dynamic";

const schema = z.object({ paused: z.boolean() });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`alerts:pause:${user.id}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { paused: boolean }" }, { status: 400 });

  if (parsed.data.paused) await pauseAddress(prisma, user.email, "watchlist");
  else await resumeAddress(prisma, user.email);
  return NextResponse.json({ ok: true, paused: parsed.data.paused }, { headers: { "Cache-Control": "no-store" } });
}
