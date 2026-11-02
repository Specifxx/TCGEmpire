// The service's own daily mail cap, beside the shared alert budget: Resend's
// free quota (100 a day) also carries RiftCompare's sign-in, verification and
// alert mail, so confirmations and sister alerts together send at most
// SISTER_DAILY_MAIL_CAP a UTC day. One Counter row per day.
import type { prisma as Prisma } from "../db";

export const SISTER_DAILY_MAIL_CAP = 30;

export function mailCapKey(now: Date): string {
  return `sister-alerts:mail:${now.toISOString().slice(0, 10)}`;
}

/** Claims one send; false once the day's cap is spent. Fails CLOSED: an unreadable counter sends nothing. */
export async function claimMailSlot(db: Pick<typeof Prisma, "counter">, now: Date, cap = SISTER_DAILY_MAIL_CAP): Promise<boolean> {
  try {
    const key = mailCapKey(now);
    const row = await db.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
    return row.value <= cap;
  } catch {
    return false;
  }
}
