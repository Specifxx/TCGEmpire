import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { goaffproDays, goaffproState, uniqueGoaffpro, SOURCE_LABELS } from "../src/lib/earnings/core";
import { siteLedger } from "../src/lib/earnings/sites";

// Cardboard Hero via GoAffPro on the earnings dashboard (owner, 2026-11-23).
const sale = (o: Record<string, unknown>) => ({ order_id: 1, order_date: "2026-11-22T01:52:56.000Z", affiliate_commission: 3.5996, order_currency: "CAD", status: "approved", fulfillment_status: "", ...o });

test("an approved order is pending until shipped; rejected never counts", () => {
  assert.equal(goaffproState(sale({})), "pending");
  assert.equal(goaffproState(sale({ fulfillment_status: "fulfilled" })), "paid");
  assert.equal(goaffproState(sale({ status: "pending" })), "pending");
  assert.equal(goaffproState(sale({ status: "rejected" })), "rejected");
  assert.equal(goaffproState(sale({ status: "cancelled", fulfillment_status: "fulfilled" })), "rejected");
});

test("commission lands on the Sydney day of the order, in its own currency, pending marked", () => {
  const days = goaffproDays([sale({}), sale({ order_id: 2, fulfillment_status: "fulfilled", affiliate_commission: 1.8 }), sale({ order_id: 3, status: "rejected", affiliate_commission: 9 })]);
  assert.deepEqual(days, [{ day: "2026-11-22", currency: "CAD", cents: 540, pendingCents: 360 }]);
  assert.deepEqual(goaffproDays([sale({ order_id: 3, status: "rejected" })], "rejected").map((d) => d.cents), [360]);
  // 20:54 UTC on 22 Nov is 23 Nov in Sydney.
  assert.equal(goaffproDays([sale({ order_date: "2026-11-22T20:54:22.000Z" })])[0].day, "2026-11-23");
  assert.equal(uniqueGoaffpro([sale({}), sale({})]).length, 1);
});

test("it is a stored source with no per-site split", () => {
  assert.equal(SOURCE_LABELS.goaffpro, "Cardboard Hero (GoAffPro)");
  assert.match(fs.readFileSync("src/lib/earnings/sources.ts", "utf8"), /STORED_SOURCES[^=]*= \[[^\]]*"goaffpro"/);
  assert.match(fs.readFileSync("src/lib/earnings/sources.ts", "utf8"), /"x-shop": shop/);
  const rows = siteLedger([{ key: "goaffpro", status: "ok", fetchedAt: 0, days: [{ day: "2026-11-22", currency: "AUD", cents: 500 }] }], [], [], "2026-11-01", "2026-11-30", "AUD");
  assert.equal(rows.find((r) => r.key === "")!.earned, 500);
});
