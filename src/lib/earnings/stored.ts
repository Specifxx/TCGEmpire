import { prisma } from "@/lib/db";

// THE EARNINGS DASHBOARD READS A STORED COPY (2026-11-06, owner: "admin/earnings now
// takes 10 minutes to load"). DECISIONS.md, "The earnings dashboard reads a stored
// copy". Each reporting API (Stripe, Impact, EPN, AdSense, Anthropic, Vercel) is
// walked from EARNINGS_SINCE in date windows, and the old 30-minute memo lived in
// one server instance's memory, so on Vercel nearly every visit was a cold walk of
// every API. Now each source's last good answer is kept in one OpsSnapshot row
// (`earnings:<key>`, private, never exported), refreshed every three hours by
// /api/cron/earnings-refresh and by the dashboard's Refresh link; the page reads
// the rows (one small query) and never waits on an API unless a row is missing.

export const STORED_PREFIX = "earnings:";
/** A stored copy older than this is reported by the ops monitor (the refresh cron runs every 3 hours). */
export const STORED_OVERDUE_MS = 12 * 3600_000;

/** Every stored row under `keys` (without the prefix), in one query. A missing table or row is simply absent. */
export async function readStored<T>(keys: readonly string[]): Promise<Map<string, T>> {
  const rows = await prisma.opsSnapshot
    .findMany({ where: { key: { in: keys.map((k) => STORED_PREFIX + k) } }, select: { key: true, json: true } })
    .catch((e) => {
      console.error("[earnings] stored read failed:", e);
      return [] as { key: string; json: unknown }[];
    });
  return new Map(rows.map((r) => [r.key.slice(STORED_PREFIX.length), r.json as T]));
}

/** Keep one source's answer. Best effort: a failed write only means the next visit fetches again. */
export async function writeStored(key: string, value: unknown): Promise<void> {
  const k = STORED_PREFIX + key;
  const json = JSON.parse(JSON.stringify(value));
  await prisma.opsSnapshot.upsert({ where: { key: k }, create: { key: k, json }, update: { json } }).catch((e) => console.error(`[earnings] stored write ${key} failed:`, e));
}
