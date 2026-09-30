import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkoutTrialFacts,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  isTrialSubscription,
  trialCardVerdict,
} from "../src/lib/stripe-entitlement";

// The $1 first month changed what a trial CHECKOUT looks like to the webhook:
// it used to be payment_status "no_payment_required" with amount_total 0; it is
// now payment_status "paid" with amount_total 100, which is indistinguishable
// from an ordinary first payment. A trial is therefore recognised from the
// SUBSCRIPTION (status "trialing" / trial_end), never from the amount or the
// payment status (DECISIONS.md, "A $1 first month for both tiers", 2026-09-30).

const DAY = 86_400;
const NOW = Math.floor(Date.UTC(2026, 9, 1) / 1000);
const TRIAL_END = NOW + 30 * DAY;

// A session as Stripe delivers it for a $1 trial checkout: paid, 100 cents.
const trialSession = {
  id: "cs_trial",
  payment_status: "paid",
  amount_total: 100,
  metadata: { kind: "premium", userId: "u1", trial: "1", trialFeeCents: "100", tier: "plus" },
};
const trialingSub = {
  id: "sub_trial",
  status: "trialing",
  trial_start: NOW,
  trial_end: TRIAL_END,
  current_period_end: TRIAL_END,
  default_payment_method: { id: "pm_1", card: { fingerprint: "fp_abc" } },
  items: { data: [{ price: { id: "price_plus_test" } }] },
};
// A plain paid subscription: no trial anywhere.
const paidSession = { id: "cs_paid", payment_status: "paid", amount_total: 299, metadata: { kind: "premium", userId: "u2", trial: "0", tier: "plus" } };
const activeSub = {
  id: "sub_paid",
  status: "active",
  trial_end: null,
  current_period_end: NOW + 30 * DAY,
  default_payment_method: { id: "pm_2", card: { fingerprint: "fp_xyz" } },
  items: { data: [{ price: { id: "price_plus_test" } }] },
};

test("a $1 trial checkout (payment_status paid, amount_total 100, subscription trialing) is a trial, with its card fingerprint", () => {
  assert.deepEqual(checkoutTrialFacts(trialSession, trialingSub), { isTrial: true, fingerprint: "fp_abc" });
});

test("detection keys on the SUBSCRIPTION: a trialing sub is a trial whatever the session says", () => {
  // No metadata at all, and a session that looks exactly like a plain payment.
  assert.equal(checkoutTrialFacts({ payment_status: "paid", amount_total: 100, metadata: {} }, trialingSub).isTrial, true);
  assert.equal(checkoutTrialFacts({ payment_status: "paid", amount_total: 100, metadata: { trial: "0" } }, trialingSub).isTrial, true);
  // A trial the webhook reaches after it converted (status active, trial_end set) was still a trial.
  assert.equal(isTrialSubscription({ status: "active", trial_end: TRIAL_END - 1 }), true);
});

test("detection is NOT keyed on the amount or payment_status: a plain paid subscription is not a trial", () => {
  assert.deepEqual(checkoutTrialFacts(paidSession, activeSub), { isTrial: false, fingerprint: "fp_xyz" });
  // The old free-trial signature ($0, no_payment_required) on a NON-trial subscription is not a trial either.
  assert.equal(checkoutTrialFacts({ payment_status: "no_payment_required", amount_total: 0, metadata: { trial: "0" } }, activeSub).isTrial, false);
  // And a $100-cent amount on a plain subscription proves nothing.
  assert.equal(checkoutTrialFacts({ payment_status: "paid", amount_total: 100, metadata: {} }, activeSub).isTrial, false);
});

test("an intended trial whose first invoice is still settling (subscription incomplete) is still treated as a trial", () => {
  const settling = { ...trialingSub, status: "incomplete", trial_end: null };
  assert.equal(checkoutTrialFacts(trialSession, settling).isTrial, true, "checkout intended a trial");
  assert.equal(entitledUntilFromSubscription(settling), null, "and nothing is granted until the payment lands");
});

test("a trialing subscription entitles to the TRIAL END (day 30), through the extend-only rule", () => {
  const until = entitledUntilFromSubscription(trialingSub);
  assert.equal(until?.getTime(), TRIAL_END * 1000);
  // A brand-new account has no premiumUntil: the trial end is written.
  assert.equal(extendedPremiumUntil(null, until)?.getTime(), TRIAL_END * 1000);
  // The doctrine is intact: a longer comp grant is never clobbered by the trial's end…
  assert.equal(extendedPremiumUntil(new Date((TRIAL_END + 10 * DAY) * 1000), until), null);
  // …and replaying the same event changes nothing.
  assert.equal(extendedPremiumUntil(until, until), null);
});

test("cancelling during the trial keeps access to day 30: the sub stays trialing, and a cancelled sub never SHRINKS premiumUntil", () => {
  // The portal's cancel: cancel_at_period_end true, still trialing, same period end.
  const cancelling = { ...trialingSub, cancel_at_period_end: true };
  assert.equal(entitledUntilFromSubscription(cancelling)?.getTime(), TRIAL_END * 1000);
  // Even if Stripe ends the subscription at once ("cancel immediately" in the portal),
  // it earns nothing NEW (null) and, being extend-only, takes nothing away: the
  // premiumUntil written at checkout stays at day 30.
  const cancelled = { ...trialingSub, status: "canceled" };
  assert.equal(entitledUntilFromSubscription(cancelled), null);
  assert.equal(extendedPremiumUntil(new Date(TRIAL_END * 1000), entitledUntilFromSubscription(cancelled)), null);
});

test("the one-trial-per-card rule: TrialRedemption is recorded for a $1 trial, and a reused card is refused", () => {
  assert.equal(trialCardVerdict("fp_abc", null, "u1"), "record", "first sight of the card: write the TrialRedemption row");
  assert.equal(trialCardVerdict("fp_abc", "u1", "u1"), "known", "the same account's own card");
  assert.equal(trialCardVerdict("fp_abc", "someone-else", "u1"), "refuse", "another account already had a trial on this card");
  assert.equal(trialCardVerdict(null, null, "u1"), "skip");
});

test("the webhook route wires those pure decisions to the database, refunds a refused trial's $1, and stamps trialStartedAt", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/marketplace/stripe/webhook/route.ts"), "utf8");
  assert.match(src, /const \{ isTrial, fingerprint \} = checkoutTrialFacts\(session, sub\);/);
  assert.match(src, /trialCardVerdict\(fingerprint, seen\?\.userId, userId\)/);
  assert.match(src, /verdict === "record"[\s\S]{0,120}prisma\.trialRedemption\.create\(\{ data: \{ cardFingerprint: fingerprint, userId \} \}\)/);
  assert.match(src, /verdict === "refuse"[\s\S]{0,700}await refundTrialFee\(session\);/, "the $1 already charged goes back when the trial is refused");
  assert.match(src, /stripe\(\)\.refunds\.create\(\{ payment_intent: pi/);
  // No premium branch reads the amount or the payment status to decide "trial".
  const premiumPart = src
    .slice(src.indexOf("async function premiumStarted"), src.indexOf("// ── Store consulting"))
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(premiumPart, /amount_total|payment_status|no_payment_required/);
  // The grace path (subscription unreadable) still trusts only checkout's own stamp.
  assert.match(src, /intendedTrial \? PREMIUM_TRIAL_DAYS \|\| 3 : 32/);
});

test("stripe-reconcile and the entitlement statuses treat a trialing subscription as entitled, never as $0", () => {
  const rec = readFileSync(join(process.cwd(), "src/lib/stripe-reconcile.ts"), "utf8");
  assert.doesNotMatch(rec, /amount_total|payment_status|no_payment_required|amount_paid/, "reconcile keys on status and period end only");
  assert.equal(entitledUntilFromSubscription({ ...trialingSub, status: "past_due" }), null, "the churchless doctrine is unchanged");
});
