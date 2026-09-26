import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The 2026-09-26 price cut repoints STRIPE_PLUS_PRICE_ID /
// STRIPE_PLUS_ANNUAL_PRICE_ID at NEW Stripe Prices while existing subscribers
// stay on the OLD ones until the owner moves them at their next renewal.
// tierFromPriceId resolves any price it doesn't know as "premium", and the
// webhook re-stamps User.premiumTier from the price id on every event — so
// without STRIPE_PLUS_LEGACY_PRICE_IDS every old-price Plus subscriber would
// silently become Premium the next time Stripe spoke to us.
//
// The env lists are read once at import, so this file sets them BEFORE a
// dynamic import (node --test runs each file in its own process).
process.env.STRIPE_PLUS_PRICE_ID = "price_plus_new_month";
process.env.STRIPE_PLUS_ANNUAL_PRICE_ID = "price_plus_new_year";
process.env.STRIPE_PREMIUM_PRICE_ID = "price_premium_new_month";
process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID = "price_premium_new_year";
process.env.STRIPE_PLUS_LEGACY_PRICE_IDS = " price_plus_old_month , ,price_plus_old_year,";
process.env.STRIPE_PREMIUM_LEGACY_PRICE_IDS = "price_premium_old_month,price_premium_old_year";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("old and new Plus prices both resolve to Plus; old and new Premium prices to Premium", async () => {
  const m = await import("../src/lib/premium");
  assert.equal(m.tierFromPriceId("price_plus_new_month"), "plus");
  assert.equal(m.tierFromPriceId("price_plus_new_year"), "plus");
  assert.equal(m.tierFromPriceId("price_plus_old_month"), "plus", "a legacy Plus price must stay Plus");
  assert.equal(m.tierFromPriceId("price_plus_old_year"), "plus", "entries are trimmed");
  assert.equal(m.tierFromPriceId("price_premium_new_month"), "premium");
  assert.equal(m.tierFromPriceId("price_premium_old_month"), "premium");
  assert.equal(m.tierFromPriceId("price_something_else"), "premium", "unknown still grandfathers to premium");
  assert.equal(m.tierFromPriceId(""), "premium", "an empty list entry can never match an empty price id");
  assert.equal(m.tierFromPriceId(null), "premium");
  assert.deepEqual([...m.PLUS_LEGACY_PRICE_IDS], ["price_plus_old_month", "price_plus_old_year"], "trimmed, empties dropped");
  assert.equal(m.isLegacyPriceId("price_plus_old_month"), true);
  assert.equal(m.isLegacyPriceId("price_premium_old_year"), true);
  assert.equal(m.isLegacyPriceId("price_plus_new_month"), false);
  assert.equal(m.plusPriceIdsConfigured(), true);
});

test("plan changes target the NEW prices, whatever old price the subscriber is on", async () => {
  const m = await import("../src/lib/premium");
  assert.equal(m.priceIdFor("plus", "monthly"), "price_plus_new_month");
  assert.equal(m.priceIdFor("plus", "annual"), "price_plus_new_year");
  assert.equal(m.priceIdFor("premium", "monthly"), "price_premium_new_month");
  assert.equal(m.priceIdFor("premium", "annual"), "price_premium_new_year");
  // A legacy annual subscriber is "already annual" — never re-billed onto the
  // new yearly Price by switch-to-annual's always_invoice update.
  const route = read("src/app/api/premium/switch-to-annual/route.ts");
  assert.match(route, /if \(price\.id === targetPriceId \|\| price\.recurring\?\.interval === "year"\) \{/);
});

test("the admin metrics count subscribers still on a retired price", async () => {
  const { computeSubscriptionMetrics } = await import("../src/lib/subscription-metrics");
  const now = Date.parse("2026-10-01T00:00:00Z");
  const row = (priceId: string) => ({
    status: "active" as const,
    interval: "month" as const,
    unitAmount: 499,
    currency: "usd",
    createdMs: now - 40 * 86_400_000,
    canceledAtMs: null,
    endedAtMs: null,
    trialEndMs: null,
    priceId,
  });
  const m = computeSubscriptionMetrics(
    [row("price_plus_old_month"), row("price_plus_new_month"), row("price_premium_old_month"), row("price_premium_new_month")],
    now,
  );
  assert.equal(m.plusActive, 2, "the legacy Plus subscriber is counted as Plus");
  assert.equal(m.premiumActive, 2);
  assert.equal(m.legacyPriceActive, 2);
});

test("the tier-writing audit refuses to write tiers when it can't tell Plus from Premium", () => {
  const audit = read("scripts/audit-premium-vs-stripe.ts");
  assert.match(audit, /if \(liveTier !== storedTier && plusPriceIdsConfigured\(\)\) \{/);
  // And the maintenance steps that resolve tiers are handed the price ids.
  const yml = read(".github/workflows/maintenance.yml");
  for (const script of ["audit-premium-vs-stripe", "funnel-report", "trial-cancel-report", "diagnose-billing", "apply-intro-to-trialists"]) {
    const runAt = yml.indexOf(`run: npx tsx scripts/${script}.ts`);
    assert.ok(runAt > 0, script);
    const env = yml.slice(yml.lastIndexOf("env:", runAt), runAt);
    for (const v of ["STRIPE_PLUS_PRICE_ID", "STRIPE_PLUS_ANNUAL_PRICE_ID", "STRIPE_PLUS_LEGACY_PRICE_IDS"]) {
      assert.match(env, new RegExp(`${v}: \\$\\{\\{ secrets\\.${v} \\}\\}`), `${script} step must forward ${v}`);
    }
  }
});

test(".env.example documents both legacy lists", () => {
  const ex = read(".env.example");
  assert.match(ex, /# STRIPE_PLUS_LEGACY_PRICE_IDS=/);
  assert.match(ex, /# STRIPE_PREMIUM_LEGACY_PRICE_IDS=/);
});
