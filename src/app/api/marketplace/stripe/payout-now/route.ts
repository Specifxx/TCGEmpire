import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/stripe";
import { getPayoutSchedule, createManualPayout } from "@/lib/connect";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST: pay out the connected account's full available balance right now.
// Only meaningful when the seller has chosen the "manual" schedule (the "hold"
// option) — otherwise Stripe is already paying out on its own schedule, so this
// route refuses rather than let a confused double-click look like it did
// something on an automatic account.
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payouts aren't enabled yet" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`payout-now:${clientIp(req)}:${user.id}`, 10, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const profile = await prisma.sellerProfile.findUnique({ where: { userId: user.id }, select: { stripeAccountId: true, payoutsEnabled: true } });
  if (!profile?.payoutsEnabled || !profile.stripeAccountId) {
    return NextResponse.json({ error: "Finish payout setup first" }, { status: 400 });
  }

  try {
    const schedule = await getPayoutSchedule(profile.stripeAccountId);
    if (schedule.interval !== "manual") {
      return NextResponse.json({ error: "Switch your payout schedule to manual first" }, { status: 400 });
    }
    await createManualPayout(profile.stripeAccountId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[stripe/payout-now] failed:", e);
    // Stripe's own message here is safe + useful ("no funds available", etc).
    const message = e instanceof Error ? e.message : "Couldn't reach Stripe — try again shortly";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
