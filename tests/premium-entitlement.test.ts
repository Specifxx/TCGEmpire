import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  subscriptionIdFromInvoice,
  periodEndFromSubscription,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  userIdFromSubscription,
  customerIdOf,
} from "../src/lib/stripe-entitlement";

// ─────────────────────────────────────────────────────────────────────────────
// Premium entitlement — the Stripe parsing that the Naron incident (Aug 2026)
// proved silently breakable.
//
// A trial converted to a paid year on Stripe while the site kept showing the
// account lapsed, because the webhook read `invoice.subscription` — a field
// Stripe REMOVED from webhook payloads in API version 2025-03-31 ("basil"),
// where it moved to invoice.parent.subscription_details. Webhook payload shape
// follows the DASHBOARD-configured endpoint version, not the SDK pin, so the
// code must parse both generations forever. These tests pin that, the
// extend-only stamping rule, and the wiring (events handled, cron registered)
// at source level, DB-free.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Source-text assertions are about EMITTED CODE, not prose: the webhook's own
// comments name the removed Stripe fields to explain the hazard, and those
// comments must not trip the very check that enforces avoiding the fields —
// same convention as tests/deck-seo.test.ts.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments, but not the // in https://

// ── Subscription id from an invoice, across payload generations ─────────────

test("acacia invoices: subscription as string and as expanded object", () => {
  assert.equal(subscriptionIdFromInvoice({ subscription: "sub_123" }), "sub_123");
  assert.equal(subscriptionIdFromInvoice({ subscription: { id: "sub_123" } }), "sub_123");
});

test("basil invoices: subscription under parent.subscription_details", () => {
  assert.equal(
    subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_b1" } } }),
    "sub_b1"
  );
  assert.equal(
    subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: { id: "sub_b1" } } } }),
    "sub_b1"
  );
});

test("line-item fallbacks: line.subscription and basil line.parent shapes", () => {
  assert.equal(
    subscriptionIdFromInvoice({ lines: { data: [{ subscription: "sub_l1" }] } }),
    "sub_l1"
  );
  assert.equal(
    subscriptionIdFromInvoice({
      lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_l2" } } }] },
    }),
    "sub_l2"
  );
  assert.equal(
    subscriptionIdFromInvoice({
      lines: { data: [{}, { parent: { subscription_details: { subscription: "sub_l3" } } }] },
    }),
    "sub_l3"
  );
});

test("a genuine one-off (non-subscription) invoice resolves to null", () => {
  assert.equal(subscriptionIdFromInvoice({ id: "in_1", lines: { data: [{}] } }), null);
  assert.equal(subscriptionIdFromInvoice(null), null);
  assert.equal(subscriptionIdFromInvoice("in_1"), null);
});

// ── Period end, across payload generations ──────────────────────────────────

const T1 = 1_766_000_000; // arbitrary epoch seconds
const T2 = 1_797_536_000; // ~a year later

test("acacia subscriptions: top-level current_period_end", () => {
  assert.equal(periodEndFromSubscription({ current_period_end: T1 })?.getTime(), T1 * 1000);
});

test("basil subscriptions: current_period_end moved to items — latest wins", () => {
  const sub = { items: { data: [{ current_period_end: T1 }, { current_period_end: T2 }] } };
  assert.equal(periodEndFromSubscription(sub)?.getTime(), T2 * 1000);
});

test("junk period ends (0, NaN, missing) resolve to null, never Invalid Date", () => {
  assert.equal(periodEndFromSubscription({ current_period_end: 0 }), null);
  assert.equal(periodEndFromSubscription({ current_period_end: "soon" }), null);
  assert.equal(periodEndFromSubscription({}), null);
  assert.equal(periodEndFromSubscription(null), null);
});

// ── Entitlement by status ───────────────────────────────────────────────────

test("active, trialing and past_due entitle through the period end", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    const until = entitledUntilFromSubscription({ status, current_period_end: T1 });
    assert.equal(until?.getTime(), T1 * 1000, `${status} must entitle`);
  }
});

test("canceled/unpaid/incomplete subscriptions entitle nothing new", () => {
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", ""]) {
    assert.equal(entitledUntilFromSubscription({ status, current_period_end: T1 }), null, `${status} must not entitle`);
  }
});

// ── Extend-only stamping — the anti-clobber rule ────────────────────────────

test("a renewal extends a shorter or absent entitlement", () => {
  const entitled = new Date("2027-08-18T00:00:00Z");
  assert.equal(extendedPremiumUntil(null, entitled)?.getTime(), entitled.getTime());
  assert.equal(extendedPremiumUntil(new Date("2026-08-18T00:00:00Z"), entitled)?.getTime(), entitled.getTime());
});

test("a renewal can never shorten a longer comp grant (the clobber bug)", () => {
  // A monthly renewal's period end must not shrink an admin/reward grant that
  // reaches further — before extend-only stamping, it silently did.
  const granted = new Date("2027-12-31T00:00:00Z");
  const monthly = new Date("2026-09-18T00:00:00Z");
  assert.equal(extendedPremiumUntil(granted, monthly), null);
  assert.equal(extendedPremiumUntil(granted, granted), null, "equal dates are a no-op");
  assert.equal(extendedPremiumUntil(granted, null), null);
});

// ── Small resolvers ─────────────────────────────────────────────────────────

test("userId and customer resolve from either string or object shapes", () => {
  assert.equal(userIdFromSubscription({ metadata: { userId: "u1" } }), "u1");
  assert.equal(userIdFromSubscription({ metadata: {} }), null);
  assert.equal(customerIdOf({ customer: "cus_1" }), "cus_1");
  assert.equal(customerIdOf({ customer: { id: "cus_1" } }), "cus_1");
  assert.equal(customerIdOf({}), null);
});

// ── Wiring pins (source-level) ──────────────────────────────────────────────

test("the webhook handles both invoice events and subscription lifecycle events", () => {
  const src = read("src/app/api/marketplace/stripe/webhook/route.ts");
  for (const evt of [
    '"invoice.paid"',
    '"invoice.payment_succeeded"',
    '"customer.subscription.created"',
    '"customer.subscription.updated"',
  ]) {
    assert.ok(src.includes(`case ${evt}`), `webhook must handle ${evt}`);
  }
});

test("the webhook never reads version-fragile Stripe fields directly", () => {
  const src = code("src/app/api/marketplace/stripe/webhook/route.ts");
  // Both fields moved in Stripe API 2025-03-31 (basil); payload shape follows
  // the Dashboard endpoint version, so only lib/stripe-entitlement.ts may
  // touch them (with both-generation fallbacks).
  assert.ok(!src.includes("invoice.subscription"), "read the sub id via subscriptionIdFromInvoice");
  assert.ok(!src.includes(".current_period_end"), "read period ends via the entitlement helpers");
  assert.ok(src.includes("extendedPremiumUntil"), "stamping must be extend-only");
});

test("every entitlement write path is extend-only or stacking — none overwrite blindly", () => {
  const webhook = read("src/app/api/marketplace/stripe/webhook/route.ts");
  const reconcile = read("src/app/api/cron/stripe-reconcile/route.ts");
  for (const [name, src] of [["webhook", webhook], ["reconcile", reconcile]] as const) {
    assert.ok(src.includes("extendedPremiumUntil"), `${name} must stamp via extendedPremiumUntil`);
  }
});

test("the daily Stripe reconcile cron is registered in vercel.json", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const cron = (vercel.crons as { path: string; schedule: string }[]).find(
    (c) => c.path === "/api/cron/stripe-reconcile"
  );
  assert.ok(cron, "stripe-reconcile must be scheduled — it is the safety net under the webhook");
  assert.match(cron!.schedule, /^\S+ \S+ \* \* \*$/, "must run daily");
});

test("the reconcile route guards with CRON_SECRET like its siblings", () => {
  const src = read("src/app/api/cron/stripe-reconcile/route.ts");
  assert.ok(src.includes("CRON_SECRET"));
  assert.ok(src.includes("Bearer"));
});

test("the admin grant endpoint exists, is gated, and bounds its input", () => {
  const src = read("src/app/api/admin/grant-premium/route.ts");
  assert.ok(src.includes("isAdmin"), "must accept a logged-in admin");
  assert.ok(src.includes("ADMIN_TOKEN"), "must accept the key link, like other admin mutations");
  assert.ok(src.includes("grantPremiumDays"), "must stack via the shared grant helper, not write premiumUntil directly");
  assert.match(src, /MAX_DAYS/, "must cap days as a typo guard");
});
