import { test } from "node:test";
import assert from "node:assert/strict";
import { visitorsWeek, trendMet, FAMILY_TRENDS } from "../src/lib/hq/trends";
import { trendTargetLine } from "../src/lib/hq/weekly-email";

test("visitorsWeek sums the last 7 full days against the 7 before", () => {
  const days = (v: number) => Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(2 + i).padStart(2, "0")}`, visitors: i < 7 ? v : v * 2 }));
  const w = visitorsWeek([{ key: "a", days: days(10) }, { key: "b", days: days(5) }], "2026-11-16");
  assert.deepEqual(w, { prev7: 105, last7: 210 });
  assert.deepEqual(visitorsWeek([], "2026-11-16"), { last7: null, prev7: null });
});

test("trendMet and the target line read the target, not the sign", () => {
  assert.equal(trendMet({ last7: 106, prev7: 100 }, 5), true);
  assert.equal(trendMet({ last7: 104, prev7: 100 }, 5), false);
  assert.equal(trendMet({ last7: 1, prev7: 0 }, 5), null);
  const l = trendTargetLine(FAMILY_TRENDS.visitors.label, { last7: 17297, prev7: 17566 }, 5, "visitors");
  assert.equal(l.met, false);
  assert.match(l.text, /Visitors, every site: 17,297 vs 17,566 \(-2%; target \+5%\)/);
});
