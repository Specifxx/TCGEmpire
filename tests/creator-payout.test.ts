import { test } from "node:test";
import assert from "node:assert/strict";
import { creatorFromCookie, creatorPayoutCents, looksLikeBot, rollUpByMonth } from "../src/lib/creator-payout";

test("the owner's example: half the traffic of $1,000 at 25% is $125", () => {
  assert.equal(creatorPayoutCents(20000, { totalVisitors: 40000, affiliateRevenueCents: 100000, sharePct: 25 }), 12500);
  assert.equal(creatorPayoutCents(20000, { totalVisitors: 40000, affiliateRevenueCents: 100000, sharePct: 10 }), 5000);
  assert.equal(creatorPayoutCents(9, { totalVisitors: 0, affiliateRevenueCents: 100000, sharePct: 25 }), 0);
  assert.equal(creatorPayoutCents(500, { totalVisitors: 100, affiliateRevenueCents: 1000, sharePct: 25 }), 250);
});

test("cookie, bots and monthly roll-up", () => {
  assert.equal(creatorFromCookie("a=1; rc_creator=riftsandbounds; b=2"), "riftsandbounds");
  assert.equal(creatorFromCookie("rc_creator=<x>"), null);
  assert.ok(looksLikeBot("Googlebot/2.1") && looksLikeBot(null) && !looksLikeBot("Mozilla/5.0 (iPhone)"));
  const r = rollUpByMonth([
    { slug: "a", day: "2026-10-01", visits: 2, buyClicks: 1 },
    { slug: "a", day: "2026-10-09", visits: 3, buyClicks: 0 },
    { slug: "a", day: "2026-11-01", visits: 1, buyClicks: 0 },
  ]);
  assert.equal(r[0][0], "2026-11");
  assert.deepEqual(r[1][1].get("a"), { visits: 5, buyClicks: 1 });
});
