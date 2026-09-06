import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PREMIUM_LIB = "src/lib/premium.ts";
const PAGE = "src/app/premium/page.tsx";
const SUBREAD = "src/app/api/premium/subscription/route.ts";

// ─────────────────────────────────────────────────────────────────────────────
// "we need to add more details for premium users, like premium until... etc"
// (2026-09-06). /premium's "already Premium" view used to say only "You're
// Premium" with no account detail at all — no renewal date, no plan, no way to
// tell a trial apart from a paid subscription.
//
// The trap this file guards against: THREE genuinely different account states
// (admin access, a real Stripe subscription, an admin-granted comp with no
// Stripe subscription behind it) collapsing into one generic "Premium until X"
// line that quietly lies for two of the three — an admin has no premiumUntil
// worth showing, and a comp grant has no renewal date to state because nothing
// is ever going to charge it.
// ─────────────────────────────────────────────────────────────────────────────

test("the account-detail read is a SEPARATE query from the annual-switch nudge's, and does not exclude trials", () => {
  // api/premium/subscription/route.ts deliberately restricts to status:"active"
  // — a trialing user hasn't paid and must never be pushed to switch plans. A
  // Premium user looking at their OWN account is just as often mid-trial, and
  // reusing that query here would make every trialist's card come back empty.
  const lib = codeOnly(read(PREMIUM_LIB));
  const fnAt = lib.indexOf("export async function getPremiumSubscriptionDetails(");
  assert.ok(fnAt >= 0, "expected getPremiumSubscriptionDetails to exist");
  const body = lib.slice(fnAt, fnAt + 1200);
  assert.match(body, /status:\s*"all"/, "must read every subscription status, not just active ones");
  assert.doesNotMatch(body, /status:\s*"active"\s*,\s*\n\s*limit/, "must not narrow the Stripe query to active-only the way the switch nudge does");

  // The two reads must stay genuinely separate functions, not one calling the
  // other — the switch nudge's active-only restriction is load-bearing for ITS
  // job and must never leak into this one by a later "de-duplicate" pass.
  const subread = read(SUBREAD);
  assert.ok(!subread.includes("getPremiumSubscriptionDetails"), "the annual-switch read must not delegate to this function");
});

test("a customer with no Stripe subscription at all returns null, not a guess", () => {
  const lib = codeOnly(read(PREMIUM_LIB));
  const fnAt = lib.indexOf("export async function getPremiumSubscriptionDetails(");
  const body = lib.slice(fnAt, fnAt + 1200);
  assert.match(body, /if \(!stripeCustomerId \|\| !stripeEnabled\(\)\) return null;/, "no customer id or Stripe disabled must short-circuit to null");
  assert.match(body, /if \(!sub\) return null;/, "no subscription object found must return null, not throw or fabricate one");
  assert.match(body, /catch/, "a Stripe API error must be caught rather than 500ing the page");
});

test("the returned shape carries what the page actually needs to tell trial, plan and renewal apart", () => {
  const lib = read(PREMIUM_LIB);
  const ifaceAt = lib.indexOf("export interface PremiumSubscriptionDetails");
  assert.ok(ifaceAt >= 0);
  const iface = lib.slice(ifaceAt, lib.indexOf("}", ifaceAt));
  assert.match(iface, /status:\s*Stripe\.Subscription\.Status/, "must carry the real Stripe status (trialing vs active vs canceled…)");
  assert.match(iface, /interval:\s*"month"\s*\|\s*"year"\s*\|\s*null/, "must carry the real billing interval");
  assert.match(iface, /cancelAtPeriodEnd:\s*boolean/, "must carry whether the sub is actually set to lapse");
  assert.match(iface, /currentPeriodEnd:\s*Date/, "must carry the real period-end date");
});

test("the page states three account states honestly, never blurring one into another", () => {
  const src = codeOnly(read(PAGE));
  const cardAt = src.indexOf("Your subscription");
  assert.ok(cardAt >= 0, "expected the account-detail card");
  const card = src.slice(cardAt, cardAt + 1800);

  // Admin: no billing at all, so no plan/renewal claim of any kind.
  assert.match(card, /isAdmin[\s\S]{0,80}Admin access/, "an admin must be told they're on admin access, not a fabricated plan");

  // Real subscription: trial vs plan, and — critically — a cancelled-but-still-
  // active sub must say it will NOT renew, not just print a date that reads as
  // a renewal by default.
  assert.match(card, /status === "trialing"/, "must distinguish a trial from a paid plan");
  assert.match(card, /cancelAtPeriodEnd/, "must check whether the subscription will actually renew");
  assert.match(card, /won&apos;t renew/, "a subscription set to lapse must say so explicitly, not just show a date");
  assert.match(card, /Renews/, "an auto-renewing subscription must say so explicitly, not just show a date");

  // Comp grant (no Stripe subscription behind the premiumUntil date at all):
  // states the date and NOTHING about a plan or renewal, since neither exists.
  const compBranch = card.slice(card.indexOf("user.premiumUntil"));
  assert.match(compBranch, /Premium until/, "a comp grant must still state its real expiry");
  assert.doesNotMatch(compBranch.slice(0, 120), /[Rr]enew|[Mm]onthly plan|[Aa]nnual plan/, "a comp grant must not claim a plan type or a renewal it doesn't have");
});

test("the account page's date format matches the admin page's for the same field", () => {
  // Same underlying User.premiumUntil field, read by two different audiences —
  // a user reading their own date and an admin reading it for that same account
  // must see the same format, or a support conversation about "it says X" vs
  // "the admin panel says Y" is really the same date typeset two ways.
  const page = read(PAGE);
  const admin = read("src/app/admin/premium/page.tsx");
  const fmtAt = page.indexOf("const fmtDate");
  assert.ok(fmtAt >= 0, "expected a fmtDate helper");
  assert.match(page.slice(fmtAt, fmtAt + 200), /toLocaleDateString\("en-AU",\s*\{\s*day:\s*"numeric",\s*month:\s*"short",\s*year:\s*"numeric"\s*\}\)/);
  assert.match(admin, /toLocaleDateString\("en-AU",\s*\{\s*day:\s*"numeric",\s*month:\s*"short",\s*year:\s*"numeric"\s*\}\)/, "admin/premium/page.tsx must use the same format this test pins");
});

test("the subscription card only ever queries Stripe for someone who is actually Premium right now", () => {
  const src = read(PAGE);
  const callAt = src.indexOf("getPremiumSubscriptionDetails(");
  assert.ok(callAt > 0);
  const before = src.slice(Math.max(0, callAt - 200), callAt);
  assert.match(before, /already\s*&&/, "must not fire the Stripe read for a non-Premium visitor");
});
