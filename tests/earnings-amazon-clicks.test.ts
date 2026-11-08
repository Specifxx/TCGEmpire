import test from "node:test";
import assert from "node:assert/strict";
import { amazonCount, foldSites } from "../src/lib/earnings/amazon-clicks";

test("amazonCount sums only rows whose value names Amazon", () => {
  const json = { data: [{ eventData: "Amazon US", count: 5 }, { eventData: "amazon-card", count: 2 }, { eventData: "ebay", count: 9 }, { eventData: "Others", count: 4 }] };
  assert.equal(amazonCount(json), 7);
  assert.equal(amazonCount(null), 0);
  assert.equal(amazonCount({ data: "x" }), 0);
});

test("foldSites merges projects of one site, drops zeros, sorts by 30 days", () => {
  const siteOf = (p: string) => (p.startsWith("dex") ? "dex" : p);
  const out = foldSites([{ project: "dex-a", d7: 1, d30: 3 }, { project: "dex-b", d7: 0, d30: 4 }, { project: "x", d7: 0, d30: 0 }, { project: "y", d7: 2, d30: 9 }], siteOf);
  assert.deepEqual(out.map((s) => [s.site, s.d7, s.d30]), [["y", 2, 9], ["dex", 1, 7]]);
});
