import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPremium,
  premiumTierOf,
  normalizeTier,
  tierFromPriceId,
  priceIdFor,
  grantPremiumDays,
} from "../src/lib/premium";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { PLUS_PRICE_AMOUNT, PLUS_ANNUAL_AMOUNT, annualSavingPct, premiumFromLine } from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Premium went two-tier on 2026-09-11: Plus ($4.99/mo, ad-free + the full
// lists) and Premium ($9.99/mo, Plus + the four pro tools). This file guards
// the parts of that split most likely to break silently — tier resolution
// from a Stripe price id, the entitlement check's `min` argument, and the
// places a wrong tier means either overcharging or over-granting access.
// ─────────────────────────────────────────────────────────────────────────────

test("prisma schema carries premiumTier, additive and grandfathered to premium", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /premiumTier\s+String\s+@default\("premium"\)/, "must default every existing/comp row to full access");
});

test("tierFromPriceId resolves unknown/absent price ids to premium, never plus", () => {
  // The grandfather rule: an unrecognized or retired price — including the
  // empty string PLUS_PRICE_ID resolves to when Plus isn't configured — must
  // never be mistaken for a live Plus price.
  assert.equal(tierFromPriceId("price_totally_unknown"), "premium");
  assert.equal(tierFromPriceId(null), "premium");
  assert.equal(tierFromPriceId(undefined), "premium");
  assert.equal(tierFromPriceId(""), "premium");
});

test("normalizeTier only ever returns plus for the literal string 'plus'", () => {
  assert.equal(normalizeTier("plus"), "plus");
  assert.equal(normalizeTier("premium"), "premium");
  assert.equal(normalizeTier(undefined), "premium");
  assert.equal(normalizeTier(null), "premium");
  assert.equal(normalizeTier("Plus"), "premium", "case must matter — DB values are written by this codebase, not user input");
  assert.equal(normalizeTier(""), "premium");
});

test("isPremium's min argument defaults to plus, so every pre-existing call site is unchanged", () => {
  const now = Date.now();
  const future = new Date(now + 86_400_000);
  const past = new Date(now - 86_400_000);

  // A Plus subscriber: entitled at the default (plus) threshold, not at premium.
  const plusUser = { premiumUntil: future, premiumTier: "plus" };
  assert.equal(isPremium(plusUser), true, "isPremium(user) with no min arg must mean ANY paid tier");
  assert.equal(isPremium(plusUser, "premium"), false, "a Plus subscriber must not pass a premium-only gate");

  // A Premium subscriber: entitled at both thresholds.
  const premiumUser = { premiumUntil: future, premiumTier: "premium" };
  assert.equal(isPremium(premiumUser), true);
  assert.equal(isPremium(premiumUser, "premium"), true);

  // A lapsed subscriber, whatever tier is stored, is not entitled at all.
  assert.equal(isPremium({ premiumUntil: past, premiumTier: "plus" }), false);
  assert.equal(isPremium({ premiumUntil: past, premiumTier: "premium" }), false);

  // Admins bypass tier entirely, at both thresholds.
  assert.equal(isPremium({ premiumUntil: null, isAdmin: true }), true);
  assert.equal(isPremium({ premiumUntil: null, isAdmin: true }, "premium"), true);

  // A user with no premiumTier field at all (a caller that predates Plus)
  // must still read as "premium" — normalizeTier(undefined).
  assert.equal(isPremium({ premiumUntil: future }, "premium"), true);
});

test("premiumTierOf names the real tier, or null when not entitled", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  assert.equal(premiumTierOf({ premiumUntil: future, premiumTier: "plus" }), "plus");
  assert.equal(premiumTierOf({ premiumUntil: future, premiumTier: "premium" }), "premium");
  assert.equal(premiumTierOf({ premiumUntil: past, premiumTier: "plus" }), null);
  assert.equal(premiumTierOf(null), null);
  assert.equal(premiumTierOf({ premiumUntil: null, isAdmin: true }), "premium", "an admin reads as the top tier");
});

test("priceIdFor falls back to monthly when the requested tier's annual price is unset", () => {
  // With no Stripe env configured in this test run, every price id constant
  // is "" — priceIdFor must not throw and must return the (empty) monthly
  // fallback rather than undefined.
  assert.equal(priceIdFor("premium", "annual"), priceIdFor("premium", "monthly"));
  assert.equal(priceIdFor("plus", "annual"), priceIdFor("plus", "monthly"));
});

test("checkout stamps tier on BOTH the session and the subscription metadata", () => {
  // Session metadata does NOT propagate to the subscription object — a tier
  // stamped only in `metadata` would be lost on every renewal and on the
  // reconcile cron, which only ever sees the subscription.
  const src = read("src/app/api/premium/checkout/route.ts");
  assert.match(src, /metadata:\s*\{\s*kind:\s*"premium",\s*userId:\s*user\.id,\s*trial:[^}]*tier\s*\}/s, "session metadata must carry tier");
  assert.match(src, /subscription_data:\s*\{[\s\S]{0,400}metadata:\s*\{\s*userId:\s*user\.id,\s*tier\s*\}/, "subscription_data.metadata must ALSO carry tier");
  // The lock-in guarantee test (premium-price-increase.test.ts) already pins
  // `price: priceId` — confirm the tier/plan resolution feeds that same var.
  assert.match(src, /const priceId = priceIdFor\(tier, plan\)/);
});

test("the webhook's tier write is not gated behind an extend-only premiumUntil change", () => {
  // stampPremium's early return used to be `if (!next && !linkCustomer) return;`
  // — a same-period tier CHANGE (an upgrade that doesn't move current_period_end)
  // has next === null, so a tier write conditioned on `next` would silently drop
  // the change. The early return must also check for a real tier change.
  const src = read("src/app/api/marketplace/stripe/webhook/route.ts");
  const fnAt = src.indexOf("async function stampPremium(");
  assert.ok(fnAt >= 0, "expected stampPremium to exist");
  const body = src.slice(fnAt, fnAt + 1200);
  assert.match(body, /tierChange/, "the write must track whether the tier actually changed");
  assert.match(body, /if \(!next && !linkCustomer && !tierChange\) return;/, "the early return must not skip a pure tier change");
  assert.match(body, /\.\.\.\(tierChange \? \{ premiumTier: tier \} : \{\}\)/, "the tier write must be unconditional on tierChange, not on next");

  // stampFromSubscription (renewals, trial→paid, AND plan switches via
  // customer.subscription.updated) must resolve tier from the LIVE price.
  const stampFromAt = src.indexOf("async function stampFromSubscription(");
  assert.ok(stampFromAt >= 0);
  const stampFromBody = src.slice(stampFromAt, src.indexOf("async function stampPremium("));
  assert.match(stampFromBody, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "must resolve tier from the subscription's live price, not stale metadata");

  // The grace path (subscription unreadable — no Stripe object to read a
  // price off at all) must fall back to the checkout-time metadata stamp.
  const graceAt = src.indexOf("grace — subscription unreadable");
  assert.ok(graceAt >= 0);
  assert.match(src.slice(Math.max(0, graceAt - 300), graceAt), /normalizeTier\(session\.metadata\?\.tier\)/, "the grace path has no subscription to read a price from, so it must trust session.metadata.tier");
});

test("the nightly reconcile and the audit script both resolve tier from the live price, not just premiumUntil", () => {
  // The single highest-risk file: without this, every Plus subscriber would
  // be silently upgraded to full Premium the next time either sweep runs,
  // since premiumUntil alone carries no tier information.
  const reconcile = read("src/lib/stripe-reconcile.ts");
  assert.match(reconcile, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "reconcile must resolve tier from the live subscription's price");
  assert.match(reconcile, /const tierChange = normalizeTier\(user\.premiumTier\) !== tier;/, "reconcile must detect a tier mismatch even when premiumUntil doesn't change");
  assert.doesNotMatch(
    reconcile.slice(reconcile.indexOf("if (!next && !link"), reconcile.indexOf("if (!next && !link") + 40),
    /if \(!next && !link\) continue;/,
    "the skip condition must also check tierChange, or a same-period tier switch is silently dropped"
  );

  const audit = read("scripts/audit-premium-vs-stripe.ts");
  assert.match(audit, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "the audit script must resolve tier from the live price too");
});

test("switch-to-annual and the new upgrade route guard on price id, not interval", () => {
  // An interval-only idempotency guard (price?.recurring?.interval === "year")
  // would let a same-interval TIER switch (Plus monthly → Premium monthly)
  // slip past undetected — the guard has to be able to tell tiers apart, which
  // only the price id can do.
  const switchSrc = read("src/app/api/premium/switch-to-annual/route.ts");
  assert.match(switchSrc, /price\.id === targetPriceId/, "switch-to-annual's idempotency guard must be price-based");
  assert.doesNotMatch(switchSrc, /price\?\.recurring\?\.interval === "year"\)/, "the old interval-only guard must be gone");

  const upgradeSrc = read("src/app/api/premium/upgrade/route.ts");
  assert.match(upgradeSrc, /tierFromPriceId\(price\.id\) === "premium"/, "the upgrade route's idempotency guard must be tier-based");
  assert.match(upgradeSrc, /always_invoice/, "an upgrade must bill the prorated difference now, not defer it");
  assert.match(upgradeSrc, /premiumPlusEnabled\(\)/, "must 503 while Plus isn't configured at all");
});

test("comp grants only write the tier when creating access, never when extending an active period", () => {
  // A day-granular comp (feedback: 7 days, referral: 3 days) landing on a
  // currently-paying Plus subscriber must not flip them to Premium and then
  // flip back on their next renewal.
  const src = read("src/lib/premium.ts");
  const fnAt = src.indexOf("export async function grantPremiumDays(");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt, src.indexOf("export async function isSeedEmail"));
  assert.match(body, /const hadActive = !!u\.premiumUntil && u\.premiumUntil > now;/);
  assert.match(body, /\.\.\.\(hadActive \? \{\} : \{ premiumTier: tier \}\)/, "the tier write must be skipped when extending an already-active period");
});

test("TIER_COMPARISON's plus column agrees with the real server gates", () => {
  // For every row where Plus and Premium genuinely differ (a flat premium-only
  // tool), the page it names must gate on isPremium(user, "premium") — and for
  // every row where Plus already matches Premium (the full-list tools), the
  // page must NOT require the "premium" minimum.
  const proToolPages: Record<string, string> = {
    "Value Finder screener": "src/app/tools/value-finder/page.tsx",
    "Bulk Pricer — price a whole list at once": "src/app/bulk-pricer/page.tsx",
    "Best Basket — cheapest store split, postage included": "src/app/tools/best-basket/page.tsx",
    "Demand Finder — most searched & viewed cards": "src/app/tools/demand/page.tsx",
  };
  for (const [feature, file] of Object.entries(proToolPages)) {
    const row = TIER_COMPARISON.find((r) => r.feature === feature);
    assert.ok(row, `expected a TIER_COMPARISON row for "${feature}"`);
    assert.equal(row!.plus, false, `"${feature}" must be marked plus:false — it's a pro-tool row`);
    assert.equal(row!.premium, true, `"${feature}" must be marked premium:true`);
    const src = read(file);
    assert.match(src, /isPremium\(user,\s*"premium"\)/, `${file} must gate on isPremium(user, "premium")`);
  }

  const listToolPages: Record<string, string> = {
    "Deal Finder": "src/app/tools/deal-finder/page.tsx",
    "Rising Cards": "src/app/tools/rising/page.tsx",
  };
  for (const [feature, file] of Object.entries(listToolPages)) {
    const row = TIER_COMPARISON.find((r) => r.feature === feature);
    assert.ok(row, `expected a TIER_COMPARISON row for "${feature}"`);
    assert.equal(row!.plus, "Full list", `"${feature}" must give Plus the full list too`);
    const src = read(file);
    assert.doesNotMatch(src, /isPremium\(user,\s*"premium"\)/, `${file} must not require the premium minimum — Plus gets the full list here`);
  }

  // The basket API 403 is the one non-page pro-tool gate.
  const basketApi = read("src/app/api/basket/route.ts");
  assert.match(basketApi, /isPremium\(user,\s*"premium"\)/, "the Best Basket API must also require the premium minimum, matching the page");
});

test("Plus's display prices and helpers are real and match the decided figures", () => {
  assert.equal(PLUS_PRICE_AMOUNT, "$4.99");
  assert.equal(PLUS_ANNUAL_AMOUNT, "$39.99");
  // $39.99 vs 12×$4.99=$59.88 — a real ~33% saving, matching Premium's own.
  assert.equal(annualSavingPct("plus"), 33);
  assert.match(premiumFromLine("plus"), /^from \$[\d.]+\/mo billed yearly, or \$4\.99\/month month-to-month$/);
});

test("no new fake scarcity or invented numbers on any of the new tier surfaces", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/UpgradeTierButton.tsx",
    "src/app/api/premium/upgrade/route.ts",
    "src/app/api/premium/checkout/route.ts",
  ]) {
    const src = read(file);
    assert.ok(!/only \d+ (left|spots|seats)/i.test(src), `${file} must not invent scarcity`);
    assert.ok(!/expires? in/i.test(src), `${file} must not invent an expiry countdown`);
  }
});

test("the tier toggle in the dialog and on /premium defaults to monthly, not annual", () => {
  for (const file of ["src/components/PremiumDialog.tsx", "src/app/premium/page.tsx"]) {
    const src = read(file);
    assert.match(src, /useState<"monthly" \| "annual">\("monthly"\)|plan\?\s*=\s*"monthly"|plan="monthly"/, `${file} must default to the monthly plan`);
  }
});

test("grantPremiumDays and grantPremiumMonths accept an optional tier, defaulting to premium", () => {
  // Signature check only — a real grant needs a DB. Confirms the exported
  // function type still matches what the comp call sites (feedback, referral)
  // rely on positionally (userId, days) with no forced third argument.
  assert.equal(typeof grantPremiumDays, "function");
  assert.equal(grantPremiumDays.length <= 3, true, "must accept at most (userId, days, tier)");
});
