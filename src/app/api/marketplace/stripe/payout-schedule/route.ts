import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/stripe";
import { getPayoutSchedule, updatePayoutSchedule, type PayoutInterval } from "@/lib/connect";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const INTERVALS: PayoutInterval[] = ["manual", "daily", "weekly", "monthly"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

async function sellerAccountId(userId: string): Promise<string | null> {
  const profile = await prisma.sellerProfile.findUnique({ where: { userId }, select: { stripeAccountId: true, payoutsEnabled: true } });
  return profile?.payoutsEnabled && profile.stripeAccountId ? profile.stripeAccountId : null;
}

// GET: the connected account's current payout schedule, read live from Stripe.
export async function GET() {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payouts aren't enabled yet" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const accountId = await sellerAccountId(user.id);
  if (!accountId) return NextResponse.json({ error: "Finish payout setup first" }, { status: 400 });

  try {
    const schedule = await getPayoutSchedule(accountId);
    return NextResponse.json(schedule);
  } catch (e) {
    console.error("[stripe/payout-schedule] GET failed:", e);
    return NextResponse.json({ error: "Couldn't reach Stripe — try again shortly" }, { status: 502 });
  }
}

// POST: change the schedule — automatic daily/weekly/monthly, or "manual" (hold
// until the seller explicitly requests a payout via /stripe/payout-now).
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payouts aren't enabled yet" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`payout-schedule:${clientIp(req)}:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const accountId = await sellerAccountId(user.id);
  if (!accountId) return NextResponse.json({ error: "Finish payout setup first" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const interval = body?.interval as PayoutInterval | undefined;
  if (!interval || !INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "Invalid payout schedule" }, { status: 400 });
  }
  const weeklyAnchor = typeof body?.weeklyAnchor === "string" && WEEKDAYS.includes(body.weeklyAnchor) ? body.weeklyAnchor : undefined;
  const monthlyAnchor = Number.isInteger(body?.monthlyAnchor) && body.monthlyAnchor >= 1 && body.monthlyAnchor <= 31 ? body.monthlyAnchor : undefined;
  if (interval === "weekly" && !weeklyAnchor) return NextResponse.json({ error: "Pick a day of the week" }, { status: 400 });
  if (interval === "monthly" && !monthlyAnchor) return NextResponse.json({ error: "Pick a day of the month" }, { status: 400 });

  try {
    await updatePayoutSchedule(accountId, { interval, weeklyAnchor, monthlyAnchor });
    const schedule = await getPayoutSchedule(accountId);
    return NextResponse.json(schedule);
  } catch (e) {
    console.error("[stripe/payout-schedule] POST failed:", e);
    const message = e instanceof Error ? e.message : "Couldn't reach Stripe — try again shortly";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
