// BEST BASKET: THREE FREE STORE-BY-STORE PLANS A MONTH (2026-10-22, owner).
// DECISIONS.md, "Best Basket: three free plans a month".
//
// The store-by-store plan (Best Basket, Buy this list, Finish this set: one plan
// output, api/basket) was Premium's alone; everyone else signed in saw their
// own total and saving. Now a signed-in account below Premium gets
// FREE_PLANS_PER_MONTH full plans per UTC calendar month. Premium is unlimited.
// Signed out: no tool, as before (the page asks for an account).
//
// COUNTED ON REVEAL, NOT ON RUN. A run still returns the totals view; the plan is
// a second request with `reveal: true`, and only that consumes one — and only
// when it priced something (a plan with nothing covered hands its use back).
//
// SERVER-SIDE AND TAMPER-RESISTANT. The count is a BasketPlanUsage row per user
// per month, never anything the client holds. A use is taken with a conditional
// increment (`count < limit`), which Postgres re-checks under the row lock, so
// concurrent reveals can never spend more than the limit. Pure helpers + a
// small store interface, so tests run the same logic against an in-memory store.
import type { PremiumTier } from "./premium";

export const FREE_PLANS_PER_MONTH = 3;

/** "2026-10": the UTC calendar month a use is counted in. */
export function meterMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** The 1st of the next UTC month, when the allowance resets. */
export function meterResetsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "1 November" — how the reset date reads on the page (UTC). */
export function resetLabel(resetsAt: Date): string {
  return resetsAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });
}

export type PlanAccess = "unlimited" | "metered" | "none";

/** Who gets what: Premium unlimited, any other signed-in account metered, signed out none. */
export function planAccess(signedIn: boolean, tier: PremiumTier | null): PlanAccess {
  if (!signedIn) return "none";
  return tier === "premium" ? "unlimited" : "metered";
}

export interface MeterStore {
  used(userId: string, month: string): Promise<number>;
  /** Atomically take one use if fewer than `limit` are used; true when taken. */
  tryTake(userId: string, month: string, limit: number): Promise<boolean>;
  /** Hand one use back (a reveal that priced nothing). */
  giveBack(userId: string, month: string): Promise<void>;
}

export interface FreePlans {
  used: number;
  limit: number;
  /** ISO date of the reset (1st of next month, UTC). */
  resetsAt: string;
}

export async function freePlansState(store: MeterStore, userId: string, now = new Date()): Promise<FreePlans> {
  const used = Math.min(FREE_PLANS_PER_MONTH, await store.used(userId, meterMonth(now)));
  return { used, limit: FREE_PLANS_PER_MONTH, resetsAt: meterResetsAt(now).toISOString() };
}

/** Take one free plan for this month. `ok: false` once the month's allowance is spent. */
export async function takeFreePlan(store: MeterStore, userId: string, now = new Date()): Promise<{ ok: boolean; state: FreePlans }> {
  const ok = await store.tryTake(userId, meterMonth(now), FREE_PLANS_PER_MONTH);
  return { ok, state: await freePlansState(store, userId, now) };
}

type MeterDb = {
  basketPlanUsage: {
    findUnique(args: { where: { userId_month: { userId: string; month: string } }; select: { count: true } }): Promise<{ count: number } | null>;
    upsert(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

/** The BasketPlanUsage-backed store (operational database). */
export function prismaMeterStore(db: MeterDb): MeterStore {
  return {
    async used(userId, month) {
      const row = await db.basketPlanUsage.findUnique({ where: { userId_month: { userId, month } }, select: { count: true } });
      return row?.count ?? 0;
    },
    async tryTake(userId, month, limit) {
      // Make sure the row exists (a concurrent create losing the race is fine),
      // then increment only while under the limit: one statement, re-checked
      // under the row lock, so N concurrent reveals take at most `limit`.
      await db.basketPlanUsage
        .upsert({ where: { userId_month: { userId, month } }, create: { userId, month, count: 0 }, update: {} })
        .catch(() => null);
      const r = await db.basketPlanUsage.updateMany({
        where: { userId, month, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
      return r.count === 1;
    },
    async giveBack(userId, month) {
      await db.basketPlanUsage.updateMany({ where: { userId, month, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
    },
  };
}
