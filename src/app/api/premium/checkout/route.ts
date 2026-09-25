import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, premiumPlusEnabled, PREMIUM_TRIAL_DAYS, priceIdFor, ensureIntroCoupon, forgetIntroCoupons, hasEverPaid, type PremiumTier } from "@/lib/premium";
import { introOfferEnabled, introPriceLine, tierMonthlyAmount, tierAnnualAmount } from "@/lib/site";
import { parseCheckoutSelection, sanitizeBackPath } from "@/lib/premium-start";
import { SITE_URL } from "@/lib/site";
import { isPremiumSurface } from "@/lib/premium-surface";

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

  // The surface that led here (lib/premium-surface.ts) — validated, so the body
  // can't write an arbitrary string into the table or into Stripe metadata.
  const surface = isPremiumSurface(body?.surface) ? (body.surface as string) : null;
  const surfaceMeta: { surface?: string } = surface ? { surface } : {};

  // Record the strong "started checkout" interest signal (best-effort), with the
  // surface it came from, so the funnel report can say which surfaces produce
  // checkouts and not just clicks.
  prisma.premiumClick.create({ data: { userId: user.id, source: "checkout", surface } }).catch(() => {});

  // One free trial per account, on EITHER plan (annual trials convert to the yearly
  // price after the trial). The webhook independently re-checks by card fingerprint,
  // so this gate can't be bypassed for a free trial by re-hitting the endpoint.
  const trialEligible = premiumTrialEnabled() && !dbUser?.trialStartedAt;

  // First 3 months half price (lib/site.ts intro block), monthly plans only,
  // for anyone who has never paid — people who cancelled a trial included.
  // If the coupon cannot be read or created the checkout still opens at full
  // price rather than failing: Stripe's own page shows the real amount before
  // anything is charged, and the error is logged for the maintenance check.
  let introCoupon: string | null = null;
  if (introOfferEnabled() && plan === "monthly" && !(await hasEverPaid(dbUser?.stripeCustomerId))) {
    introCoupon = await ensureIntroCoupon(tier, priceId).catch((e) => {
      console.error("intro coupon unavailable — checkout continues at full price:", e);
      return null;
    });
  }

  // The session parameters for a given intro coupon (or none). A function so a
  // coupon Stripe rejects — deleted in the dashboard while a warm instance
  // still caches its id — can be retried once at full price instead of
  // failing the whole checkout (review, 2026-09-25).
  const sessionParams = (coupon: string | null): Stripe.Checkout.SessionCreateParams => {
    // Beside Stripe's own pay button, for a trial: nothing today, the reminder,
    // then exactly what it becomes (2026-09-24). Built from the same helpers as
    // /premium and /premium/start so the three can never disagree. No dates:
    // trial_end is fixed only when Checkout completes (the welcome page shows
    // the dated version, read from the subscription).
    const afterTrial =
      plan === "annual" ? `${tierAnnualAmount(tier)}/year` : coupon ? introPriceLine(tier) : `${tierMonthlyAmount(tier)}/mo`;
    const trialMessage = `Nothing is charged today. We'll email you a day or two before your ${PREMIUM_TRIAL_DAYS}-day trial ends. Then it's ${afterTrial} unless you cancel from your account page.`;

    return {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the Stripe customer when we have one, so renewals stay linked.
      ...(dbUser?.stripeCustomerId
        ? { customer: dbUser.stripeCustomerId }
        : { customer_email: dbUser?.email }),
      client_reference_id: user.id,
      metadata: { kind: "premium", userId: user.id, trial: trialEligible ? "1" : "0", intro: coupon ? "1" : "0", tier, ...surfaceMeta },
      subscription_data: {
        // Stamped here too (not just on the session) because session metadata
        // does NOT propagate to the subscription object — renewals and the
        // reconcile cron only ever see subscription_data.metadata.
        // `surface` rides on the SUBSCRIPTION too, which is the object the
        // funnel report lists — so a trial, and whether it converted, can be
        // attributed to the surface that started it.
        metadata: { userId: user.id, tier, intro: coupon ? "1" : "0", ...surfaceMeta },
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
      ...(trialEligible ? { custom_text: { submit: { message: trialMessage } } } : {}),
      // {CHECKOUT_SESSION_ID} is a Stripe PLACEHOLDER — it must stay literal
      // here; Stripe substitutes the real session id on the redirect. The
      // welcome page re-reads that session and checks it belongs to the viewer
      // before showing anything (entitlement itself still comes from the
      // webhook). This replaced /portfolio?upgraded=1, which nothing read: the
      // buyer landed on a page that still said they were on the free tier.
      success_url: `${SITE_URL}/premium/welcome?session_id={CHECKOUT_SESSION_ID}${back ? `&back=${encodeURIComponent(back)}` : ""}`,
      cancel_url: `${SITE_URL}${back ?? "/premium"}`,
      // Stripe refuses `discounts` together with allow_promotion_codes, so a
      // checkout carrying the intro offer takes no second code; everyone else
      // can still enter one.
      ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    };
  };

  try {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe().checkout.sessions.create(sessionParams(introCoupon));
    } catch (e) {
      const param = (e as { param?: string }).param ?? "";
      if (!introCoupon || !param.startsWith("discounts")) throw e;
      console.error("intro coupon rejected by Stripe — retrying checkout at full price:", e);
      forgetIntroCoupons();
      session = await stripe().checkout.sessions.create(sessionParams(null));
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("premium checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
  }
}
