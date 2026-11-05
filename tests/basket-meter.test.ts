import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FREE_PLANS_PER_MONTH,
  freePlansState,
  meterMonth,
  meterResetsAt,
  planAccess,
  prismaMeterStore,
  takeFreePlan,
  type MeterStore,
} from "../src/lib/basket-meter";

// Best Basket's three free store-by-store plans a month (2026-10-22,
// DECISIONS.md "Best Basket: three free plans a month").

// An in-memory store with the same contract as the database one: tryTake is
// atomic (check and increment in one step, the way the conditional UPDATE is).
function memoryStore(): MeterStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  return {
    rows,
    async used(u, m) {
      return rows.get(`${u}|${m}`) ?? 0;
    },
    async tryTake(u, m, limit) {
      await new Promise((r) => setImmediate(r)); // interleave concurrent callers
      const k = `${u}|${m}`;
      const n = rows.get(k) ?? 0;
      if (n >= limit) return false;
      rows.set(k, n + 1);
      return true;
    },
    async giveBack(u, m) {
      const k = `${u}|${m}`;
      rows.set(k, Math.max(0, (rows.get(k) ?? 0) - 1));
    },
  };
}

const OCT = new Date("2026-10-22T10:00:00Z");

test("three plans, then the fourth is refused with the reset date", async () => {
  const s = memoryStore();
  for (let i = 1; i <= FREE_PLANS_PER_MONTH; i++) {
    const r = await takeFreePlan(s, "u1", OCT);
    assert.equal(r.ok, true, `plan ${i}`);
    assert.equal(r.state.used, i);
  }
  const fourth = await takeFreePlan(s, "u1", OCT);
  assert.equal(fourth.ok, false);
  assert.equal(fourth.state.used, FREE_PLANS_PER_MONTH);
  assert.equal(fourth.state.limit, 3);
  assert.equal(fourth.state.resetsAt, "2026-11-01T00:00:00.000Z");
  // Another account is untouched.
  assert.equal((await takeFreePlan(s, "u2", OCT)).ok, true);
});

test("the month rolls over on the 1st, UTC", async () => {
  const s = memoryStore();
  const lastSecond = new Date("2026-10-31T23:59:59Z");
  for (let i = 0; i < FREE_PLANS_PER_MONTH; i++) await takeFreePlan(s, "u1", lastSecond);
  assert.equal((await takeFreePlan(s, "u1", lastSecond)).ok, false);
  const firstSecond = new Date("2026-11-01T00:00:00Z");
  assert.equal(meterMonth(firstSecond), "2026-11");
  const r = await takeFreePlan(s, "u1", firstSecond);
  assert.equal(r.ok, true);
  assert.equal(r.state.used, 1);
  assert.equal(meterResetsAt(new Date("2026-12-15T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
  // A Sydney evening on 31 Oct UTC is still October's allowance (UTC, not local time).
  assert.equal(meterMonth(new Date("2026-10-31T13:30:00Z")), "2026-10");
});

test("concurrent reveals never spend more than the limit", async () => {
  const s = memoryStore();
  const results = await Promise.all(Array.from({ length: 10 }, () => takeFreePlan(s, "u1", OCT)));
  assert.equal(results.filter((r) => r.ok).length, FREE_PLANS_PER_MONTH);
  assert.equal(s.rows.get("u1|2026-10"), FREE_PLANS_PER_MONTH);
});

test("a use handed back (nothing planned) is available again", async () => {
  const s = memoryStore();
  await takeFreePlan(s, "u1", OCT);
  await s.giveBack("u1", "2026-10");
  assert.equal((await freePlansState(s, "u1", OCT)).used, 0);
  await s.giveBack("u1", "2026-10");
  assert.equal((await freePlansState(s, "u1", OCT)).used, 0, "never below zero");
});

test("who is metered: Premium unlimited, free and Plus metered, signed out none", () => {
  assert.equal(planAccess(true, "premium"), "unlimited");
  assert.equal(planAccess(true, "plus"), "metered");
  assert.equal(planAccess(true, null), "metered");
  assert.equal(planAccess(false, null), "none");
  assert.equal(planAccess(false, "premium"), "none");
});

test("the database store takes a use with a conditional increment, never a read-then-write", async () => {
  const calls: { op: string; args: unknown }[] = [];
  let count = 2;
  const db = {
    basketPlanUsage: {
      findUnique: async () => ({ count }),
      upsert: async (args: unknown) => {
        calls.push({ op: "upsert", args });
        return {};
      },
      updateMany: async (args: { where: { count?: { lt?: number } } }) => {
        calls.push({ op: "updateMany", args });
        const lt = args.where.count?.lt;
        if (lt !== undefined && count < lt) {
          count++;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  const store = prismaMeterStore(db);
  assert.equal(await store.tryTake("u1", "2026-10", 3), true);
  assert.equal(await store.tryTake("u1", "2026-10", 3), false);
  const update = calls.find((c) => c.op === "updateMany")!.args as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(update.where, { userId: "u1", month: "2026-10", count: { lt: 3 } });
  assert.deepEqual(update.data, { count: { increment: 1 } });
});

test("the route meters reveals server-side, below Premium only", () => {
  const route = readFileSync(new URL("../src/app/api/basket/route.ts", import.meta.url), "utf8");
  // Premium is never metered: the reveal branch is for !full only.
  assert.match(route, /const reveal = !full && request\.reveal;/);
  assert.match(route, /takeFreePlan\(meter, user\.id\)/);
  // A spent allowance answers 402 with the state, and the plan is built only after a use is taken.
  assert.match(route, /status: 402/);
  assert.ok(route.indexOf("takeFreePlan(meter") < route.indexOf("buildBasket(user.id, true, request"), "take before build");
  // Nothing planned hands the use back.
  assert.match(route, /if \(!out\.priced\) \{\s*\/\/ Nothing was planned: the use goes back\.\s*await meter\.giveBack/);
  // Signed out is refused before anything else.
  assert.match(route, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in first" \}, \{ status: 401 \}\);/);
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model BasketPlanUsage \{[\s\S]*@@id\(\[userId, month\]\)/);
});

test("plan store links go through the existing affiliate handling", () => {
  const basket = readFileSync(new URL("../src/lib/basket.ts", import.meta.url), "utf8");
  assert.match(basket, /url: affiliateUrl\(listing\.url, key, opts\.loc\)/);
});
