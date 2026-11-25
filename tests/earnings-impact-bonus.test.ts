import { test } from "node:test";
import assert from "node:assert/strict";
import { impactBonuses, impactBonusDays, monthEndOf } from "../src/lib/earnings/core";

// Impact performance bonuses come from invoice lines whose Description is "BONUS"
// (owner, 2026-11-23), never from Actions; MEDIA_PAYOUT lines are the commissions
// the Actions already count, so they must be left out.
const invoices = {
  Invoices: [
    {
      Id: "INV-1",
      CreatedDate: "2026-12-05T03:00:00Z",
      Currency: "USD",
      LineItems: [
        { CampaignId: "1", CampaignName: "TCGplayer", Description: "MEDIA_PAYOUT", EventMonthYear: "2026-11", NetItemAmount: "900.00", Status: "PENDING" },
        { CampaignId: "1", CampaignName: "TCGplayer", Description: "BONUS", EventMonthYear: "2026-11", NetItemAmount: "123.45", Status: "PENDING" },
      ],
    },
    {
      Id: "INV-0",
      CreatedDate: "2026-11-05T03:00:00Z",
      Currency: "USD",
      LineItems: [{ CampaignId: "1", Description: "Bonus", EventMonthYear: "10/2026", TotalItemAmount: 50, Status: "PAID" }],
    },
  ],
};

test("only BONUS lines count, dated to the end of the month they reward", () => {
  const b = impactBonuses(invoices, "2026-12-10");
  assert.equal(b.length, 2);
  assert.deepEqual(
    impactBonusDays(b),
    [
      { day: "2026-10-31", currency: "USD", cents: 5000, pendingCents: 0 },
      { day: "2026-11-30", currency: "USD", cents: 12345, pendingCents: 12345 },
    ].sort((x, y) => x.day.localeCompare(y.day)),
  );
});

test("an invoice read in two overlapping windows counts its bonus once", () => {
  const b = impactBonuses(invoices, "2026-12-10");
  const days = impactBonusDays([...b, ...b]);
  assert.equal(days.reduce((s, d) => s + d.cents, 0), 17345);
});

test("a bonus never lands after today, and bad input is empty", () => {
  const b = impactBonuses({ Invoices: [{ Id: "X", Currency: "usd", LineItems: [{ Description: "BONUS", EventMonthYear: "2026-11", NetItemAmount: 10 }] }] }, "2026-11-23");
  assert.equal(b[0].day, "2026-11-23");
  assert.equal(b[0].currency, "USD");
  assert.deepEqual(impactBonuses(null, "2026-11-23"), []);
  assert.deepEqual(impactBonuses({ Invoices: [{ LineItems: "nope" }] }, "2026-11-23"), []);
});

test("month formats", () => {
  assert.equal(monthEndOf("2026-02"), "2026-02-28");
  assert.equal(monthEndOf("11/2026"), "2026-11-30");
  assert.equal(monthEndOf("2026-11-01T00:00:00Z"), "2026-11-30");
  assert.equal(monthEndOf("November 2026"), "2026-11-30");
  assert.equal(monthEndOf("garbage"), null);
});
