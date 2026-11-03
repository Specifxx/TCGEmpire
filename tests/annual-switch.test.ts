import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SWITCH = "src/app/api/premium/switch-to-annual/route.ts";
const SUBREAD = "src/app/api/premium/subscription/route.ts";
const NUDGE = "src/components/AnnualSwitchNudge.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// The annual-switch retention flow touches billing, so its guarantees are the
// kind that cost real money if they slip: double-charging, switching the wrong
// user, or nagging people who already said no.
// ─────────────────────────────────────────────────────────────────────────────

test("the switch endpoint charges once, upfront, and never double-bills an annual sub", () => {
  const code = codeOnly(read(SWITCH));
  assert.match(code, /premiumAnnualEnabled\(\)/, "must refuse when Pro annual billing isn't configured");
  assert.match(code, /plusAnnualEnabled\(\)/, "must also know about Plus's own annual billing");
  assert.match(code, /priceIdFor\(tier,\s*"annual"\)/, "must switch onto the target tier's annual price");
  assert.match(code, /getCurrentUser\(\)/, "must be authenticated");
  // Immediate, prorated charge — the whole point is annual up front.
  assert.match(code, /always_invoice/, "must bill the annual now (with proration), not defer it");
  // Idempotency guard is PRICE-based, not interval-based: an interval-only
  // check would let a same-interval tier switch (Plus monthly → Premium
  // monthly) slip past it undetected. An already-annual sub on the same
  // tier must still short-circuit, never re-charge.
  assert.match(code, /price\.id === targetPriceId/, "must detect an already-annual subscription by price id, not interval");
  assert.match(code, /already:\s*true/, "already-annual must return without updating");
});

test("the subscription read treats only PAID subs as switch candidates (trials excluded)", () => {
  const code = codeOnly(read(SUBREAD));
  assert.match(code, /status:\s*"active"/, "must look at active (paying) subscriptions");
  assert.doesNotMatch(code, /status:\s*"trialing"/, "a trialing user hasn't paid — must not be pushed to switch");
});

// The header's Pricing callout (PricingNudge) and the monthly→annual corner
// card (AnnualSwitchNudge) went on 2026-11-03 (owner: "get rid of all the
// sliders regarding the premium and the signups. People can do it if they
// want to"). No uninvited Pro or sign-up prompt exists any more.
test("the corner nudge is gone; the switch stays available on /premium and the account page", () => {
  assert.ok(!existsSync(join(process.cwd(), NUDGE)), "AnnualSwitchNudge.tsx was removed on 2026-11-03");
  assert.doesNotMatch(read("src/app/layout.tsx"), /<AnnualSwitchNudge\s*\/>/, "not mounted");
  const analytics = read("src/lib/analytics.ts");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS"), analytics.indexOf("export function trackEvent"));
  assert.ok(!ga4Only.includes("annual_switch_click"), "the switch click stays dual-tracked");
});
