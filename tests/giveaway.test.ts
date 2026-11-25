import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENT_GIVEAWAY as G, entryCounts, giveawayState, notifyOnCount } from "../src/lib/giveaway";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

test("giveaway window: upcoming, open, closed", () => {
  assert.equal(giveawayState(G, new Date(Date.parse(G.opensAt) - 1000)), "upcoming");
  assert.equal(giveawayState(G, new Date(Date.parse(G.opensAt) + 1000)), "open");
  assert.equal(giveawayState(G, new Date(Date.parse(G.closesAt) + 1000)), "closed");
  assert.equal(entryCounts(G, new Date(Date.parse(G.closesAt) + 1)), false);
});

test("closes 14 Dec 2026 at 23:59 Sydney time", () => {
  assert.equal(G.closesAt, "2026-12-14T12:59:59Z");
});

test("owner is emailed on the first entry and every 50th only", () => {
  assert.equal(notifyOnCount(1), true);
  assert.equal(notifyOnCount(2), false);
  assert.equal(notifyOnCount(50), true);
  assert.equal(notifyOnCount(51), false);
});

test("entries are private and one per account", () => {
  assert.ok(!(PUBLIC_MODELS as readonly string[]).some((m) => m.toLowerCase().includes("giveaway")));
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model GiveawayEntry \{[\s\S]*?@@unique\(\[giveaway, userId\]\)/);
});

test("the public page reads no session or database", () => {
  const page = readFileSync("src/app/giveaway/page.tsx", "utf8");
  assert.doesNotMatch(page, /@\/lib\/db|getCurrentUser|cookies\(|headers\(/);
  assert.match(page, /No purchase necessary/);
  assert.match(page, /void/);
});

import {
  entryPoints,
  weightedPick,
  publicName,
  assignTickets,
  ticketHolder,
  drandRoundAt,
  giveawayFor,
  GIVEAWAYS,
  ENTRY_POINTS,
  BONUS_POINTS,
  CHECKIN_POINTS,
  REFERRAL_POINTS,
  MAX_REFERRALS,
  PREMIUM_START_POINTS,
  DRAND_GENESIS,
  DRAND_PERIOD,
} from "../src/lib/giveaway";
import { winningTicket, drawSeed } from "../src/lib/giveaway-draw";

const none = { premium: false, watches: 0, bonusClaimed: false, checkins: 0 };

test("points: 10 to enter, 50 for Premium, and a free account reaches the same 50 (no purchase necessary)", () => {
  assert.equal(ENTRY_POINTS, 10);
  assert.equal(PREMIUM_START_POINTS, 50);
  assert.equal(entryPoints(none).points, 10);
  assert.equal(entryPoints({ ...none, premium: true }).points, 50);
  assert.equal(entryPoints({ ...none, watches: 1 }).points, 50);
  assert.equal(entryPoints({ ...none, bonusClaimed: true }).points, 50);
  // Premium and a free bonus never stack.
  assert.equal(entryPoints({ ...none, premium: true, watches: 3, bonusClaimed: true }).points, ENTRY_POINTS + BONUS_POINTS);
  assert.equal(entryPoints({ ...none, premium: true }).bonusVia, "premium");
  assert.equal(entryPoints({ ...none, bonusClaimed: true }).bonusVia, "claim");
});

test("points: 5 a check-in day, 25 a confirmed friend, friends capped", () => {
  assert.equal(entryPoints({ ...none, checkins: 4 }).points, 10 + 4 * CHECKIN_POINTS);
  assert.equal(entryPoints({ ...none, referrals: 2 }).points, 10 + 2 * REFERRAL_POINTS);
  assert.equal(entryPoints({ ...none, referrals: 99 }).referralsCounted, MAX_REFERRALS);
  assert.equal(entryPoints({ ...none, referrals: -4, checkins: -2 }).points, 10);
});

test("tickets run in entry order, one per point, and every ticket has one holder", () => {
  const d = (s: string) => new Date(s);
  const rows = [
    { userId: "b", enteredAt: d("2026-11-20T00:00:00Z"), weight: 50 },
    { userId: "a", enteredAt: d("2026-11-19T00:00:00Z"), weight: 10 },
    { userId: "c", enteredAt: d("2026-11-20T00:00:00Z"), weight: 15 },
    { userId: "z", enteredAt: d("2026-11-18T00:00:00Z"), weight: 0 },
  ];
  const { runs, total } = assignTickets(rows);
  assert.equal(total, 75);
  assert.deepEqual(runs.map((r) => [r.userId, r.from, r.to]), [["a", 1, 10], ["b", 11, 60], ["c", 61, 75]]);
  assert.equal(ticketHolder(runs, 1)?.userId, "a");
  assert.equal(ticketHolder(runs, 60)?.userId, "b");
  assert.equal(ticketHolder(runs, 61)?.userId, "c");
  assert.equal(ticketHolder(runs, 76), null);
});

test("the draw: drand's randomness mod tickets, redraws from SHA-256, always in range", () => {
  const r = "a".repeat(64);
  const t = winningTicket(r, 75);
  assert.equal(t, Number(BigInt(`0x${r}`) % 75n) + 1);
  for (let attempt = 0; attempt < 3; attempt++) {
    const n = winningTicket(r, 7, attempt);
    assert.ok(n >= 1 && n <= 7);
  }
  assert.notEqual(drawSeed(r, 1), drawSeed(r, 0));
  assert.throws(() => winningTicket("not-hex", 5));
  assert.throws(() => winningTicket(r, 0));
});

test("the drand round is the first one published at or after the close", () => {
  const close = "2026-12-14T12:59:59Z";
  const round = drandRoundAt(close);
  const at = DRAND_GENESIS + (round - 1) * DRAND_PERIOD;
  assert.ok(at >= Date.parse(close) / 1000);
  assert.ok(at - DRAND_PERIOD < Date.parse(close) / 1000);
});

test("five sites, one giveaway each, every two months, prizes under the owner's A$20 for the sisters", () => {
  const now = new Date("2026-11-25T00:00:00Z");
  for (const site of ["rift", "dex", "mtg", "ygo", "op"] as const) {
    const g = giveawayFor(site, now);
    assert.ok(g, site);
    assert.equal(g!.site, site);
  }
  const keys = new Set(GIVEAWAYS.map((g) => g.key));
  assert.equal(keys.size, GIVEAWAYS.length);
  for (const g of GIVEAWAYS.filter((x) => x.site !== "rift")) assert.match(g.approxValue, /A\$1[0-9]|A\$20\b/);
});

test("the draw is weighted by entries", () => {
  const items = [{ id: "a", weight: 1 }, { id: "b", weight: 3 }, { id: "c", weight: 0 }];
  const hits: Record<string, number> = {};
  for (let t = 0; t < 4; t++) {
    const w = weightedPick(items, () => t)!;
    hits[w.id] = (hits[w.id] ?? 0) + 1;
  }
  assert.deepEqual(hits, { a: 1, b: 3 });
  assert.equal(weightedPick([], () => 0), null);
});

test("the leaderboard never shows an email or a full surname", () => {
  assert.equal(publicName("Bill Yang", true), "Bill Y.");
  assert.equal(publicName("bill.jyang101", true), "bil***");
  assert.equal(publicName("someone@example.com", true), "Anonymous entrant");
  assert.equal(publicName("Bill Yang", false), "Anonymous entrant");
  const route = readFileSync("src/app/api/giveaway/leaderboard/route.ts", "utf8");
  assert.doesNotMatch(route, /email:|\.email\b(?!s)/);
  assert.doesNotMatch(route, /cookies\(|getCurrentUser/);
});

test("the admin page and CSV are admin-only", () => {
  for (const f of ["src/app/admin/giveaway/page.tsx", "src/app/api/admin/giveaway/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /isAdmin/);
  }
});

test("conversion funnel counts accounts, watches, returns, referrals and after-close activity", async () => {
  const { giveawayFunnel } = await import("../src/lib/giveaway");
  const g = { closesAt: "2026-12-14T12:59:59Z" };
  const entered = new Date("2026-11-20T02:00:00Z"); // 20 Nov, 1 pm Sydney
  const row = { enteredAt: entered, newAccount: false, fromGiveawayPage: false, watches: 0, referrals: 0, lastActiveAt: null as Date | null };
  const f = giveawayFunnel(
    [
      { ...row, newAccount: true, fromGiveawayPage: true, watches: 2, lastActiveAt: new Date("2026-11-20T10:00:00Z") }, // same Sydney day (9 pm)
      { ...row, newAccount: true, referrals: 3, lastActiveAt: new Date("2026-11-20T14:00:00Z") }, // 21 Nov 1 am Sydney: came back
      { ...row, watches: 1, lastActiveAt: new Date("2026-12-20T00:00:00Z") }, // after the close
      row,
    ],
    g,
  );
  assert.deepEqual(f, { entrants: 4, newAccounts: 2, fromGiveawayPage: 1, watching: 2, cameBack: 2, referrers: 1, confirmedReferrals: 3, activeAfterClose: 1 });
});

test("a star friend (Premium, or the same free check-ins) is worth 100, never more by paying than by playing", async () => {
  const { entryPoints: ep, STAR_REFERRAL_POINTS, REFERRAL_POINTS, MAX_REFERRALS } = await import("../src/lib/giveaway");
  const base = { premium: false, watches: 0, bonusClaimed: false, checkins: 0 };
  assert.equal(ep({ ...base, referrals: 2, starReferrals: 1 }).referral, STAR_REFERRAL_POINTS + REFERRAL_POINTS);
  assert.equal(ep({ ...base, referrals: 1, starReferrals: 5 }).starCounted, 1, "a star is a counted friend");
  assert.equal(ep({ ...base, referrals: 30, starReferrals: 30 }).referral, MAX_REFERRALS * STAR_REFERRAL_POINTS);
  // The free route: lib/giveaway-server.ts counts a friend with STAR_FRIEND_CHECKINS check-ins exactly like a Premium friend.
  const server = readFileSync("src/lib/giveaway-server.ts", "utf8");
  assert.match(server, /premiumUntil\.getTime\(\) > nowMs\) \|\| \(friendActive\.get\(u\.id\) \?\? 0\) >= STAR_FRIEND_CHECKINS/);
});
