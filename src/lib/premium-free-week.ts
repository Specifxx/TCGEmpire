// The free Premium week for new accounts, run as a test (owner, 2026-11-26: "Yes, run all three tests" on the
// Premium pricing reset; DECISIONS.md "2026-11-26: A free Premium week for half of new accounts, as a test").
//
// From 2 Dec to 16 Dec 2026 (00:00 UTC), every NEW account is put in arm "a" or "b" by its id. Arm "b" gets 7 days
// of Premium at sign-up, no card, extend-only (it never shortens a period an account already has, e.g. a referred
// friend's week). Arm "a" gets nothing new: it is today's site. The read is paid starts per new account 21 days after
// the last sign-up (6 Jan 2027; interim 30 Dec), on /admin/premium.
//
// HARD CONSTANTS, NOT ENV (the 2026-08-23 lesson in lib/premium.ts "NO PREMIUM ON SIGNUP"): a leftover variable in
// Vercel must never be able to keep granting after the window. The window ends by itself; nothing needs a deploy to stop.
// The two earlier sign-up grants (a week, then 3 days, both before 2026-08-23) were never measured; this one is, by arm.
//
// Pure: no database here (lib/premium-free-week-server.ts writes the grant), so tests and the client can import it.

export const FREE_WEEK = {
  key: "fw1",
  start: Date.UTC(2026, 11, 2), // 2 Dec 2026 00:00 UTC
  end: Date.UTC(2026, 11, 16), // 16 Dec 2026 00:00 UTC
  days: 7,
  /** The day the arms are compared: 21 days after the last sign-up in the window. */
  readOn: Date.UTC(2027, 0, 6),
} as const;

export type FreeWeekArm = "a" | "b";

/** FNV-1a over the account id: a fixed 50/50 split that needs no stored coin and reads the same on every server. */
export function freeWeekArm(userId: string): FreeWeekArm {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2 === 0 ? "a" : "b";
}

export function freeWeekOpen(now: number = Date.now()): boolean {
  return now >= FREE_WEEK.start && now < FREE_WEEK.end;
}

/** Does a NEW account created at `createdAt` get the free week? Only arm "b", only inside the window. */
export function freeWeekGrantFor(userId: string, createdAt: number = Date.now()): boolean {
  return freeWeekOpen(createdAt) && freeWeekArm(userId) === "b";
}

/** The Counter row that marks an account's free week (its value is the end, in epoch seconds). */
export function freeWeekCounterKey(userId: string): string {
  return `${FREE_WEEK.key}:${userId}`;
}

/** The end of a free week begun at `from`: extend-only, so an account already Premium past it keeps its own date. */
export function freeWeekUntil(from: number, currentUntil: number | null): number {
  const end = from + FREE_WEEK.days * 86_400_000;
  return currentUntil !== null && currentUntil > end ? currentUntil : end;
}
