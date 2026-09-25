import type { prisma } from "./db";

// THE GLOBAL DAILY CAP ON WATCH-CONFIRMATION EMAILS (/api/alerts/subscribe).
//
// That route takes any address with no double opt-in, and Resend's 100/day
// quota is shared with verification, password reset and the alert digests
// themselves, so ~100 posted addresses could starve all of them. rateLimit()
// cannot be the cap — it is per serverless instance — so the database keeps
// the count.
//
// WHAT IS COUNTED: confirmations sent, one per call, and nothing else. The
// first version counted anonymous PriceAlert rows created in the last 24h,
// which is a different number. A returning anonymous watcher adds a row on
// every heart click (PriceAlertModal's silent path) but is never re-confirmed,
// so 30 such clicks shut new addresses out; and a signed-in subscriber's
// confirmation (userId set) was sent but never counted. The route calls this
// only at the moment it is about to send, so the counter IS the confirmations.
//
// The count lives in the existing Counter table (one row per UTC day, key
// "alert-confirm:YYYY-MM-DD" — a few bytes a day, no schema change). The
// upsert is a single INSERT … ON CONFLICT DO UPDATE on the primary key, so two
// concurrent requests can't both read 29. Fails CLOSED: any error (including
// the rare first-of-the-day insert race) sends nothing — a capped confirmation
// costs only the courtesy email; the watch itself is already saved.
export const CONFIRMATION_DAILY_CAP = 30;

export type ConfirmationDb = {
  counter: Pick<typeof prisma.counter, "upsert">;
};

export function confirmationKey(now: Date): string {
  return `alert-confirm:${now.toISOString().slice(0, 10)}`;
}

// Claim one of today's confirmation slots. true = send it; false = the cap is
// reached (or the count failed). Every call claims, so call it only when the
// email is otherwise certain to go.
export async function claimConfirmationSlot(db: ConfirmationDb, now: Date = new Date()): Promise<boolean> {
  const key = confirmationKey(now);
  try {
    const row = await db.counter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return row.value <= CONFIRMATION_DAILY_CAP;
  } catch {
    return false;
  }
}
