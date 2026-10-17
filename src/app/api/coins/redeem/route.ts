import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coinsEnabledFor, redeemPremium } from "@/lib/coins-server";

export const dynamic = "force-dynamic";

const WHY: Record<string, string> = {
  "paid-plan": "You already have a paid plan, so there's nothing to add",
  "this-month": "You've had your free week this month",
  short: "Not enough Riftcoins yet",
  failed: "That didn't go through. Nothing was spent.",
};

// POST — spend Riftcoins on a week of Premium, once a month, for an account
// without a paid plan (lib/coins-server.ts redeemPremium). Idempotent on the
// month: a double click or a replay pays out once.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !coinsEnabledFor(user)) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`coins:redeem:${user.id}`, 5, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const result = await redeemPremium(user);
  if (!result.ok) return NextResponse.json({ error: WHY[result.reason], reason: result.reason }, { status: result.reason === "failed" ? 503 : 409 });
  return NextResponse.json({ ok: true, until: result.until.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
