import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { premiumCheckoutEnabled, premiumTrialEnabled, PREMIUM_PRICE_ID, PREMIUM_TRIAL_DAYS, PREMIUM_ANNUAL_PRICE_ID } from "@/lib/premium";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Start a RiftCompare Premium subscription via Stripe's hosted Checkout.
// Entitlement is granted by the webhook (invoice.paid → premiumUntil = period
// end), so a user is only ever premium for time that's actually been paid.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!premiumCheckoutEnabled()) {
    return NextResponse.json({ error: "Premium checkout isn't configured yet" }, { status: 503 });
  }

  // Which plan — annual (yearly price) or monthly. Annual requires its own Stripe
  // price to be configured; if requested but unset, fall back to monthly cleanly.
  const body = await req.json().catch(() => null);
  const annual = body?.plan === "annual" && !!PREMIUM_ANNUAL_PRICE_ID;
  const priceId = annual ? PREMIUM_ANNUAL_PRICE_ID : PREMIUM_PRICE_ID;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true, trialStartedAt: true },
  });

  // One free trial per account, on EITHER plan (annual trials convert to the yearly
  // price after the trial). The webhook independently re-checks by card fingerprint,
  // so this gate can't be bypassed for a free trial by re-hitting the endpoint.
  const trialEligible = premiumTrialEnabled() && !dbUser?.trialStartedAt;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the Stripe customer when we have one, so renewals stay linked.
      ...(dbUser?.stripeCustomerId
        ? { customer: dbUser.stripeCustomerId }
        : { customer_email: dbUser?.email }),
      client_reference_id: user.id,
      metadata: { kind: "premium", userId: user.id, trial: trialEligible ? "1" : "0" },
      subscription_data: {
        metadata: { userId: user.id },
        // 1-day free trial for first-timers. A card is still required up front
        // (payment_method_collection below), so the trial auto-converts to paid
        // unless cancelled — and we can fingerprint the card to block trial abuse.
        ...(trialEligible
          ? {
              trial_period_days: PREMIUM_TRIAL_DAYS,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
            }
          : {}),
      },
      // Force card collection even though $0 is due now during a trial.
      ...(trialEligible ? { payment_method_collection: "always" as const } : {}),
      success_url: `${SITE_URL}/portfolio?upgraded=1`,
      cancel_url: `${SITE_URL}/premium`,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("premium checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
  }
}
