import { prisma } from "./db";
import { sydneyDay } from "./price-history";

/**
 * "When did this account last USE the site", and "how many distinct days has it
 * used the site" — the two numbers the admin dashboard and the loyalty lists
 * actually want, and which `lastLoginAt` cannot answer.
 *
 * WHY LOGIN WAS THE WRONG METRIC. Sessions here are long-lived JWTs, and
 * lastLoginAt is stamped in exactly one place: the OAuth callback. So it
 * records authentication, an event a daily visitor might not repeat for
 * months. On the accounts dashboard that made the most engaged accounts
 * indistinguishable from dormant ones — "Signed in · 7d" counted people who
 * happened to re-authenticate that week, not people who showed up.
 *
 * THE WRITE IS THROTTLED, AND THAT IS THE WHOLE DESIGN. getCurrentUser() runs
 * on essentially every authenticated render (the root layout reads it for the
 * ad-free check), so stamping unconditionally would be one UPDATE per page
 * view per signed-in user. This site has burned a 5 GB Neon transfer allowance
 * in about three days more than once — see src/lib/db-chains.ts's rotation
 * history — so adding a write to the hottest path in the app is not something
 * to do casually. Instead:
 *
 *   • The READ is free. getCurrentUser already does a findUnique that returns
 *     the whole row, so lastActiveAt arrives with it and the decision to write
 *     costs no extra query.
 *   • The WRITE happens at most once per ACTIVITY_STAMP_INTERVAL_MS per user.
 *     An hour of browsing is 2 writes, not 60.
 *   • It is never awaited. Page renders must not wait on a bookkeeping write.
 */

/**
 * How stale lastActiveAt must be before it is rewritten. Thirty minutes keeps
 * "last active" honest to within half an hour — far finer than the daily
 * granularity anything displays it at — while cutting the write rate by well
 * over 90% versus stamping every request.
 */
export const ACTIVITY_STAMP_INTERVAL_MS = 30 * 60_000;

/** The row fields touchActivity needs. Any `user.findUnique()` result satisfies it. */
export interface ActivityRow {
  id: string;
  lastActiveAt: Date | null;
  activeDays: number;
}

/**
 * What should be written for this row, or null when nothing should be.
 *
 * Split out from the write so it is testable without a database — the day
 * rollover in particular is the easy thing to get wrong, and it is the part
 * that decides whether activeDays is a real count or noise.
 */
export function activityUpdate(
  row: Pick<ActivityRow, "lastActiveAt" | "activeDays">,
  now = new Date(),
): { lastActiveAt: Date; activeDays?: { increment: 1 } } | null {
  const last = row.lastActiveAt;

  // Never seen → first active day.
  if (!last) return { lastActiveAt: now, activeDays: { increment: 1 } };

  // A NEW CALENDAR DAY always writes, however recently they were here: the
  // whole point of activeDays is counting days, and one seen at 23:58 followed
  // by one at 00:02 is two days even though it is four minutes. Bucketed in
  // Australia/Sydney via the same sydneyDay() the price snapshots use, so
  // "a day" means one thing across the codebase rather than two.
  if (sydneyDay(now).getTime() !== sydneyDay(last).getTime()) {
    return { lastActiveAt: now, activeDays: { increment: 1 } };
  }

  // Same day, and recent enough that rewriting the timestamp buys nothing.
  if (now.getTime() - last.getTime() < ACTIVITY_STAMP_INTERVAL_MS) return null;

  // Same day, but stale — refresh the timestamp WITHOUT counting another day.
  return { lastActiveAt: now };
}

/**
 * Record that this account is using the site, if enough has changed to be
 * worth a write. Fire-and-forget: never awaited, never throws, and a failure
 * costs nothing but a slightly stale number.
 */
export function touchActivity(row: ActivityRow, now = new Date()): void {
  const data = activityUpdate(row, now);
  if (!data) return;
  void prisma.user.update({ where: { id: row.id }, data }).catch(() => {
    /* bookkeeping only — a dropped stamp must never surface to the visitor */
  });
}
