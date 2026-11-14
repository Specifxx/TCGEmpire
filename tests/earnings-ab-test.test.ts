import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AB_FROM, AB_SHOWN_UNTIL, AB_TO, abTestLines, armOfKey, compare, normalCdf, splitByArm, type AbTest } from "../src/lib/earnings/ab-test";

// The quick view's A/B tests on DexCompare and MTG Compare (owner, 2026-11-14; DECISIONS.md): the reader's arithmetic, the
// fixed dates, and the rule that no verdict is printed before the last day.

test("keys split into arms; a visit a test does not apply to is in neither", () => {
  const counts = { "us:aba": 10, "us:bba": 7, "uk:-ba": 5, "us:a-b": 3, other: 99 };
  assert.deepEqual(splitByArm(counts, "order"), { a: 13, b: 7 });
  assert.deepEqual(splitByArm(counts, "mini"), { a: 0, b: 22 });
  assert.deepEqual(splitByArm(counts, "cta"), { a: 22, b: 3 });
  assert.equal(armOfKey("uk:-ba", "order"), null);
  assert.deepEqual(splitByArm(undefined, "cta"), { a: 0, b: 0 });
});

test("the two-proportion test", () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  const r = compare({ hits: 100, n: 1000 }, { hits: 130, n: 1000 });
  assert.ok(r && r.p > 0.03 && r.p < 0.04 && Math.abs((r.lift ?? 0) - 0.3) < 1e-9);
  assert.equal(compare({ hits: 0, n: 0 }, { hits: 1, n: 5 }), null);
});

const stored: AbTest = {
  status: "ok",
  fetchedAt: 0,
  sites: [
    { key: "dex", counts: { ab_seen: { "us:aaa": 1000, "us:baa": 1000 }, ab_tcg: { "us:aaa": 100, "us:baa": 130 }, ab_ebay: { "us:aaa": 60, "us:baa": 55 }, ab_paid: { "us:aaa": 150, "us:baa": 175 } } },
    { key: "mtg", counts: {} },
  ],
};

// The sites' own src/lib/ab.ts pins the same span (AB_START 2026-11-20T00:00Z, AB_END 2026-12-04T00:00Z) in its tests/ab.test.ts.
test("the same dates as the sites: fourteen whole days from 20 November", () => {
  assert.equal(AB_FROM, "2026-11-20");
  assert.equal(AB_TO, "2026-12-03");
});

test("nothing before the first day or after the last report; no verdict while the tests run", () => {
  assert.deepEqual(abTestLines(stored, "2026-11-19"), []);
  assert.deepEqual(abTestLines(stored, "2026-12-15"), []);
  assert.equal(AB_SHOWN_UNTIL, "2026-12-14");
  const running = abTestLines(stored, "2026-11-23");
  assert.match(running[0], /Running.*no verdict before the last day/);
  assert.ok(running.every((l) => !/RESULT/.test(l)));
  const dex = running.find((l) => l.startsWith("DexCompare, order"));
  assert.ok(dex);
  assert.match(dex, /visits A 1,000, B 1,000\. TCGplayer click A 10\.0% \(100\), B 13\.0% \(130\), \+30%, p 0\.03\d/);
  assert.ok(running.some((l) => /^MTG Compare, order.*No visits in both arms yet/.test(l)));
  assert.ok(!running.some((l) => l.startsWith("MTG Compare, mini")), "MTG Compare's quick view has no small ad pair");
});

test("after the last day the first measure decides, at p under 0.05, else the control stays", () => {
  const done = abTestLines(stored, "2026-12-04");
  assert.match(done[0], /^Finished/);
  assert.match(done.find((l) => l.startsWith("DexCompare, order")) ?? "", /RESULT: B wins\.$/);
  const flat: AbTest = { ...stored, sites: [{ key: "dex", counts: { ab_seen: { "us:aaa": 1000, "us:baa": 1000 }, ab_tcg: { "us:aaa": 100, "us:baa": 104 } } }] };
  assert.match(abTestLines(flat, "2026-12-04").find((l) => l.startsWith("DexCompare, order")) ?? "", /RESULT: no difference found, the control stays\.$/);
  assert.deepEqual(abTestLines(null, "2026-11-23"), ["Not collected yet (the earnings refresh reads it every three hours)."]);
});

test("the refresh and both reports read it", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/app/api/cron/earnings-refresh/route.ts"), /storeAbTest\(\)/);
  assert.match(read("src/app/api/cron/weekly-report/route.ts"), /abTests: abTestLines\(abTest, today\)/);
  assert.match(read("src/app/admin/hq/page.tsx"), /abTestLines\(abTest, dayIn\(Date\.now\(\)\)\)/);
});
