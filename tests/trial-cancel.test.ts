import test from "node:test";
import assert from "node:assert/strict";
import { classifyTrial, cancelBucket, type TrialRow } from "../src/lib/trial-cancel";

// DECISIONS.md, "Trial cancellations: measure the cancel click, not the end
// date", 2026-09-24.

const H = 3_600_000;
const START = Date.parse("2026-09-10T00:00:00Z");
const NOW = Date.parse("2026-09-24T12:00:00Z");
const base: TrialRow = {
  status: "trialing", trialStartMs: START, trialEndMs: START + 14 * 24 * H, cancelAtPeriodEnd: false,
  canceledAtMs: null, endedAtMs: null, reason: null, feedback: null, comment: null, tier: "premium",
  interval: "month", surface: null, matchedUser: true, accountAgeDaysAtTrial: 0, signupSource: null,
  activeDays: 1, alerts: 0, collectionCards: 0, reminderSentMs: null,
};

test("a trial cancelled in the portal counts as cancelled while Stripe still says trialing", () => {
  const c = classifyTrial({ ...base, trialEndMs: NOW + 5 * 24 * H, cancelAtPeriodEnd: true, canceledAtMs: START + 0.5 * H }, NOW);
  assert.equal(c.outcome, "cancelled_in_trial", "the blind spot funnel-report had");
  assert.equal(c.hoursToCancel, 0.5);
  assert.equal(cancelBucket(c.hoursToCancel), "< 1 hour");
});

test("ended-in-trial, converted, churned later, still trialing, payment failed", () => {
  const trialEnd = START + 14 * 24 * H;
  assert.equal(classifyTrial({ ...base, status: "canceled", canceledAtMs: START + 50 * H, endedAtMs: trialEnd }, NOW).outcome, "cancelled_in_trial");
  assert.equal(classifyTrial({ ...base, status: "active" }, NOW).outcome, "converted");
  assert.equal(
    classifyTrial({ ...base, status: "canceled", canceledAtMs: trialEnd + 5 * 24 * H, endedAtMs: trialEnd + 30 * 24 * H }, NOW + 40 * 24 * H).outcome,
    "churned_after_paying",
  );
  assert.equal(
    classifyTrial(
      { ...base, status: "canceled", cancelAtPeriodEnd: true, canceledAtMs: trialEnd + 5 * 24 * H, endedAtMs: trialEnd + 30 * 24 * H },
      NOW + 40 * 24 * H,
    ).outcome,
    "churned_after_paying",
    "paid, cancelled at period end, lapsed: Stripe keeps cancel_at_period_end — not a trial cancel",
  );
  assert.equal(classifyTrial({ ...base, trialEndMs: NOW + 24 * H }, NOW).outcome, "in_trial");
  assert.equal(classifyTrial({ ...base, status: "canceled", reason: "payment_failed", canceledAtMs: trialEnd }, NOW).outcome, "payment_failed");
});

test("cancel timing relative to the trial-ending reminder", () => {
  const reminder = START + 11 * 24 * H;
  const after = classifyTrial({ ...base, cancelAtPeriodEnd: true, canceledAtMs: reminder + H, reminderSentMs: reminder, trialEndMs: NOW + H }, NOW);
  assert.equal(after.afterReminder, true);
  assert.equal(cancelBucket(after.hoursToCancel), "11–14 days");
  const before = classifyTrial({ ...base, cancelAtPeriodEnd: true, canceledAtMs: START + 2 * H, trialEndMs: NOW + H }, NOW);
  assert.equal(before.afterReminder, false, "no reminder sent yet when they cancelled");
});
