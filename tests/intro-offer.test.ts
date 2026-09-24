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
import { introCouponId, PREMIUM_TRIAL_DAYS, introMonthsRemaining, isIntroCouponId } from "../src/lib/premium";

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
  assert.match(route, /\.\.\.\(introCoupon \? \{ discounts: \[\{ coupon: introCoupon \}\] \} : \{ allow_promotion_codes: true \}\)/);
  assert.doesNotMatch(route, /^\s*allow_promotion_codes: true,\s*$/m, "never both — Stripe rejects the session");
  assert.match(route, /trial_period_days: PREMIUM_TRIAL_DAYS/);
});

test("the trial-ending email: never to a trial that already cancelled, and it quotes the intro charge", () => {
  const lib = read("src/lib/premium.ts");
  assert.match(lib, /if \(sub\?\.trial_end && !sub\.cancel_at_period_end\)/);
  assert.match(lib, /const off = sub\.discount\?\.coupon\?\.amount_off \?\? 0;/);
  assert.match(lib, /Math\.max\(0, price\.unit_amount - off\)/);
  assert.match(read("src/lib/email.ts"), /const charge = thenLabel \? `\$\{amountLabel\} \(then \$\{thenLabel\}\)` : amountLabel;/);
});

test("every surface that states the post-trial price states the intro too", () => {
  assert.match(read("src/components/TrialPriceBlock.tsx"), /tierIntroMonthlyAmount\(tier\)/);
  assert.match(read("src/components/PremiumPricingCards.tsx"), /data-intro-offer/);
  assert.match(read("src/app/premium/start/page.tsx"), /introPriceLine\(tier\)/);
  assert.match(read("src/app/premium/start/page.tsx"), /We'll email you the day before you're charged/);
  const page = read("src/app/premium/page.tsx");
  assert.match(page, /What is the half-price offer\?/);
  assert.match(read("src/lib/articles.ts"), /\| Premium, monthly \| \$9\.99\/month \(\*\*\$4\.99\/month for the first 3 months\*\*\)/);
});

test("a price change mid-intro swaps the coupon for the months left, and annual clears it", () => {
  // Stripe keeps a subscription's discount through a price change: Premium's
  // $5.00-off coupon on the $4.99 Plus price would bill $0.
  const now = Date.parse("2026-10-01T00:00:00Z");
  const sec = (iso: string) => Date.parse(iso) / 1000;
  assert.equal(introMonthsRemaining(sec("2026-12-28T00:00:00Z"), now), 3);
  assert.equal(introMonthsRemaining(sec("2026-11-15T00:00:00Z"), now), 2, "rounded up, never a fresh three");
  assert.equal(introMonthsRemaining(sec("2026-09-30T00:00:00Z"), now), 0, "window over");
  assert.equal(introMonthsRemaining(null, now), 0);
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
