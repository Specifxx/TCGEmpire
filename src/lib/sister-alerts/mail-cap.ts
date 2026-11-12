// The service's own daily mail cap, beside the shared alert budget: Resend's
// free quota (100 a day) also carries RiftCompare's sign-in, verification and
// alert mail, so confirmations and sister alerts together send at most
// SISTER_DAILY_MAIL_CAP a UTC day. One Counter row per day.
import type { prisma as Prisma } from "../db";

export const SISTER_DAILY_MAIL_CAP = 30;

/**
 * DexCompare's own lane (2026-11-12). Dex mail leaves through its own Brevo account
 * (send.ts, DEX_BREVO_API_KEY: 300 a day free), not Resend, so while that key is set
 * its confirmations, alerts and weekly email count on their own counter and never
 * spend the 30 the other sites share. Without the key Dex is an ordinary site again.
 */
export const DEX_DAILY_MAIL_CAP = 250;

export function mailLane(siteKey?: string, env: Record<string, string | undefined> = process.env): "dex" | "shared" {
  return siteKey === "dex" && env.DEX_BREVO_API_KEY?.trim() ? "dex" : "shared";
}

export function mailCapKey(now: Date, lane: "dex" | "shared" = "shared"): string {
  return `sister-alerts:mail:${lane === "dex" ? "dex:" : ""}${now.toISOString().slice(0, 10)}`;
}

/**
 * Claims one send; false once the day's cap is spent. Fails CLOSED: an unreadable counter sends nothing.
 * `cap` is the shared lane's ceiling; the Dex lane keeps the same reserve under its own cap.
 */
export async function claimMailSlot(
  db: Pick<typeof Prisma, "counter">,
  now: Date,
  cap = SISTER_DAILY_MAIL_CAP,
  siteKey?: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  try {
    const lane = mailLane(siteKey, env);
    const limit = lane === "dex" ? DEX_DAILY_MAIL_CAP - (SISTER_DAILY_MAIL_CAP - cap) : cap;
    const key = mailCapKey(now, lane);
    const row = await db.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
    return row.value <= limit;
  } catch {
    return false;
  }
}
