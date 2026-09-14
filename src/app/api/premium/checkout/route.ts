import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, premiumPlusEnabled, PREMIUM_TRIAL_DAYS, priceIdFor, type PremiumTier } from "@/lib/premium";
import { parseCheckoutSelection, sanitizeBackPath } from "@/lib/premium-start";
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

  // Already paying? Starting a SECOND Stripe subscription is never what anyone
  // means — a Plus member who wants Premium upgrades in place (api/premium/
  // upgrade, prorated) and a Premium member has nothing to buy. /premium/start
  // redirects these people too, but this is the real fence: the route is
  // reachable directly.
  if (isPremium(user) && !user.isAdmin) {
    return NextResponse.json(
      { error: "You already have a subscription — manage it from /premium" },
      { status: 409 }
    );
  }

  // Which tier — Plus (cheaper, requires its own Stripe price to be configured)
  // or Premium (the default, and the only option while Plus is unconfigured).
  // Which plan — annual (yearly price) or monthly; priceIdFor() falls back to
  // monthly cleanly if annual is requested but unset for that tier.
  //
  // parseCheckoutSelection is SHARED with /premium/start (lib/premium-start.ts)
  // so the page that shows the price and this route that charges for it apply
  // one rule, not two copies of it.
  const body = await req.json().catch(() => null);
  const sel = parseCheckoutSelection(body?.tier, body?.plan, premiumPlusEnabled());
  const tier: PremiumTier = sel.tier;
  const plan: "monthly" | "annual" = sel.plan;
  const priceId = priceIdFor(tier, plan);

  // Where the visitor was before they started buying — the deck/card page a
  // blur-wall interrupted. Carried through Stripe so both the success and the
  // cancel paths return them there instead of dumping them on /premium.
  const back = sanitizeBackPath(body?.back);

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true, trialStartedAt: true },
  });

  // Record the strong "started checkout" interest signal (best-effort).
  prisma.premiumClick.create({ data: { userId: user.id, source: "checkout" } }).catch(() => {});

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
      metadata: { kind: "premium", userId: user.id, trial: trialEligible ? "1" : "0", tier },
      subscription_data: {
        // Stamped here too (not just on the session) because session metadata
        // does NOT propagate to the subscription object — renewals and the
        // reconcile cron only ever see subscription_data.metadata.
        metadata: { userId: user.id, tier },
        // PREMIUM_TRIAL_DAYS free trial for first-timers, same length on both plans
        // (annual just converts to the yearly price after it ends). A card is still
        // required up front (payment_method_collection below), so the trial
        // auto-converts to paid unless cancelled — and we can fingerprint the card
        // to block trial abuse.
        ...(trialEligible
          ? {
              trial_period_days: PREMIUM_TRIAL_DAYS,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
            }
          : {}),
      },
      // Force card collection even though $0 is due now during a trial.
      ...(trialEligible ? { payment_method_collection: "always" as const } : {}),
      // {CHECKOUT_SESSION_ID} is a Stripe PLACEHOLDER — it must stay literal
      // here; Stripe substitutes the real session id on the redirect. The
      // welcome page re-reads that session and checks it belongs to the viewer
      // before showing anything (entitlement itself still comes from the
      // webhook). This replaced /portfolio?upgraded=1, which nothing read: the
      // buyer landed on a page that still said they were on the free tier.
      success_url: `${SITE_URL}/premium/welcome?session_id={CHECKOUT_SESSION_ID}${back ? `&back=${encodeURIComponent(back)}` : ""}`,
      cancel_url: `${SITE_URL}${back ?? "/premium"}`,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("premium checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
  }
}
