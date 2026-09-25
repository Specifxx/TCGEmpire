import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_DAILY_BUDGET, ALL_RUN_SHARE, FIRST_CONTACT_SEND_CAP, alertDailyBudget } from "../src/lib/price-alerts";
import { daysAgo, harness, hoursAgo, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED ALERT BUDGET (2026-09-25). Resend's 100/day also carries
// verification, reset, welcome, trial and release-day mail. Every alert run
// together may email at most ALERT_DAILY_BUDGET distinct addresses per rolling
// 24h (env-overridable), counted from lastNotifiedAt with one small query; the
// free run may use at most ALL_RUN_SHARE. Digests open in priority order
// (target > restock > below-market > drop > listed/pre-order), and anything
// over budget is deferred with its baseline held.
// ─────────────────────────────────────────────────────────────────────────────

test("the numbers, and the env override", () => {
  assert.equal(ALERT_DAILY_BUDGET, 50);
  assert.equal(ALL_RUN_SHARE, 35);
  assert.equal(alertDailyBudget({}), 50);
  assert.equal(alertDailyBudget({ ALERT_DAILY_BUDGET: "20" }), 20);
  assert.equal(alertDailyBudget({ ALERT_DAILY_BUDGET: "0" }), 0);
  assert.equal(alertDailyBudget({ ALERT_DAILY_BUDGET: "lots" }), 50, "garbage falls back to the default");
});

test("addresses emailed in the last 24h use the budget up; re-emailing one of them costs nothing", async () => {
  // 45 addresses were emailed by earlier runs today (one row each, no move now).
  const earlier = Array.from({ length: 45 }, (_, i) => row(`e${i}`, { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: hoursAgo(5), price: 1000 }));
  const fresh = Array.from({ length: 8 }, (_, i) => owned(`t${i}`, plus, { targetCents: 1000, lastPriceCents: 1200, price: 900 }));
  // A target for an address emailed 5h ago — a DIFFERENT card, so no per-card cooldown.
  const again = owned("again", plus, { email: "e0@example.com", cardId: "other", targetCents: 1000, lastPriceCents: 1200, price: 900 });
  const h = harness([...earlier, ...fresh, again]);
  const s = await h.run("paid");
  // Paid scope reads only entitled rows in production; the stub returns all,
  // and the free rows are skipped by entitlement exactly as they would be.
  assert.equal(s.targets, 9);
  assert.equal(h.sent.length, 6, "5 new addresses fit the remaining budget, plus the already-counted one");
  assert.ok(h.sent.some((m) => m.to === "e0@example.com"));
  assert.equal(s.budgetDeferred, 3);
  assert.equal(s.deferred, 3);
});

test("the free run takes at most ALL_RUN_SHARE new addresses, however much budget is left", async () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(`d${i}`, { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(10), price: 800 }));
  const h = harness(rows);
  const s = await h.run();
  assert.equal(h.sent.length, ALL_RUN_SHARE);
  assert.equal(s.budgetDeferred, 5);
  assert.equal(s.held, 5);
});

test("priority: when the budget binds, targets and restocks open before drops and listings", async () => {
  const rows = [
    row("listed", { price: 500 }),
    row("drop", { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(10), price: 800 }),
    row("restock", { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(10), soldOutAt: daysAgo(2), price: 1000 }),
    owned("target", plus, { targetCents: 1000, lastPriceCents: 1200, price: 900 }),
  ];
  const h = harness(rows, { dailyBudget: 2 });
  const s = await h.run();
  assert.deepEqual(h.sent.map((m) => m.items[0]!.kind), ["target", "restock"]);
  assert.equal(s.budgetDeferred, 2);
});

test("the first-contact cap still applies inside the budget", async () => {
  const rows = Array.from({ length: FIRST_CONTACT_SEND_CAP + 3 }, (_, i) => row(`n${i}`, { lastPriceCents: 1000, price: 800 }));
  const h = harness(rows);
  const s = await h.run();
  assert.equal(h.sent.length, FIRST_CONTACT_SEND_CAP);
  assert.equal(s.deferred, 3);
  assert.equal(s.budgetDeferred, 0);
});

test("the budget count is one GROUP BY email over the last 24h, capped", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, price: 800 })]);
  await h.run();
  assert.equal(h.budgetQueries.length, 1);
  const q = h.budgetQueries[0] as { by: string[]; where: { lastNotifiedAt: { gte: Date } }; take: number };
  assert.deepEqual(q.by, ["email"]);
  assert.deepEqual(q.where.lastNotifiedAt.gte, hoursAgo(24));
  assert.equal(q.take, 1000);
});

test("snoozed watches are not emailed but their baselines advance; legacy markets are skipped", async () => {
  const h = harness([
    row("z", { lastPriceCents: 1000, price: 800, snoozedUntil: new Date(Date.UTC(2026, 10, 20)) }),
    row("nz", { market: "NZ", lastPriceCents: 1000, price: 800 }),
  ]);
  const s = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(s.snoozed, 1);
  assert.equal(s.legacyMarket, 1);
  assert.equal(h.writeFor("z")!.lastPriceCents, 800);
  assert.equal(h.writeFor("z")!.lastNotifiedAt, undefined);
  assert.equal(h.writeFor("nz"), undefined, "an NZ watch is never priced as AU");
});
