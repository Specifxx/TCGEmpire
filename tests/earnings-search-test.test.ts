import test from "node:test";
import assert from "node:assert/strict";
import { paidPer100, searchEarnings, valueCounts } from "../src/lib/earnings/search-test";
import { searchTestLines } from "../src/lib/hq/weekly-email";

test("valueCounts: one count per event-data value, summed", () => {
  const m = valueCounts({ data: [{ "eventData/results": "0", count: 4 }, { "eventData/results": 12, count: 3 }, { "eventData/results": "0", count: 1 }] });
  assert.equal(m.get("0"), 5);
  assert.equal(m.get("12"), 3);
  assert.equal(valueCounts(null).size, 0);
});

test("searchEarnings: only ce-search / ce-mcp tags, inside the range", () => {
  const tags = [
    { day: "2026-11-09", tag: "ce-search-au", currency: "AUD", cents: 500, pendingCents: 0, sales: 1 },
    { day: "2026-11-09", tag: "ce-mcp-us", currency: "AUD", cents: 200, pendingCents: 0, sales: 1 },
    { day: "2026-11-09", tag: "ce-product-au", currency: "AUD", cents: 900, pendingCents: 0, sales: 1 },
    { day: "2026-10-01", tag: "ce-search-au", currency: "AUD", cents: 999, pendingCents: 0, sales: 1 },
  ];
  const r = searchEarnings([{ key: "ebay", status: "ok", days: [], tags } as never], "2026-11-10");
  assert.deepEqual(r, { d7: 700, d30: 700 });
  assert.deepEqual(searchEarnings(null, "2026-11-10"), { d7: 0, d30: 0 });
});

test("the Monday lines: counts, rate, senders and empty words; nothing private", () => {
  const c = { searches: 200, empty: 30, resultClicks: 60, paidClicks: 9 };
  assert.equal(paidPer100(c), 4.5);
  assert.equal(paidPer100({ ...c, searches: 0 }), null);
  const lines = searchTestLines({
    test: { status: "ok", fetchedAt: 0, d7: c, d30: c, bySite: [{ from: "dex", count: 120 }], noResult: [{ q: "dyson v15", count: 7 }] },
    earned: { d7: 700, d30: 700 },
  });
  assert.match(lines[0], /200 searches \(30 found nothing\).*9 paid eBay clicks \(4\.5 per 100 searches\)/);
  assert.ok(lines.some((l) => /Sent by: dex 120/.test(l)));
  assert.ok(lines.some((l) => /“dyson v15” 7/.test(l)));
  assert.deepEqual(searchTestLines(null), []);
});
