// Pure classification of one Premium trial's outcome — shared by
// scripts/trial-cancel-report.ts and its test. DECISIONS.md, "Trial model:
// 3-day trial, then the first 3 months half price" and "Trial cancellations:
// keep, remind, tell the truth", both 2026-09-24.
//
// The rule that matters: a trial is CANCELLED the moment the person clicks
// Cancel, which Stripe records as cancel_at_period_end=true (and canceled_at)
// while the status stays "trialing" until the trial ends. Counting only ended
// subscriptions — what funnel-report.ts did — reads every one of those as a
// healthy trial for up to 14 days.

export interface TrialRow {
  status: string;
  trialStartMs: number;
  trialEndMs: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAtMs: number | null;
  endedAtMs: number | null;
  reason: string | null;
  feedback: string | null;
  comment: string | null;
  tier: string;
  interval: string | null;
  surface: string | null;
  matchedUser: boolean;
  accountAgeDaysAtTrial: number | null;
  signupSource: string | null;
  activeDays: number | null;
  alerts: number | null;
  collectionCards: number | null;
  reminderSentMs: number | null;
  /** Trial length in whole days (trial_end − trial_start): 14-day and 3-day cohorts are never pooled. */
  trialDays?: number | null;
  /** The subscription's coupon id, if any (rc-intro-* = the half-price intro). */
  couponId?: string | null;
  /** Set by api/premium/resume when a cancelled subscription was kept (metadata keptAt). */
  keptAtMs?: number | null;
  keptVia?: string | null;
  /** A cancel_at_period_end true → false event seen in the last 30 days (a portal resume). */
  resumedByEvent?: boolean;
  /** Set by api/premium/auto-renew when renewal was switched off there (metadata turnedOffAt/turnedOffVia). */
  turnedOffAtMs?: number | null;
  turnedOffVia?: string | null;
}

/**
 * The metadata value api/premium/auto-renew stamps as turnedOffVia — the
 * "Turn off auto-renew" button on /premium (2026-09-25). Anything that switched
 * renewal off without stamping it (Stripe's portal, the dashboard) reads as
 * "portal" in cancelDoor below.
 */
export const TURNED_OFF_VIA_BUTTON = "auto-renew";

/**
 * Which door switched renewal off, for a subscription that is cancelled —
 * because Stripe records the button and the portal's Cancel identically
 * (cancel_at_period_end). Pure. null when renewal is not off.
 *
 * The button's stamp counts only when it is the LATEST of our stamps: after
 * button → Keep → portal cancel, metadata still carries turnedOffAt (Stripe
 * merges metadata), but keptAt is newer, so that cancel is the portal's. One
 * sequence still misreads, and is accepted: button → portal resume → portal
 * cancel (a portal resume leaves no stamp) reads as the button.
 */
export function cancelDoor(r: TrialRow): string | null {
  const off = r.cancelAtPeriodEnd || r.canceledAtMs != null || r.status === "canceled";
  if (!off) return null;
  if (r.turnedOffVia && r.turnedOffAtMs != null && (r.keptAtMs == null || r.turnedOffAtMs > r.keptAtMs)) {
    return r.turnedOffVia;
  }
  return "portal";
}

export type TrialOutcome =
  | "resumed"
  | "cancelled_in_trial"
  | "converted"
  | "churned_after_paying"
  | "in_trial"
  | "payment_failed"
  | "other";

export interface TrialClassification {
  outcome: TrialOutcome;
  /** Hours from trial start to the cancel click; null when not cancelled or unknown. */
  hoursToCancel: number | null;
  /** Did the cancel come after the "trial ends soon" email? null when unknowable. */
  afterReminder: boolean | null;
}

const PAID = new Set(["active", "past_due"]);

export function classifyTrial(r: TrialRow, now: number): TrialClassification {
  const cancelMs = r.canceledAtMs ?? (r.cancelAtPeriodEnd ? r.endedAtMs : null);
  const hoursToCancel = cancelMs != null ? Math.max(0, (cancelMs - r.trialStartMs) / 3_600_000) : null;
  const afterReminder = cancelMs != null && r.reminderSentMs != null ? cancelMs >= r.reminderSentMs : cancelMs != null && r.matchedUser ? false : null;
  const trialOver = r.trialEndMs != null && r.trialEndMs <= now;
  // Still trialing with renewal off, or the cancel click (canceled_at)
  // landed before the trial ended. NOT "canceled + cancel_at_period_end":
  // Stripe keeps that flag on a subscription that paid, cancelled later and
  // lapsed, which read every half-price payer who left as a trial cancel.
  const cancelledBeforeTrialEnd =
    (r.cancelAtPeriodEnd && r.status === "trialing") ||
    (cancelMs != null && r.trialEndMs != null && cancelMs <= r.trialEndMs);

  if (r.reason === "payment_failed" || r.status === "incomplete_expired" || r.status === "unpaid") {
    return { outcome: "payment_failed", hoursToCancel: null, afterReminder: null };
  }
  // Cancelled, then KEPT (api/premium/resume stamps keptAt; a portal resume
  // shows up as an event). Stripe clears the cancel on resume, so without
  // these a save would read as a trial that was never cancelled at all.
  if ((r.keptAtMs != null || r.resumedByEvent) && !r.cancelAtPeriodEnd && r.status !== "canceled") {
    return { outcome: "resumed", hoursToCancel, afterReminder };
  }
  if (cancelledBeforeTrialEnd) return { outcome: "cancelled_in_trial", hoursToCancel, afterReminder };
  if (r.status === "trialing") return { outcome: "in_trial", hoursToCancel: null, afterReminder: null };
  if (PAID.has(r.status) && !r.cancelAtPeriodEnd) return { outcome: "converted", hoursToCancel: null, afterReminder: null };
  if (trialOver && (r.status === "canceled" || r.cancelAtPeriodEnd)) {
    return { outcome: "churned_after_paying", hoursToCancel, afterReminder };
  }
  return { outcome: "other", hoursToCancel, afterReminder };
}

export function cancelBucket(hours: number | null): string {
  if (hours == null) return "unknown";
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return "1–24 hours";
  if (hours < 72) return "1–3 days";
  if (hours < 168) return "3–7 days";
  if (hours < 264) return "7–11 days";
  return "11–14 days";
}
