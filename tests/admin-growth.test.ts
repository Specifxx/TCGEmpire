import { test } from "node:test";
import assert from "node:assert/strict";
import { weekCompare } from "../src/lib/admin-growth";

const days = (vals: (number | null)[]) => vals.map((v, i) => ({ d: `2026-10-${String(i + 1).padStart(2, "0")}`, v }));

test("weekCompare leaves today out and compares the last 7 full days with the 7 before", () => {
  const vals = [...Array(7).fill(10), ...Array(7).fill(20), 999];
  assert.deepEqual(weekCompare(days(vals)), { last7: 140, prev7: 70 });
});

test("weekCompare ends a late source's weeks at its newest reported day", () => {
  const vals = [...Array(7).fill(1), ...Array(7).fill(2), null, null, null];
  assert.deepEqual(weekCompare(days(vals)), { last7: 14, prev7: 7 });
});

test("weekCompare gives no comparison for a week with a gap", () => {
  const vals = [...Array(7).fill(1), 2, 2, null, 2, 2, 2, 2, 5];
  assert.deepEqual(weekCompare(days(vals)), { last7: null, prev7: 7 });
});

test("findSplitQueries keeps queries our own pages share, folding #fragments into their page", async () => {
  const { findSplitQueries } = await import("../src/lib/ops/gsc-daily");
  const row = (q: string, u: string, impressions: number, position = 8, clicks = 0) => ({ keys: [q, u], impressions, position, clicks });
  const out = findSplitQueries([
    row("card list", "https://riftcompare.com/sets/radiance", 300, 8),
    row("card list", "https://riftcompare.com/sets/radiance/gallery", 200, 7),
    row("card list", "https://riftcompare.com/blog/x", 10),
    row("leaks", "https://riftcompare.com/blog/leaks", 120),
    row("leaks", "https://riftcompare.com/blog/leaks#deploy", 80),
    row("small", "https://riftcompare.com/a", 40),
    row("small", "https://riftcompare.com/b", 40),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].query, "card list");
  assert.equal(out[0].impr, 510);
  assert.deepEqual(out[0].pages.map((p) => p.page), ["/sets/radiance", "/sets/radiance/gallery"]);
});

test("propertiesByHost groups a site's Domain, https, http and www properties", async () => {
  const { propertiesByHost } = await import("../src/lib/ops/gsc-daily");
  const m = propertiesByHost(["https://www.opcompare.app/", "https://riftcompare.com/", "sc-domain:riftcompare.com", "http://riftcompare.com/", "sc-domain:opcompare.app"]);
  assert.deepEqual([...m.keys()], ["opcompare.app", "riftcompare.com"]);
  assert.equal(m.get("riftcompare.com")?.length, 3);
});

test("mergeGscDays takes each day from the property that saw the most, never adds them", async () => {
  const { mergeGscDays } = await import("../src/lib/ops/gsc-daily");
  const prefix = [{ d: "2026-10-20", clicks: 5, impr: 100, pos: 9 }, { d: "2026-10-26", clicks: 8, impr: 200, pos: 9 }];
  const domain = [{ d: "2026-10-26", clicks: 9, impr: 230, pos: 9 }];
  assert.deepEqual(mergeGscDays([prefix, domain]).map((d) => [d.d, d.clicks]), [["2026-10-20", 5], ["2026-10-26", 9]]);
});
