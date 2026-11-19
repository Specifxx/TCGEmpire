import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { auditRows, auditTotal, AUDIT_DIMS } from "../src/lib/analytics/traffic-audit";

test("traffic audit rows: value → [visitors, pageviews], an empty value is (none)", () => {
  const json = { data: [{ referrer: "google.com", visitors: 5, pageviews: 9 }, { referrer: "", visitors: 2, pageviews: 2 }, { referrer: null, visitors: 1, pageviews: 1 }] };
  assert.deepEqual(auditRows(json, "referrer"), { "google.com": [5, 9], "(none)": [3, 3] });
  assert.deepEqual(auditRows(null, "referrer"), {});
  assert.deepEqual(auditTotal({ data: [{ visitors: 3, pageviews: 4 }, { visitors: 1, count: 2 }] }), [4, 6]);
  assert.deepEqual(auditTotal({ data: { visitors: 7, pageviews: 8 } }), [7, 8]);
});

test("the audit is counts only: no path or query-string dimension", () => {
  for (const d of AUDIT_DIMS) assert.ok(!/path|query|url/i.test(d), d);
  const route = readFileSync("src/app/api/demand/[site]/route.ts", "utf8");
  assert.match(route, /audit") === "1"/);
});
