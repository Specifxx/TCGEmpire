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

import { entryWeight, weightedPick, publicName, BONUS_ENTRIES, MAX_REFERRAL_ENTRIES } from "../src/lib/giveaway";

test("Premium never beats a free account: a price watch earns the same entries", () => {
  assert.equal(entryWeight({ premium: false, watches: 0 }).weight, 1);
  assert.equal(entryWeight({ premium: true, watches: 0 }).weight, BONUS_ENTRIES);
  assert.equal(entryWeight({ premium: false, watches: 1 }).weight, BONUS_ENTRIES);
  assert.equal(entryWeight({ premium: true, watches: 5 }).weight, BONUS_ENTRIES);
});

test("confirmed referrals add one entry each, capped", () => {
  assert.equal(entryWeight({ premium: false, watches: 0, referrals: 2 }).weight, 3);
  assert.equal(entryWeight({ premium: false, watches: 1, referrals: 99 }).weight, BONUS_ENTRIES + MAX_REFERRAL_ENTRIES);
  assert.equal(entryWeight({ premium: false, watches: 0, referrals: -4 }).weight, 1);
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
