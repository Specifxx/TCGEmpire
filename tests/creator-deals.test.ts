import test from "node:test";
import assert from "node:assert/strict";
import { creatorMarkFor, creatorMark, visitMarkFor, tagHref, hasMark } from "../src/lib/paid-visit";
import {
  CREATOR_DEALS,
  DEFAULT_RATE_CENTS,
  DEFAULT_TRIAL_CAP_CENTS,
  PROGRAMME_MONTHLY_CAP_CENTS,
  accruedCents,
  creatorDealRows,
  programmeHeadroom,
  CLIPPER_INTAKE_SHARE,
  dealDay,
  dealLink,
  earnedByDeal,
  markOf,
  parseCreatorStats,
  paysDeal,
  programmeSpentThisMonth,
  verdictForDeal,
  type CreatorDeal,
} from "../src/lib/earnings/creator-deals";
import type { CostEntry } from "../src/lib/earnings/core";

// Pay-per-click creators (owner, 2026-11-20): paid per tracked buy click, A$300 a month at
// most, cut on day 21 unless their visitors earned 1.5x what they were paid.

const deal = (over: Partial<CreatorDeal> = {}): CreatorDeal => ({
  id: "pokechamp",
  handle: "@pokechamp__",
  platform: "Instagram",
  sites: ["DexCompare"],
  utmCampaign: "pokechamp__",
  start: "2026-11-20",
  rateCents: DEFAULT_RATE_CENTS,
  trialCapCents: DEFAULT_TRIAL_CAP_CENTS,
  currency: "AUD",
  status: "trial",
  ...over,
});

const cost = (over: Partial<CostEntry>): CostEntry => ({
  id: "c1",
  label: "Creator payout [pokechamp]",
  category: "Creators",
  amountCents: 1000,
  currency: "AUD",
  startDay: "2026-11-25",
  recurrence: "once",
  endDay: null,
  ...over,
});

test("a creator landing gets cr + six letters of its campaign; a paid ad still wins", () => {
  assert.equal(creatorMarkFor("?utm_source=instagram&utm_medium=creator&utm_campaign=pokechamp__"), "crpokech");
  assert.equal(creatorMarkFor("?utm_source=instagram&utm_medium=social&utm_campaign=pokechamp"), null);
  assert.equal(creatorMarkFor("?utm_medium=creator"), null, "no campaign, nothing to attribute");
  assert.equal(creatorMark("a"), null);
  assert.equal(visitMarkFor("?utm_source=facebook&utm_medium=paid&utm_campaign=x"), "fbad");
  assert.equal(visitMarkFor("?utm_source=tiktok&utm_medium=creator&utm_campaign=Brodie.Plays"), "crbrodie");
});

test("a creator marker tags the sub-id like an ad marker", () => {
  const tcg = "https://partner.tcgplayer.com/c/1/2/3?subId1=dex-us-price&sharedid=dex-us-price&u=x";
  const t = tagHref(tcg, "crpokech")!;
  assert.match(t, /subId1=dex-us-price-crpokech&sharedid=dex-us-price-crpokech/);
  assert.ok(hasMark("dex-us-price-crpokech", "crpokech"));
  assert.ok(!hasMark("dex-us-price-crpokechx", "crpokech"));
});

test("every signed deal has its own marker, a sane rate and the default link format", () => {
  const marks = CREATOR_DEALS.map(markOf);
  assert.ok(marks.every(Boolean), "every deal's utm_campaign yields a marker");
  assert.equal(new Set(marks).size, marks.length, "two deals would share sales");
  assert.equal(new Set(CREATOR_DEALS.map((d) => d.id)).size, CREATOR_DEALS.length);
  for (const d of CREATOR_DEALS) {
    assert.match(d.id, /^[a-z0-9-]{2,30}$/);
    assert.ok(d.rateCents > 0 && d.rateCents <= 10, `${d.id}: no more than A$0.10 a click without the owner`);
    assert.ok(d.trialCapCents <= PROGRAMME_MONTHLY_CAP_CENTS);
    assert.match(d.start, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(
    dealLink("https://dexcompare.io", deal(), "/us"),
    "https://dexcompare.io/us?utm_source=instagram&utm_medium=creator&utm_campaign=pokechamp__",
  );
});

test("paid comes from Creators costs naming the deal; the month's programme total counts every creator", () => {
  assert.ok(paysDeal(cost({}), "pokechamp"));
  assert.ok(!paysDeal(cost({ category: "Ads" }), "pokechamp"));
  assert.ok(!paysDeal(cost({ label: "Creator payout [other]" }), "pokechamp"));
  const costs = [cost({}), cost({ id: "c2", label: "Creator payout [other]", amountCents: 500 }), cost({ id: "c3", startDay: "2026-10-30" })];
  assert.equal(programmeSpentThisMonth(costs, "2026-11-30", "AUD"), 1500);
  const rows = creatorDealRows({}, [], costs, "2026-11-30", "AUD", [deal()]);
  assert.equal(rows[0].paid, 2000);
});

test("earned is only sales tagged with the creator's marker, from the deal's start", () => {
  const rows = [
    { day: "2026-11-21", tag: "dex-us-price-crpokech", currency: "AUD", cents: 400, pendingCents: 400, sales: 1 },
    { day: "2026-11-21", tag: "rc-us-ebay-crpokech", currency: "AUD", cents: 100, pendingCents: 0, sales: 1 }, // same creator, other site
    { day: "2026-11-21", tag: "dex-us-price", currency: "AUD", cents: 900, pendingCents: 0, sales: 1 },
    { day: "2026-11-19", tag: "dex-us-price-crpokech", currency: "AUD", cents: 300, pendingCents: 0, sales: 1 },
  ];
  assert.deepEqual(earnedByDeal(deal(), [rows], "AUD"), { cents: 500, pendingCents: 400, sales: 2 });
});

test("accrual is clicks times rate, capped in the trial", () => {
  assert.equal(accruedCents(deal(), 100), 400);
  assert.equal(accruedCents(deal(), 10_000), DEFAULT_TRIAL_CAP_CENTS);
  assert.equal(accruedCents(deal({ status: "keep" }), 10_000), 40_000);
  assert.equal(accruedCents(deal(), null), 0);
});

test("the kill rule: under 1.5x on day 21 is cut, at 1.5x is kept", () => {
  const d = deal();
  assert.equal(dealDay(d, "2026-11-20"), 1);
  assert.equal(dealDay(d, "2026-12-10"), 21);
  assert.equal(verdictForDeal(d, 5, 0, 0, 0).key, "trial");
  assert.equal(verdictForDeal(d, 5, 0, 1000, 1600).key, "on-track");
  assert.equal(verdictForDeal(d, 5, 0, 1000, 1000).key, "behind");
  assert.equal(verdictForDeal(d, 21, 1000, 0, 1499).key, "cut");
  assert.equal(verdictForDeal(d, 21, 1000, 0, 1500).key, "keep");
  assert.equal(verdictForDeal(d, 21, 0, 0, 0).key, "keep", "nothing paid, nothing lost");
  assert.equal(verdictForDeal(deal({ status: "cut" }), 30, 1000, 0, 9999).key, "cut");
});

test("owed is accrued minus paid, never negative", () => {
  const rows = creatorDealRows({ pokechamp: { asOf: "2026-11-25T00:00:00Z", buyClicks: 300, visitors: 900 } }, [], [cost({})], "2026-11-30", "AUD", [deal()]);
  assert.equal(rows[0].owed, 200); // 300 × 4c = 1200, 1000 paid
  const over = creatorDealRows({ pokechamp: { asOf: "2026-11-25T00:00:00Z", buyClicks: 10, visitors: 9 } }, [], [cost({})], "2026-11-30", "AUD", [deal()]);
  assert.equal(over[0].owed, 0);
});

test("posted figures: only known deals, only sane numbers", () => {
  const out = parseCreatorStats({ stats: { pokechamp: { buyClicks: "12", visitors: -3 }, nobody: { buyClicks: 1 } } }, [deal()]);
  assert.deepEqual(Object.keys(out), ["pokechamp"]);
  assert.equal(out.pokechamp.buyClicks, 12);
  assert.equal(out.pokechamp.visitors, null);
});

test("open clipping: owed is credited oldest deal first and never takes the month past A$300", () => {
  // 15 kept clippers (no trial cap), each with 600 clicks (A$24): A$360 accrued against A$300 left.
  const deals = Array.from({ length: 15 }, (_, i) =>
    deal({ id: `clip${i}`, utmCampaign: `clipper${i}`, start: `2026-11-${String(10 + i).padStart(2, "0")}`, status: "keep", kind: "clipper" }),
  );
  const stats = Object.fromEntries(deals.map((d) => [d.id, { asOf: "2026-11-29T00:00:00Z", buyClicks: 600, visitors: 900 }]));
  const rows = creatorDealRows(stats, [], [], "2026-11-30", "AUD", deals);
  const owed = rows.reduce((n, r) => n + r.owed, 0);
  assert.equal(owed, 30_000);
  assert.equal(rows[0].owed, 2400, "the oldest deal is credited in full");
  assert.equal(rows[14].owed, 0, "the newest deal is held");
  assert.equal(rows[14].heldByCap, 2400);
  assert.equal(rows[12].owed + rows[12].heldByCap, 2400, "held plus owed is what was accrued");
  const head = programmeHeadroom(rows, [], "2026-11-30", "AUD");
  assert.equal(head.remaining, 0);
  assert.equal(head.newClippersOpen, false);
});

test("payouts already made this month count against the cap, and intake closes at 90%", () => {
  const paidOut = cost({ id: "p1", label: "Creator payout [other]", amountCents: 26_000 });
  const rows = creatorDealRows({ pokechamp: { asOf: "2026-11-25T00:00:00Z", buyClicks: 500, visitors: 900 } }, [], [paidOut], "2026-11-30", "AUD", [deal()]);
  assert.equal(rows[0].owed, 2000, "A$20 owed fits in the A$40 left");
  const head = programmeHeadroom(rows, [paidOut], "2026-11-30", "AUD");
  assert.equal(head.committed, 28_000);
  assert.ok(28_000 >= 30_000 * CLIPPER_INTAKE_SHARE);
  assert.equal(head.newClippersOpen, false);
  assert.equal(programmeHeadroom([], [], "2026-11-30", "AUD").newClippersOpen, true);
});
