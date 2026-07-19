import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/stripe";
import { createExpressAccount, createOnboardingLink, createLoginLink } from "@/lib/connect";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET: where the seller stands with payouts (used by SellerDashboard to decide
// whether to show "enable payouts" vs. "manage payouts").
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { stripeAccountId: true, payoutsEnabled: true },
  });
  return NextResponse.json({
    hasAccount: !!profile?.stripeAccountId,
    payoutsEnabled: !!profile?.payoutsEnabled,
  });
}

// POST: start (or resume) Express onboarding, or — once payouts are already
// enabled — return a login link into the seller's own Stripe dashboard.
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payouts aren't enabled yet" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`connect:${clientIp(req)}:${user.id}`, 10, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { country: true, stripeAccountId: true, payoutsEnabled: true },
  });
  if (!profile) return NextResponse.json({ error: "Set up your shop first" }, { status: 400 });

  try {
    // Already fully onboarded — send them to their own Stripe dashboard instead of
    // starting a second Express account.
    if (profile.stripeAccountId && profile.payoutsEnabled) {
      const url = await createLoginLink(profile.stripeAccountId);
      return NextResponse.json({ ok: true, url, mode: "dashboard" });
    }

    let accountId = profile.stripeAccountId;
    if (!accountId) {
      accountId = await createExpressAccount(profile.country, user.email);
      await prisma.sellerProfile.update({ where: { userId: user.id }, data: { stripeAccountId: accountId } });
    }
    const url = await createOnboardingLink(accountId);
    return NextResponse.json({ ok: true, url, mode: "onboarding" });
  } catch (e) {
    // Without this, an unhandled Stripe error (e.g. the platform account missing a
    // required business profile field, or a capability request Stripe rejects) fell
    // through as a raw 500 HTML page — the client's res.json() couldn't parse it,
    // so every real cause showed the same opaque "couldn't reach Stripe" message.
    // Logging the real error server-side (visible in Vercel) and returning Stripe's
    // own message (safe to show — these are user-actionable, not sensitive) turns
    // every future failure here into something diagnosable instead of a dead end.
    console.error("[marketplace/stripe/connect] onboarding failed:", e);
    const message = e instanceof Error ? e.message : "Couldn't reach Stripe — try again shortly";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
