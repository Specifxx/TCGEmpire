import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_PERCENT_OFF,
  commissionCents,
  discountedAmount,
  normaliseAffiliateCode,
  parseAffiliateApplication,
} from "../src/lib/creator-affiliate-code";
import { buildCheckoutSessionParams, type CheckoutParamsInput } from "../src/lib/checkout-params";
import { promotionCodeIdsOf } from "../src/lib/creator-affiliate";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";
import { tierMonthlyAmount } from "../src/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// CREATOR CODES (2026-10-16, owner): a Riftbound creator applies at
// /creators/apply, the owner approves in /admin/affiliates, the creator's code
// gives subscribers 20% off, and every payment made with it records the
// creator's 20% commission. DECISIONS.md, "Creator codes: 20% off, 20% commission".
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the terms are 20% off and 20% commission", () => {
  assert.equal(AFFILIATE_PERCENT_OFF, 20);
  assert.equal(AFFILIATE_COMMISSION_PERCENT, 20);
});

test("codes are upper case letters and digits, 3 to 20 long", () => {
  assert.equal(normaliseAffiliateCode("specifix-20 "), "SPECIFIX20");
  assert.equal(normaliseAffiliateCode("ab"), null);
  assert.equal(normaliseAffiliateCode("x".repeat(21)), null);
  assert.equal(normaliseAffiliateCode(42), null);
});

test("commission is 20% of what was actually paid, rounded down; the discounted price reads like the real one", () => {
  assert.equal(commissionCents(399), 79);
  assert.equal(commissionCents(80), 16);
  assert.equal(commissionCents(0), 0);
  assert.equal(commissionCents(-5), 0);
  assert.equal(discountedAmount("$4.99"), "$3.99");
  assert.equal(discountedAmount("$2.99"), "$2.39");
  assert.equal(discountedAmount("$39.99"), "$31.99");
});

test("an application needs a name, a real email, a platform and a channel link", () => {
  const good = { name: "Sam", email: "Sam@Example.com", platform: "YouTube", channelUrl: "https://youtube.com/@sam", preferredCode: "sam tcg" };
  const ok = parseAffiliateApplication(good);
  assert.ok(ok.ok && !ok.spam);
  assert.ok(ok.ok && ok.data.email === "sam@example.com" && ok.data.preferredCode === "SAMTCG");
  assert.equal(parseAffiliateApplication({ ...good, email: "nope" }).ok, false);
  assert.equal(parseAffiliateApplication({ ...good, platform: "MySpace" }).ok, false);
  assert.equal(parseAffiliateApplication({ ...good, channelUrl: "youtube" }).ok, false);
  assert.equal(parseAffiliateApplication({ ...good, preferredCode: "!" }).ok, false);
  const spam = parseAffiliateApplication({ ...good, website: "http://spam" });
  assert.ok(spam.ok && spam.spam, "the honeypot");
});

const base: CheckoutParamsInput = {
  userId: "u1",
  email: "sam@example.com",
  stripeCustomerId: null,
  tier: "premium",
  plan: "monthly",
  priceId: "price_premium_test",
  currency: "usd",
  trial: { days: 30, feeCents: 100 },
  coupon: null,
  surface: null,
  back: null,
};

test("checkout with a code: the promotion code is the discount, and the code rides on the session AND the subscription", () => {
  const p = buildCheckoutSessionParams({ ...base, affiliate: { code: "SAM", percentOff: 20, discount: { promotion_code: "promo_1" } } });
  assert.deepEqual(p.discounts, [{ promotion_code: "promo_1" }]);
  assert.equal(p.allow_promotion_codes, undefined, "Stripe refuses both");
  assert.equal(p.metadata?.affiliateCode, "SAM");
  assert.equal(p.subscription_data?.metadata?.affiliateCode, "SAM", "every renewal is credited from the subscription");
  const message = (p.custom_text?.submit as { message?: string }).message ?? "";
  assert.ok(message.includes(`${discountedAmount(tierMonthlyAmount("premium"))}/month`), "the pay-button text quotes the discounted price");
});

test("the intro coupon keeps the one discount slot, and the creator is still credited", () => {
  const p = buildCheckoutSessionParams({ ...base, coupon: "intro_x", affiliate: { code: "SAM", percentOff: 20, discount: { promotion_code: "promo_1" } } });
  assert.deepEqual(p.discounts, [{ coupon: "intro_x" }]);
  assert.equal(p.subscription_data?.metadata?.affiliateCode, "SAM");
  const none = buildCheckoutSessionParams(base);
  assert.equal(none.allow_promotion_codes, true, "without a code, codes can still be typed at Stripe");
  assert.equal(none.metadata?.affiliateCode, undefined);
});

test("a code typed on Stripe's page is found by its promotion code id, in old and new payload shapes", () => {
  assert.deepEqual(promotionCodeIdsOf({ discount: { promotion_code: "promo_1" } }), ["promo_1"]);
  assert.deepEqual(promotionCodeIdsOf({ discounts: [{ promotion_code: { id: "promo_2" } }, "di_x"] }), ["promo_2"]);
  assert.deepEqual(promotionCodeIdsOf(null), []);
});

test("the webhook records use after entitlement, idempotently, and never fails the event over it", () => {
  const hook = read("src/app/api/marketplace/stripe/webhook/route.ts");
  assert.match(hook, /await premiumStarted\(session\);\s*await creatorReferral\(session, event\.id\);/);
  assert.match(hook, /await stampFromSubscription\(sub, eventId, customerIdOf\(invoice\)\);\s*await creatorCommission\(invoice, sub, eventId\);/);
  assert.match(hook, /async function creatorCommission[\s\S]*?try \{[\s\S]*?catch \(e\) \{\s*console\.error\(`\[affiliate\]/);
  const lib = read("src/lib/creator-affiliate.ts");
  assert.match(lib, /affiliateCommission\.createMany\(\{[\s\S]*skipDuplicates: true/, "one row per invoice, so retries and both invoice events are safe");
  assert.match(lib, /paid <= 0\) return "none"/, "a $0 trial invoice earns nothing");
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /stripeInvoiceId String\s+@unique/);
  assert.match(schema, /stripeSubscriptionId String\s+@unique/);
});

test("everything about creators and their earnings is private", () => {
  for (const m of ["Affiliate", "AffiliateApplication", "AffiliateReferral", "AffiliateCommission"]) {
    assert.ok(!(PUBLIC_MODELS as readonly string[]).includes(m), `${m} must never be exported publicly`);
  }
  const admin = read("src/app/api/admin/affiliates/route.ts");
  assert.match(admin, /if \(!\(keyOk \|\| user\?\.isAdmin\)\) return NextResponse\.json\(\{ error: "Not authorised" \}, \{ status: 404 \}\)/);
  assert.match(read("src/app/admin/affiliates/page.tsx"), /if \(!\(keyOk \|\| user\?\.isAdmin\)\) notFound\(\);/);
});

test("the public form is rate-limited, notifies the owner, and the share link remembers the code", () => {
  const apply = read("src/app/api/creator-codes/apply/route.ts");
  assert.match(apply, /rateLimit\(`creator-apply:/);
  assert.match(apply, /await notifyOwnerBounded\(\{\s*kind: "affiliate"/);
  const link = read("src/app/r/[code]/route.ts");
  assert.match(link, /res\.cookies\.set\(AFFILIATE_COOKIE, a\.code, \{\s*httpOnly: true/);
  assert.match(read("src/app/api/premium/checkout/route.ts"), /findActiveAffiliate\(cookies\(\)\.get\(AFFILIATE_COOKIE\)\?\.value \?\? body\?\.affiliateCode\)/);
  assert.match(read("src/app/premium/page.tsx"), /<CreatorCodeBox/);
});
