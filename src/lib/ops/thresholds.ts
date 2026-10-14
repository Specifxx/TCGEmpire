// The verdict rules, as pure functions of numbers. Every threshold the monitor
// uses lives here so they can be read in one place and tested without a network.
import type { Severity } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ── Neon transfer ────────────────────────────────────────────────────────────
// Free-tier transfer is 5 GB per project per billing period (CLAUDE.md), counted
// in decimal gigabytes (Neon's usage guide divides data_transfer_bytes by 1e9).
export const NEON_FREE_TRANSFER_BYTES = 5_000_000_000;

export interface TransferSample {
  /** epoch ms */
  t: number;
  /** data_transfer_bytes at that moment */
  b: number;
}

export interface NeonUsageInput {
  usedBytes: number;
  limitBytes: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  now: Date;
  /** Bytes per day from recent samples, when there are enough of them. */
  recentBytesPerDay?: number | null;
}

export interface NeonUsage {
  severity: Severity;
  pct: number;
  /** Bytes per day the verdict was based on; null when it is too early to say. */
  burnPerDay: number | null;
  /** Days until the allowance is spent at that rate; null when no rate. */
  daysToExhaust: number | null;
  /** Days left in the billing period; null when the period is unknown. */
  daysLeftInPeriod: number | null;
}

/**
 * How worried to be about a project's transfer.
 *
 *   crit  90% used, or the allowance is gone within a day and a half at the current rate;
 *   warn  70% used, or on pace to run out BEFORE the period resets (once a quarter of it
 *         is spent, so a first-hour burst on a fresh restore does not cry wolf).
 *
 * The rate is the recent one (last ~day of samples) when we have it, else the period
 * average once half a day has elapsed. A restore's one-off COPY inflates the average, which
 * is why the recent rate is preferred.
 */
export function neonUsage(i: NeonUsageInput): NeonUsage {
  const pct = i.limitBytes > 0 ? i.usedBytes / i.limitBytes : 0;
  const elapsedDays = i.periodStart ? Math.max(0, (i.now.getTime() - i.periodStart.getTime()) / DAY_MS) : null;
  const daysLeftInPeriod = i.periodEnd ? Math.max(0, (i.periodEnd.getTime() - i.now.getTime()) / DAY_MS) : null;

  let burn: number | null = null;
  if (i.recentBytesPerDay != null && i.recentBytesPerDay >= 0) burn = i.recentBytesPerDay;
  else if (elapsedDays != null && elapsedDays >= 0.5) burn = i.usedBytes / elapsedDays;

  const remaining = Math.max(0, i.limitBytes - i.usedBytes);
  const daysToExhaust = burn != null && burn > 0 ? remaining / burn : null;

  let severity: Severity = "ok";
  if (pct >= 0.7) severity = "warn";
  else if (daysToExhaust != null && pct >= 0.25 && daysLeftInPeriod != null && daysToExhaust < daysLeftInPeriod) severity = "warn";
  if (pct >= 0.9 || (daysToExhaust != null && pct >= 0.5 && daysToExhaust <= 1.5)) severity = "crit";

  return { severity, pct, burnPerDay: burn, daysToExhaust, daysLeftInPeriod };
}

/**
 * Bytes per day between the newest sample and the oldest one that is at least six hours
 * (and at most 36 hours) older. A drop in the counter means the period reset; the older
 * samples then say nothing about now, so there is no rate.
 */
export function recentRatePerDay(samples: readonly TransferSample[], nowSample: TransferSample): number | null {
  let base: TransferSample | null = null;
  for (const s of samples) {
    const age = nowSample.t - s.t;
    if (age < 6 * HOUR_MS || age > 36 * HOUR_MS) continue;
    if (!base || s.t < base.t) base = s;
  }
  if (!base) return null;
  if (nowSample.b < base.b) return null;
  return ((nowSample.b - base.b) / (nowSample.t - base.t)) * DAY_MS;
}

/** Append a sample, drop the stale ones and a series that a period reset has made meaningless. */
export function pushSample(samples: readonly TransferSample[], next: TransferSample, keep = 60): TransferSample[] {
  const last = samples[samples.length - 1];
  const base = last && next.b < last.b ? [] : [...samples];
  base.push(next);
  return base.slice(-keep);
}

// ── Ages ─────────────────────────────────────────────────────────────────────
/** Severity of "this should have happened within warnH hours". */
export function ageSeverity(ageHours: number, warnH: number, critH: number): Severity {
  // Infinity is "it has never happened" (hoursSince(null)): that is a verdict. Only NaN is "cannot tell".
  if (Number.isNaN(ageHours)) return "unknown";
  if (ageHours >= critH) return "crit";
  if (ageHours >= warnH) return "warn";
  return "ok";
}

export function hoursSince(then: Date | null | undefined, now: Date): number {
  return then ? (now.getTime() - then.getTime()) / HOUR_MS : Number.POSITIVE_INFINITY;
}

/** "3.5 hours", "2.1 days" — the unit a person reads. */
export function humanAge(hours: number): string {
  if (!Number.isFinite(hours)) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

// ── eBay ─────────────────────────────────────────────────────────────────────
/**
 * eBay's Browse API allows 5,000 calls a day. The importers deliberately leave a reserve
 * (EBAY_QUOTA_RESERVE, 600) for live card pages, so "remaining" falling under that reserve
 * is the importer doing its job; falling to a few hundred means something else is spending it.
 */
export function ebayQuotaSeverity(remaining: number | null, limit: number | null): Severity {
  if (remaining == null || limit == null || limit <= 0) return "unknown";
  if (remaining <= 0) return "crit";
  if (remaining / limit < 0.04) return "warn";
  return "ok";
}
