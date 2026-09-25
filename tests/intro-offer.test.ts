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
} from "../src/lib/site";
import { introCouponId, PREMIUM_TRIAL_DAYS, introRenewalsRemaining, isIntroCouponId } from "../src/lib/premium";

// Owner's call, 2026-09-24: a 3-day trial, then the first 3 months half price,
// for Plus and Premium. DECISIONS.md, "Trial model: 3-day trial, then the
// first 3 months half price".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("half price is the price's cents halved, rounded so the charge rounds down", () => {
  assert.equal(introAmountOffCents(999), 500);
  assert.equal(999 - introAmountOffCents(999), 499, "Premium $9.99 → $4.99");
  assert.equal(introAmountOffCents(499), 250);
  assert.equal(499 - introAmountOffCents(499), 249, "Plus $4.99 → $2.49");
  assert.equal(tierIntroMonthlyAmount("premium"), "$4.99");
  assert.equal(tierIntroMonthlyAmount("plus"), "$2.49");
  assert.equal(introPriceLine("premium"), "$4.99/mo for your first 3 months, then $9.99/mo");
  assert.equal(INTRO_MONTHS, 3);
  assert.equal(introOfferEnabled(), true, "on unless NEXT_PUBLIC_PREMIUM_INTRO_OFFER=0");
});

test("the trial defaults to 3 days", () => {
  assert.equal(PREMIUM_TRIAL_DAYS, 3);
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

test("every surface that states the post-trial price states the intro too", () => {
  assert.match(read("src/components/TrialPriceBlock.tsx"), /tierIntroMonthlyAmount\(tier\)/);
  assert.match(read("src/components/PremiumPricingCards.tsx"), /data-intro-offer/);
  assert.match(read("src/app/premium/start/page.tsx"), /introPriceLine\(tier\)/);
  assert.match(read("src/app/premium/start/page.tsx"), /We'll email you a day or two before you're charged/);
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /What is the half-price offer\?/);
  assert.match(read("src/lib/articles.ts"), /\| Premium, monthly \| \$9\.99\/month \(\*\*\$4\.99\/month for the first 3 months\*\*\)/);
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
