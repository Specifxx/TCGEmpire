import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupedCounts, pairs, DEMAND_ROUTES, isDemandSite } from "../src/lib/analytics/item-demand";

test("grouped rows read as key → count, whatever the value field is called", () => {
  const v = groupedCounts({ data: [{ requestPath: "/card/a", pageviews: 12, visitors: 9 }, { requestPath: "Others", pageviews: 400 }, { requestPath: "/card/a", pageviews: 3 }] }, "requestPath", "pageviews");
  assert.deepEqual([...v], [["/card/a", 15]]);
  const e = groupedCounts({ data: [{ eventData: "surging-sparks-booster-box", count: 4 }] }, "eventData", "count");
  assert.equal(e.get("surging-sparks-booster-box"), 4);
  assert.equal(groupedCounts(null, "requestPath", "pageviews").size, 0);
});

test("28 and 7 day windows join into pairs", () => {
  assert.deepEqual(pairs(new Map([["a", 10]]), new Map([["a", 3], ["b", 2]])), { a: [10, 3], b: [2, 2] });
});

test("only known sites answer, and the route is public counts with a six-hour CDN copy", () => {
  assert.ok(isDemandSite("dex") && isDemandSite("rc") && !isDemandSite("__proto__") && !isDemandSite("x"));
  for (const routes of Object.values(DEMAND_ROUTES)) assert.ok(routes.length > 0);
  const route = readFileSync("src/app/api/demand/[site]/route.ts", "utf8");
  assert.match(route, /s-maxage=21600/);
  assert.match(route, /s-maxage=60/);
});
