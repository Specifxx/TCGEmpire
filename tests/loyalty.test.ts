import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentStreak, streakDayPoints, streakOutlook, streakPoints, streakRuns, STREAK_CAP } from "../src/lib/streak";
import { canRedeem, levelFor, LEVELS, loyaltyState, redemptionSlot, REWARDS, rewardByKey } from "../src/lib/loyalty";
import { checkinOutlook, checkinPointsFor, checkinRuleOf, entryPoints, GIVEAWAYS, CHECKIN_POINTS } from "../src/lib/giveaway";

// Compounding daily streaks and member rewards (owner, 2026-11-26). DECISIONS.md.

test("streak: day 1 is 1, each day in a row one more, capped, a gap starts again", () => {
  assert.equal(streakDayPoints(1), 1);
  assert.equal(streakDayPoints(3), 3);
  assert.equal(streakDayPoints(STREAK_CAP + 5), STREAK_CAP);
  assert.equal(streakDayPoints(0), 0);
  assert.equal(streakPoints(["2026-12-01", "2026-12-02", "2026-12-03"]), 6);
  assert.equal(streakPoints(["2026-12-01", "2026-12-02", "2026-12-04"]), 1 + 2 + 1, "a missed day starts again at 1");
  assert.equal(streakPoints(["2026-12-03", "2026-12-01", "2026-12-02", "2026-12-02"]), 6, "order and duplicates don't matter");
  assert.deepEqual(streakRuns(["2026-12-31", "2027-01-01"]).map((r) => r.n), [1, 2], "across a month and a year");
  const sixty = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 11, 15 + i)).toISOString().slice(0, 10));
  assert.equal(streakPoints(sixty), 555, "a perfect 60-day round: 1+...+10 then 10 a day");
});

test("streak: today's and tomorrow's value", () => {
  assert.equal(currentStreak(["2026-12-01", "2026-12-02"], "2026-12-03"), 2, "yesterday's streak still stands before today's tap");
  assert.equal(currentStreak(["2026-12-01"], "2026-12-03"), 0);
  assert.deepEqual(streakOutlook(["2026-12-01", "2026-12-02"], "2026-12-03"), { streak: 2, checkedInToday: false, today: 3, tomorrow: 4 });
  assert.deepEqual(streakOutlook(["2026-12-01", "2026-12-02", "2026-12-03"], "2026-12-03"), { streak: 3, checkedInToday: true, today: 3, tomorrow: 4 });
  assert.deepEqual(streakOutlook([], "2026-12-03"), { streak: 0, checkedInToday: false, today: 1, tomorrow: 2 });
});

test("giveaways: the December rounds keep the flat rule they opened with; later rounds default to streaks", () => {
  for (const g of GIVEAWAYS.filter((x) => x.closesAt <= "2026-12-15")) assert.equal(checkinRuleOf(g), "flat", g.key);
  assert.equal(checkinRuleOf({}), "streak");
  const days = ["2026-12-01", "2026-12-02", "2026-12-03"];
  assert.equal(checkinPointsFor("flat", days), 3 * CHECKIN_POINTS);
  assert.equal(checkinPointsFor("streak", days), 6);
  assert.equal(checkinOutlook("flat", days, "2026-12-04").today, CHECKIN_POINTS);
  assert.equal(checkinOutlook("streak", days, "2026-12-04").today, 4);
  const p = entryPoints({ premium: false, watches: 0, bonusClaimed: false, checkins: 3, checkinPoints: 6 });
  assert.equal(p.checkin, 6);
  assert.equal(entryPoints({ premium: false, watches: 0, bonusClaimed: false, checkins: 3 }).checkin, 3 * CHECKIN_POINTS, "old callers unchanged");
});

test("giveaways: paying never scores check-ins differently (no purchase necessary)", () => {
  const free = entryPoints({ premium: false, watches: 1, bonusClaimed: false, checkins: 5, checkinPoints: 15 });
  const paid = entryPoints({ premium: true, watches: 0, bonusClaimed: false, checkins: 5, checkinPoints: 15 });
  assert.equal(free.points, paid.points);
});

test("rewards: balance, levels and what can be taken", () => {
  const s = loyaltyState({ days: ["2026-12-01", "2026-12-02"], contributionPoints: 120, spent: 0 }, "2026-12-03");
  assert.equal(s.lifetime, 123);
  assert.equal(s.balance, 123);
  assert.equal(s.level.key, "regular");
  assert.equal(s.today, 3);
  assert.equal(loyaltyState({ days: [], contributionPoints: 50, spent: 80 }, "2026-12-03").balance, 0, "never negative");
  assert.equal(levelFor(0).level.key, "member");
  assert.equal(levelFor(LEVELS[LEVELS.length - 1].min).next, null);
  const week = rewardByKey("premium-7")!;
  assert.equal(canRedeem(week, { balance: week.points, paying: false, slotTaken: false }).ok, true);
  assert.equal(canRedeem(week, { balance: week.points - 1, paying: false, slotTaken: false }).ok, false);
  assert.equal(canRedeem(week, { balance: 9999, paying: true, slotTaken: false }).ok, false, "a paying subscriber gets nothing from days");
  assert.equal(canRedeem(week, { balance: 9999, paying: false, slotTaken: true }).ok, false, "one Premium reward a month");
  assert.equal(redemptionSlot(week, "2026-12-31"), redemptionSlot(week, "2026-12-01"), "one slot a month");
  assert.notEqual(redemptionSlot(week, "2026-12-31"), redemptionSlot(week, "2027-01-01"));
  assert.ok(REWARDS.filter((r) => r.premiumDays > 0).every((r) => r.premiumDays <= 7), "at most 7 Premium days a month");
});

test("rewards: nothing that costs cash until the owner approves a budget", () => {
  for (const r of REWARDS) assert.equal(r.cashCost, 0, r.key);
  // A month of perfect check-ins (255) can't take the week of Premium on its own; about five weeks can.
  assert.ok(REWARDS.every((r) => r.points >= 300));
});

test("rewards: the loyalty files never touch payments, and pages never import the server half", () => {
  for (const f of ["src/lib/loyalty.ts", "src/lib/streak.ts", "src/components/MemberRewardsCard.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/checkout|stripe\.|createCheckout/i.test(src), f);
  }
  assert.ok(!readFileSync("src/components/MemberRewardsCard.tsx", "utf8").includes("loyalty-server"));
  assert.ok(!readFileSync("src/app/profile/page.tsx", "utf8").includes("loyalty-server"));
});
