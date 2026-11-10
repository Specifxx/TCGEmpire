// When a sister-site alert emails, as pure functions (tests/sister-alerts.test.ts).
//
//   • It fires when the region's lowest in-stock store price is AT OR BELOW
//     the visitor's target.
//   • Once emailed, it stays quiet until the price falls another
//     REFIRE_DROP_PCT below the price we emailed (a further real drop), or the
//     price climbs back above the target, which re-arms it.
//   • At most one email per alert per MIN_GAP_MS, however the price moves.
//   • A product with no price in its region for MISSING_TTL_MS is removed; an
//     alert older than MAX_AGE_MS is removed (the form says six months).

export const REFIRE_DROP_PCT = 5;
export const MIN_GAP_MS = 3 * 24 * 60 * 60 * 1000;
export const MISSING_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000;
/** An unconfirmed address (and its alerts) is removed after this. */
export const UNCONFIRMED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A BACK-IN-STOCK WATCH (DexCompare Premium, 2026-11-10) is a SisterAlert whose target is this
 * ceiling: "any in-stock price at all". It fires when the region gets a price (the feed holds
 * the lowest IN-STOCK price, so none means sold out), re-arms while the product is sold out,
 * never fires on a further price drop, and is not removed for being sold out for 90 days.
 */
export const RESTOCK_TARGET_CENTS = 100_000_000;
export const isRestockTarget = (targetCents: number) => targetCents >= RESTOCK_TARGET_CENTS;

export interface AlertState {
  targetCents: number;
  lastNotifiedCents: number | null;
  lastNotifiedAt: Date | null;
  missingSince: Date | null;
  createdAt: Date;
}

export type Verdict =
  | { kind: "fire"; priceCents: number }
  | { kind: "hold"; priceCents: number | null; rearm: boolean; missingSince: Date | null }
  | { kind: "expire"; reason: "old" | "missing" };

export function evaluateAlert(a: AlertState, priceCents: number | null, now: Date): Verdict {
  if (now.getTime() - a.createdAt.getTime() > MAX_AGE_MS) return { kind: "expire", reason: "old" };
  if (priceCents == null && isRestockTarget(a.targetCents)) {
    // Sold out: the watch waits, and the next in-stock price is a fresh restock.
    return { kind: "hold", priceCents: null, rearm: a.lastNotifiedCents != null, missingSince: null };
  }
  if (priceCents == null) {
    const since = a.missingSince ?? now;
    if (now.getTime() - since.getTime() > MISSING_TTL_MS) return { kind: "expire", reason: "missing" };
    return { kind: "hold", priceCents: null, rearm: false, missingSince: since };
  }
  if (priceCents > a.targetCents) {
    return { kind: "hold", priceCents, rearm: a.lastNotifiedCents != null, missingSince: null };
  }
  const recent = a.lastNotifiedAt != null && now.getTime() - a.lastNotifiedAt.getTime() < MIN_GAP_MS;
  if (isRestockTarget(a.targetCents) && a.lastNotifiedCents != null) return { kind: "hold", priceCents, rearm: false, missingSince: null };
  if (a.lastNotifiedCents == null) return recent ? { kind: "hold", priceCents, rearm: false, missingSince: null } : { kind: "fire", priceCents };
  const further = priceCents <= Math.floor(a.lastNotifiedCents * (1 - REFIRE_DROP_PCT / 100));
  if (further && !recent) return { kind: "fire", priceCents };
  return { kind: "hold", priceCents, rearm: false, missingSince: null };
}

/** A sensible default target for the form: 10% under today's price, rounded down to a whole unit. */
export function suggestedTarget(priceCents: number): number {
  return Math.max(100, Math.floor((priceCents * 0.9) / 100) * 100);
}
