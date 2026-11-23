import { test } from "node:test";
import assert from "node:assert/strict";
import { pageLine } from "../scripts/page-scorecard";

test("a scorecard line is the path and counts only, never the host", () => {
  assert.equal(pageLine("https://riftcompare.com/sets/legacy?x=1", { clicks: 3, impressions: 120, position: 7.456 }), "P /sets/legacy?x=1\t3\t120\t7.5");
  assert.equal(pageLine("https://dexcompare.io", { clicks: 0, impressions: 5, position: 12 }), "P /\t0\t5\t12.0");
});
