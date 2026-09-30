import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCheckoutSessionParams, trialCheckoutMessage, afterTrialPrice, type CheckoutParamsInput } from "../src/lib/checkout-params";
import { tierMonthlyAmount, tierAnnualAmount } from "../src/lib/site";

// The $1 first month (2026-09-30, DECISIONS.md, "A $1 first month for both
// tiers"): the Stripe Checkout Session a first-timer gets is the recurring plan
// PLUS a one-time inline $1 line, with a 30-day trial so the plan's own first
// invoice is $0; a returning customer gets neither. The builder is pure, so every
// branch is pinned here without Stripe.

// Stripe types custom_text.submit as Emptyable, so read the message through a guard.
const msg = (p: { custom_text?: { submit?: unknown } }): string | undefined => {
  const s = p.custom_text?.submit;
  return s && typeof s === "object" ? (s as { message?: string }).message : undefined;
};

const base: CheckoutParamsInput = {
  userId: "u1",
  email: "sam@example.com",
  stripeCustomerId: null,
  tier: "plus",
  plan: "monthly",
  priceId: "price_plus_test",
  currency: "usd",
  trial: { days: 30, feeCents: 100 },
  coupon: null,
  surface: null,
  back: null,
};

test("a first-timer: the recurring plan line FIRST, a one-time inline $1 line in the price's currency, and a 30-day trial", () => {
  const p = buildCheckoutSessionParams(base);
  assert.equal(p.mode, "subscription");
  assert.equal(p.line_items?.length, 2);
  assert.deepEqual(p.line_items?.[0], { price: "price_plus_test", quantity: 1 }, "the recurring line stays first");
  const fee = p.line_items?.[1];
  assert.equal(fee?.quantity, 1);
  assert.equal(fee?.price, undefined, "the fee is created inline, not from a Stripe Price");
  assert.equal(fee?.price_data?.currency, "usd");
  assert.equal(fee?.price_data?.unit_amount, 100);
  assert.equal(fee?.price_data?.recurring, undefined, "one-time: it must never recur");
  assert.equal(fee?.price_data?.product_data?.name, "RiftCompare Plus — first 30 days");
  assert.equal(p.subscription_data?.trial_period_days, 30);
  assert.deepEqual(p.subscription_data?.trial_settings, { end_behavior: { missing_payment_method: "cancel" } });
  assert.equal(p.payment_method_collection, "always", "card-gated, as before");
});

test("the fee line follows the plan Price's currency (Stripe refuses mixed currencies in one checkout)", () => {
  for (const currency of ["usd", "aud", "gbp"]) {
    const p = buildCheckoutSessionParams({ ...base, currency });
    assert.equal(p.line_items?.[1]?.price_data?.currency, currency);
    assert.equal(p.line_items?.[1]?.price_data?.unit_amount, 100);
    assert.match(msg(p) ?? "", /^\$1\.00 today for your first 30 days\./, "the text reads like the site's own prices");
  }
});

test("the checkout text is true: what is charged today, the reminder, then the plan price", () => {
  const monthly = msg(buildCheckoutSessionParams(base));
  assert.equal(
    monthly,
    `$1.00 today for your first 30 days. We'll email you a day or two before day 30. Then it's ${tierMonthlyAmount("plus")}/month unless you cancel from your account page.`,
  );
  const annual = msg(buildCheckoutSessionParams({ ...base, tier: "premium", plan: "annual" }));
  assert.match(annual ?? "", new RegExp(`Then it's \\${tierAnnualAmount("premium")}/year unless you cancel from your account page\\.$`));
  for (const m of [monthly, annual]) {
    assert.doesNotMatch(m ?? "", /free|nothing is charged|\$0/i, "a $1 trial is never described as free");
  }
});

test("a returning customer gets a normal checkout: no trial, no fee line, no trial text", () => {
  const p = buildCheckoutSessionParams({ ...base, trial: null });
  assert.equal(p.line_items?.length, 1);
  assert.deepEqual(p.line_items?.[0], { price: "price_plus_test", quantity: 1 });
  assert.equal(p.subscription_data?.trial_period_days, undefined);
  assert.equal(p.subscription_data?.trial_settings, undefined);
  assert.equal(p.payment_method_collection, undefined);
  assert.equal(p.custom_text, undefined);
  assert.equal(p.metadata?.trial, "0");
  assert.equal(p.metadata?.trialFeeCents, undefined);
  assert.equal(p.subscription_data?.metadata?.trialFeeCents, undefined);
});

test("a fee of 0 is a genuinely free trial: a trial and no one-time line, and the copy says so", () => {
  const p = buildCheckoutSessionParams({ ...base, trial: { days: 30, feeCents: 0 } });
  assert.equal(p.line_items?.length, 1);
  assert.equal(p.subscription_data?.trial_period_days, 30);
  assert.match(msg(p) ?? "", /^Nothing is charged today\. We'll email you a day or two before your 30-day trial ends\./);
  assert.equal(p.metadata?.trial, "1");
  assert.equal(p.metadata?.trialFeeCents, "0");
});

test("Plus vs Premium: the product name and the tier stamp follow the tier; the days follow the trial", () => {
  const plus = buildCheckoutSessionParams(base);
  const premium = buildCheckoutSessionParams({ ...base, tier: "premium", priceId: "price_premium_test", trial: { days: 14, feeCents: 100 } });
  assert.equal(plus.line_items?.[1]?.price_data?.product_data?.name, "RiftCompare Plus — first 30 days");
  assert.equal(premium.line_items?.[1]?.price_data?.product_data?.name, "RiftCompare Premium — first 14 days");
  assert.equal(premium.line_items?.[0]?.price, "price_premium_test");
  assert.equal(plus.metadata?.tier, "plus");
  assert.equal(premium.metadata?.tier, "premium");
  assert.equal(premium.subscription_data?.trial_period_days, 14);
});

test("monthly vs annual: the same trial on both, each converting to its own price", () => {
  const monthly = buildCheckoutSessionParams(base);
  const annual = buildCheckoutSessionParams({ ...base, plan: "annual", priceId: "price_plus_annual_test" });
  for (const p of [monthly, annual]) {
    assert.equal(p.subscription_data?.trial_period_days, 30);
    assert.equal(p.line_items?.[1]?.price_data?.unit_amount, 100, "the fee is the same $1 on either plan");
  }
  assert.equal(annual.line_items?.[0]?.price, "price_plus_annual_test");
  assert.equal(afterTrialPrice("plus", "monthly", null), `${tierMonthlyAmount("plus")}/month`);
  assert.equal(afterTrialPrice("plus", "annual", null), `${tierAnnualAmount("plus")}/year`);
});

test("the trial and its fee are stamped on the session AND the subscription, so reminders and the account card can read them", () => {
  const p = buildCheckoutSessionParams({ ...base, surface: "gate:deal-finder", back: "/deck/abc" });
  assert.deepEqual(p.metadata, { kind: "premium", userId: "u1", trial: "1", trialFeeCents: "100", intro: "0", tier: "plus", surface: "gate:deal-finder" });
  assert.deepEqual(p.subscription_data?.metadata, { userId: "u1", tier: "plus", intro: "0", trialFeeCents: "100", surface: "gate:deal-finder" });
  assert.equal(p.client_reference_id, "u1");
  assert.equal(p.success_url, "https://riftcompare.com/premium/welcome?session_id={CHECKOUT_SESSION_ID}&back=%2Fdeck%2Fabc");
  assert.equal(p.cancel_url, "https://riftcompare.com/deck/abc");
});

test("customer reuse, promo codes and the intro coupon behave as before", () => {
  const known = buildCheckoutSessionParams({ ...base, stripeCustomerId: "cus_1" });
  assert.equal(known.customer, "cus_1");
  assert.equal(known.customer_email, undefined);
  const fresh = buildCheckoutSessionParams(base);
  assert.equal(fresh.customer, undefined);
  assert.equal(fresh.customer_email, "sam@example.com");
  assert.equal(fresh.allow_promotion_codes, true);
  assert.equal(fresh.discounts, undefined);
  const withCoupon = buildCheckoutSessionParams({ ...base, coupon: "rc-intro-plus-150usd-3mo" });
  assert.deepEqual(withCoupon.discounts, [{ coupon: "rc-intro-plus-150usd-3mo" }]);
  assert.equal(withCoupon.allow_promotion_codes, undefined, "Stripe refuses both");
});

test("trialCheckoutMessage: a free trial and a paid one read differently, and only the paid one names an amount", () => {
  assert.match(trialCheckoutMessage({ days: 30, feeCents: 100 }, "$4.99/month"), /^\$1\.00 today/);
  assert.match(trialCheckoutMessage({ days: 30, feeCents: 0 }, "$4.99/month"), /^Nothing is charged today/);
});

test("the route hands the builder the configured constants, and never builds the session itself", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/premium/checkout/route.ts"), "utf8");
  assert.match(route, /buildCheckoutSessionParams\(\{/);
  assert.match(route, /trial: trialEligible \? \{ days: PREMIUM_TRIAL_DAYS, feeCents: PREMIUM_TRIAL_FEE_CENTS \} : null/);
  assert.doesNotMatch(route, /line_items:/, "the session parameters live in lib/checkout-params.ts");
  assert.match(route, /priceCurrencyOf\(priceId\)/, "the fee line's currency is read from the plan Price");
});
