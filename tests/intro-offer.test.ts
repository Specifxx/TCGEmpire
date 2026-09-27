import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INTRO_MONTHS,
  introAmountOffCents,
  tierIntroMonthlyAmount,
  introPriceLine,
  introOfferEnabled,
  introFromLine,
  premiumFromLine,
} from "../src/lib/site";
import { introCouponId, PREMIUM_TRIAL_DAYS, premiumTrialEnabled, introRenewalsRemaining, isIntroCouponId } from "../src/lib/premium";

// Owner's call, 2026-09-24: a 3-day trial, then the first 3 months half price,
// for Plus and Premium. DECISIONS.md, "Trial model: 3-day trial, then the
// first 3 months half price".
//
// REVERSED 2026-09-26 (owner: "the price is not working"): both tiers' prices
// cut, and the trial AND the intro dropped — both OFF by default, each still
// switchable back on from the environment. The tests below that protected the
// trial and the intro now pin that default-off behaviour; the machinery tests
// (coupon sizing, renewals left on a switch) stay, because existing intro
// coupons keep running out on live subscriptions and the env can re-arm it.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("half price is the price's cents halved, rounded so the charge rounds down", () => {
  // The rule, on the pre-cut prices the live intro coupons were sized for…
  assert.equal(introAmountOffCents(999), 500);
  assert.equal(999 - introAmountOffCents(999), 499, "Premium $9.99 → $4.99");
  assert.equal(introAmountOffCents(499), 250);
  assert.equal(499 - introAmountOffCents(499), 249, "Plus $4.99 → $2.49");
  // …and on today's (2026-09-26) prices, should the env ever re-arm the offer.
  assert.equal(tierIntroMonthlyAmount("premium"), "$2.49");
  assert.equal(tierIntroMonthlyAmount("plus"), "$1.49");
  assert.equal(introPriceLine("premium"), "$2.49/mo for your first 3 months, then $4.99/mo");
  assert.equal(INTRO_MONTHS, 3);
});

test("the intro offer is OFF by default: only NEXT_PUBLIC_PREMIUM_INTRO_OFFER=1 turns it on (2026-09-26)", () => {
  assert.equal(introOfferEnabled(), false, "off unless NEXT_PUBLIC_PREMIUM_INTRO_OFFER=1");
  const site = read("src/lib/site.ts");
  const at = site.indexOf("export function introOfferEnabled()");
  assert.match(site.slice(at, at + 150), /NEXT_PUBLIC_PREMIUM_INTRO_OFFER === "1"/, "opt-in, not opt-out");
  // Off means every intro-aware price line falls back to the plain price —
  // even for a viewer checkout would otherwise have called eligible.
  assert.equal(introFromLine("premium", true), premiumFromLine("premium"));
  assert.equal(introFromLine("plus", true), premiumFromLine("plus"));
  // And checkout only sizes/attaches a coupon inside the switch.
  const route = read("src/app/api/premium/checkout/route.ts");
  const calls = route.match(/ensureIntroCoupon\(/g) ?? [];
  assert.equal(calls.length, 1, "checkout has exactly one ensureIntroCoupon call…");
  const callAt = route.indexOf("ensureIntroCoupon(tier, priceId)");
  assert.match(route.slice(Math.max(0, callAt - 200), callAt), /if \(introOfferEnabled\(\) && plan === "monthly"/, "…and it sits inside the intro switch");
});

test("the trial is OFF by default: no trial unless PREMIUM_TRIAL_DAYS says so (2026-09-26)", () => {
  assert.equal(PREMIUM_TRIAL_DAYS, 0);
  assert.equal(premiumTrialEnabled(), false);
  const lib = read("src/lib/premium.ts");
  assert.match(lib, /Number\(process\.env\.PREMIUM_TRIAL_DAYS \?\? 0\)/, "the default is 0, the env can still set a length");
  // Checkout adds trial_period_days only for a trial-eligible account, which
  // needs premiumTrialEnabled() — so with 0 the subscription starts paid.
  const route = read("src/app/api/premium/checkout/route.ts");
  assert.match(route, /const trialEligible = premiumTrialEnabled\(\) && !dbUser\?\.trialStartedAt;/);
  assert.match(route, /\.\.\.\(trialEligible\s*\?\s*\{\s*trial_period_days: PREMIUM_TRIAL_DAYS/);
  assert.match(route, /\.\.\.\(trialEligible \? \{ payment_method_collection: "always" as const \} : \{\}\)/);
});

test("the coupon id encodes tier, amount and currency, so a price change can never reuse it", () => {
  assert.equal(introCouponId("premium", 500, "USD"), "rc-intro-premium-500usd-3mo");
  assert.notEqual(introCouponId("premium", 500, "usd"), introCouponId("premium", 750, "usd"));
  const lib = read("src/lib/premium.ts");
  assert.match(lib, /amount_off: amountOff,[\s\S]{0,80}duration: "repeating",\s*duration_in_months: months,/);
  assert.match(lib, /months: number = INTRO_MONTHS\): Promise<string>/, "checkout gets the full three");
  assert.match(lib, /price\.recurring\?\.interval !== "month"/, "only ever sized against a monthly price");
});

test("checkout: monthly, never-paid accounts get the coupon; codes are not offered alongside it", () => {
  const route = read("src/app/api/premium/checkout/route.ts");
  assert.match(route, /introOfferEnabled\(\) && plan === "monthly" && !\(await hasEverPaid\(dbUser\?\.stripeCustomerId\)\)/);
  assert.match(route, /\.\.\.\(coupon \? \{ discounts: \[\{ coupon \}\] \} : \{ allow_promotion_codes: true \}\)/);
  // A coupon Stripe rejects (deleted in the dashboard, still cached on a warm
  // instance) retries once at full price instead of a 500 (2026-09-25 review).
  assert.match(route, /param\.startsWith\("discounts"\)[\s\S]*forgetIntroCoupons\(\);[\s\S]*sessionParams\(null\)/);
  assert.doesNotMatch(route, /^\s*allow_promotion_codes: true,\s*$/m, "never both — Stripe rejects the session");
  assert.match(route, /trial_period_days: PREMIUM_TRIAL_DAYS/);
});

test("the trial-ending email: never to a trial that already cancelled, and it quotes the intro charge", () => {
  const lib = read("src/lib/premium.ts");
  // A cancelling trial gets the no-charge email instead (tests/trial-retention.test.ts).
  assert.match(lib, /if \(subscriptionIsCancelling\(sub\)\) \{/);
  assert.match(lib, /const introAmountOff = coupon && isIntroCouponId\(coupon\.id\) \? coupon\.amount_off \?\? 0 : 0;/);
  assert.match(lib, /Math\.max\(0, price\.unit_amount - off\)/);
  assert.match(read("src/lib/email.ts"), /const charge = thenLabel \? `\$\{amountLabel\} \(then \$\{thenLabel\}\)` : amountLabel;/);
});

test("every surface that states the post-trial price states the intro too — each behind the switch", () => {
  // The intro copy stays wired (the env can re-arm it), but every piece of it
  // is gated on introOfferEnabled(), so with the default it renders nowhere.
  const block = read("src/components/TrialPriceBlock.tsx");
  assert.match(block, /tierIntroMonthlyAmount\(tier\)/);
  assert.match(block, /plan === "monthly" && introOfferEnabled\(\) && introEligible/);
  const cards = read("src/components/PremiumPricingCards.tsx");
  assert.match(cards, /data-intro-offer/);
  assert.match(cards, /effectiveCycle === "monthly" && introOfferEnabled\(\) && introEligible/);
  const start = read("src/app/premium/start/page.tsx");
  assert.match(start, /introPriceLine\(tier\)/);
  assert.match(start, /plan === "monthly" && introOfferEnabled\(\) && !paid/);
  assert.match(start, /We'll email you a day or two before you're charged/);
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /\.\.\.\(introOfferEnabled\(\)\s*\?\s*\[\s*\{\s*q: `What is the half-price offer\?`/);
  // The explainer is prose, so it can't follow the switch: it states the
  // default (no trial, no intro) and must be edited by hand to re-arm either.
  const article = read("src/lib/articles.ts");
  assert.match(article, /no free trial, no introductory price, just the price in the table/);
  assert.doesNotMatch(article, /\*\*\$\d+\.\d\d\/month for the first 3 months\*\*/, "no half-price row left in the pricing table");
});

test("a price change mid-intro swaps the coupon for the renewals left, and annual clears it", () => {
  // Stripe keeps a subscription's discount through a price change: Premium's
  // $5.00-off coupon on the $4.99 Plus price would bill $0.
  // Exact renewal counting (2026-09-25 review): sub created 1 Oct with a
  // 3-day trial, so the coupon ends 1 Jan and the discounted renewals are
  // 4 Oct, 4 Nov and 4 Dec. A switch must keep exactly the ones left.
  const sec = (iso: string) => Date.parse(iso) / 1000;
  const end = sec("2027-01-01T00:00:00Z");
  assert.equal(introRenewalsRemaining(sec("2026-11-04T00:00:00Z"), end), 2, "first paid month: Nov + Dec, not a rounded-up 3");
  assert.equal(introRenewalsRemaining(sec("2026-12-04T00:00:00Z"), end), 1);
  assert.equal(introRenewalsRemaining(sec("2027-01-04T00:00:00Z"), end), 0, "late third month: no 4th half-price invoice");
  // Chaining can't extend it: a switch the day before the end, next renewal after it.
  assert.equal(introRenewalsRemaining(sec("2027-01-04T00:00:00Z"), sec("2027-01-03T00:00:00Z")), 0);
  assert.equal(introRenewalsRemaining(sec("2026-10-04T00:00:00Z"), sec("2027-06-01T00:00:00Z")), 3, "capped at INTRO_MONTHS");
  assert.equal(introRenewalsRemaining(null, end), 0);
  assert.equal(isIntroCouponId("rc-intro-plus-250usd-3mo"), true);
  assert.equal(isIntroCouponId("SPRING25"), false, "someone else's promo code is left alone");
  const lib = read("src/lib/premium.ts");
  assert.match(lib, /if \(price\.recurring\?\.interval !== "month"\) return "";/, "annual target clears the intro");
  for (const [route, tier] of [["upgrade", '"premium"'], ["downgrade", '"plus"'], ["switch-to-annual", "tier"]]) {
    const src = read(`src/app/api/premium/${route}/route.ts`);
    assert.match(src, new RegExp(`const introDiscounts = await introDiscountsForPriceChange\\(sub, ${tier}, targetPriceId\\);`), route);
    assert.match(src, /\.\.\.\(introDiscounts !== undefined \? \{ discounts: introDiscounts \} : \{\}\)/, `${route}: in the same update call`);
  }
});
