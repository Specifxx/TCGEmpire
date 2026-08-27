import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.match(code, /premiumAnnualEnabled\(\)/, "must refuse when annual billing isn't configured");
  assert.match(code, /PREMIUM_ANNUAL_PRICE_ID/, "must switch onto the annual price");
  assert.match(code, /getCurrentUser\(\)/, "must be authenticated");
  // Immediate, prorated charge — the whole point is annual up front.
  assert.match(code, /always_invoice/, "must bill the annual now (with proration), not defer it");
  // Idempotency guard: an already-annual sub must short-circuit, never re-charge.
  assert.match(code, /interval === "year"/, "must detect an already-annual subscription");
  assert.match(code, /already:\s*true/, "already-annual must return without updating");
});

test("the subscription read treats only PAID subs as switch candidates (trials excluded)", () => {
  const code = codeOnly(read(SUBREAD));
  assert.match(code, /status:\s*"active"/, "must look at active (paying) subscriptions");
  assert.doesNotMatch(code, /status:\s*"trialing"/, "a trialing user hasn't paid — must not be pushed to switch");
});

test("the nudge only ever targets a monthly, tenured, Premium subscriber", () => {
  const code = codeOnly(read(NUDGE));
  assert.match(code, /premium/, "gated on Premium (mirror image of the non-Premium slide-in)");
  assert.match(code, /interval !== "month"/, "must bail for anyone not on the monthly plan");
  assert.match(code, /MIN_MONTHS/, "must require some tenure before pitching a year up front");
  assert.match(code, /annualAvailable/, "must require annual to actually be purchasable");
});

test("the nudge is non-modal and capped hard", () => {
  const code = codeOnly(read(NUDGE));
  assert.match(code, /dataset\.rcDialog === "1"/, "must yield to any open modal");
  assert.doesNotMatch(code, /dataset\.rcDialog\s*=\s*["']1["']/, "a corner nudge must not claim the modal lock");
  assert.match(code, /MAX_DISMISSALS\s*=\s*2/, "two 'not now's is a permanent no");
  assert.match(code, /localStorage/, "the snooze/never-again state must outlive the session");
  // A successful switch must also stop it re-offering (they're annual now).
  assert.match(code, /invalidateMe\(\)/, "a successful switch must refresh cached session state");
});

test("its events are routed like the other high-volume nudges", () => {
  const code = read(NUDGE);
  for (const ev of ["annual_switch_shown", "annual_switch_click", "annual_switch_success", "annual_switch_dismissed"]) {
    assert.ok(code.includes(ev), `must fire ${ev}`);
  }
  const analytics = read("src/lib/analytics.ts");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS"), analytics.indexOf("export function trackEvent"));
  assert.ok(ga4Only.includes("annual_switch_shown"), "the impression is GA4-only");
  assert.ok(ga4Only.includes("annual_switch_dismissed"), "the dismiss is GA4-only");
  assert.ok(!ga4Only.includes("annual_switch_click"), "the click stays dual-tracked");
  assert.ok(!ga4Only.includes("annual_switch_success"), "the conversion stays dual-tracked");
});

test("it is mounted in the layout", () => {
  assert.match(read("src/app/layout.tsx"), /<AnnualSwitchNudge\s*\/>/, "must render in the layout");
});
