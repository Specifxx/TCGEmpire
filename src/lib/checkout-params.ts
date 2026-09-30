// The Stripe Checkout Session parameters for a Premium subscription, as a PURE
// function (no Stripe client, no database, no env) so tests/checkout-params.test.ts
// can pin every branch without Stripe. src/app/api/premium/checkout/route.ts reads
// the account, the price and the coupon, then hands them here.
//
// It lives in lib/, not in the route file, because a Next.js route module may
// export only its handlers and config.
//
// THE $1 FIRST MONTH (2026-09-30, DECISIONS.md, "A $1 first month for both
// tiers"): a first-timer's session carries
//   * the recurring plan line, FIRST, exactly as before,
//   * subscription_data.trial_period_days = the trial length, so the recurring
//     line is $0 on the first invoice and the plan price starts after the trial,
//   * a second, ONE-TIME line item created inline with price_data (no
//     `recurring`), which Stripe puts on that first invoice: the $1.00 the
//     customer pays at checkout. Stripe's documented pattern for "a one-time fee
//     at the same time you start a trial" (Billing > Trials, "Combining trials
//     with add_invoice_items ... the customer pays the one-time amount upfront,
//     while the recurring subscription billing begins after the trial period
//     ends"); Checkout accepts one-time line items beside a recurring one in
//     subscription mode. Inline price_data means NO new Stripe Price to create.
// Reusing Stripe's trial (not a coupon that makes invoice one cost $1) is what
// gives the customer the trial-ending reminder BEFORE the first full charge.
//
// A returning customer (`trial: null`) gets the plain checkout: no trial, no fee.
import type Stripe from "stripe";
import { SITE_URL, TIER_NAMES, introPriceLine, premiumCurrencySymbol, tierAnnualAmount, tierMonthlyAmount, type PremiumTierKey } from "./site";

export interface CheckoutTrial {
  /** Trial length in days (>= 1). */
  days: number;
  /** Charged today, in the smallest unit of `currency`. 0 = a free trial: no one-time line. */
  feeCents: number;
}

export interface CheckoutParamsInput {
  userId: string;
  email: string | null | undefined;
  stripeCustomerId: string | null | undefined;
  tier: PremiumTierKey;
  plan: "monthly" | "annual";
  /** The recurring Stripe Price id for this tier and plan. */
  priceId: string;
  /** That Price's currency (lowercase ISO, e.g. "usd"): the one-time fee line must match it. */
  currency: string;
  /** null = no trial for this buyer (a returning customer, or trials switched off). */
  trial: CheckoutTrial | null;
  /** The intro half-price coupon id, or null (off by default since 2026-09-26). */
  coupon: string | null;
  surface?: string | null;
  /** A sanitized on-site path to return to. */
  back?: string | null;
}

/** The plan's price after the trial, in the words the checkout text uses: "$2.99/month" or "$23.99/year". */
export function afterTrialPrice(tier: PremiumTierKey, plan: "monthly" | "annual", coupon: string | null): string {
  return plan === "annual" ? `${tierAnnualAmount(tier)}/year` : coupon ? introPriceLine(tier) : `${tierMonthlyAmount(tier)}/month`;
}

/**
 * The line beside Stripe's own pay button, true to the fee: the amount charged
 * today, the reminder, then exactly what it becomes. No dates: trial_end is
 * fixed only when Checkout completes (the welcome page shows the dated version,
 * read from the subscription).
 */
export function trialCheckoutMessage(trial: CheckoutTrial, afterTrial: string): string {
  // Written with the site's own currency symbol and two decimals ("$1.00"), like
  // the "then it's $2.99/month" beside it, so both halves of the sentence read in
  // the same style; the CHARGE itself is in the plan Price's currency (`currency`).
  return trial.feeCents > 0
    ? `${premiumCurrencySymbol()}${(trial.feeCents / 100).toFixed(2)} today for your first ${trial.days} days. We'll email you a day or two before day ${trial.days}. Then it's ${afterTrial} unless you cancel from your account page.`
    : `Nothing is charged today. We'll email you a day or two before your ${trial.days}-day trial ends. Then it's ${afterTrial} unless you cancel from your account page.`;
}

export function buildCheckoutSessionParams(i: CheckoutParamsInput): Stripe.Checkout.SessionCreateParams {
  const { tier, plan, trial, coupon, priceId } = i;
  const surfaceMeta: { surface?: string } = i.surface ? { surface: i.surface } : {};
  const fee = trial?.feeCents ?? 0;

  // ONE-TIME line: only for a paid trial. Inline price_data (no `recurring`) in the
  // recurring price's own currency, named for the tier so the receipt and Stripe's
  // pay page say what the $1 is for.
  const feeLines: Stripe.Checkout.SessionCreateParams.LineItem[] =
    trial && fee > 0
      ? [
          {
            price_data: {
              currency: i.currency,
              unit_amount: fee,
              product_data: { name: `RiftCompare ${TIER_NAMES[tier]} — first ${trial.days} days` },
            },
            quantity: 1,
          },
        ]
      : [];

  return {
    mode: "subscription",
    // The recurring plan line stays FIRST (tests/premium-price-increase.test.ts pins
    // `line_items: [{ price: priceId`, and the webhook reads items[0]).
    line_items: [{ price: priceId, quantity: 1 }, ...feeLines],
    // Reuse the Stripe customer when we have one, so renewals stay linked.
    ...(i.stripeCustomerId ? { customer: i.stripeCustomerId } : { customer_email: i.email ?? undefined }),
    client_reference_id: i.userId,
    // `trial` and `trialFeeCents` are what the WEBHOOK'S first read of the session
    // sees; it decides whether a trial happened from the SUBSCRIPTION's own status
    // and trial_end, never from the amount charged or the session's payment_status
    // (a $1 trial checkout is "paid", amount_total 100).
    metadata: {
      kind: "premium",
      userId: i.userId,
      trial: trial ? "1" : "0",
      ...(trial ? { trialFeeCents: String(fee) } : {}),
      intro: coupon ? "1" : "0",
      tier,
      ...surfaceMeta,
    },
    subscription_data: {
      // Stamped here too (not just on the session) because session metadata
      // does NOT propagate to the subscription object — renewals, the reconcile
      // cron, the trial reminder and the account card only ever see
      // subscription_data.metadata. `trialFeeCents` is how they know what the
      // customer paid to start (a trial from before the fee existed reads 0).
      // `surface` rides on the SUBSCRIPTION too, which is the object the funnel
      // report lists.
      metadata: {
        userId: i.userId,
        tier,
        intro: coupon ? "1" : "0",
        ...(trial ? { trialFeeCents: String(fee) } : {}),
        ...surfaceMeta,
      },
      // A first-timer's trial, the same length on both tiers and both plans (annual
      // just converts to the yearly price after it ends). A card is required up
      // front (payment_method_collection below), so the trial auto-converts to paid
      // unless cancelled, and the card can be fingerprinted to block trial abuse.
      ...(trial
        ? {
            trial_period_days: trial.days,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
          }
        : {}),
    },
    // Force card collection even though the recurring line is $0 during a trial.
    ...(trial ? { payment_method_collection: "always" as const } : {}),
    ...(trial ? { custom_text: { submit: { message: trialCheckoutMessage(trial, afterTrialPrice(tier, plan, coupon)) } } } : {}),
    // {CHECKOUT_SESSION_ID} is a Stripe PLACEHOLDER — it must stay literal here;
    // Stripe substitutes the real session id on the redirect. The welcome page
    // re-reads that session and checks it belongs to the viewer before showing
    // anything (entitlement itself still comes from the webhook).
    success_url: `${SITE_URL}/premium/welcome?session_id={CHECKOUT_SESSION_ID}${i.back ? `&back=${encodeURIComponent(i.back)}` : ""}`,
    cancel_url: `${SITE_URL}${i.back ?? "/premium"}`,
    // Stripe refuses `discounts` together with allow_promotion_codes, so a
    // checkout carrying the intro offer takes no second code; everyone else can
    // still enter one.
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
  };
}
