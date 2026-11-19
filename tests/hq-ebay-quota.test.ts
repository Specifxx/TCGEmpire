// The eBay quota board (owner, 2026-11-19: "we cannot go past the eBay quota … we need to monitor it").
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYSETS, KEYSET_LIMIT, judgeKeyset, parseCallsByDay, parseCeStatus, parseMeta, parseOpStatus, parseUsage, type Keyset } from "../src/lib/hq/ebay-quota";

const now = new Date("2026-11-19T12:00:00Z");
const ks: Keyset = {
  id: "t",
  label: "Test app",
  sites: [
    { key: "a", label: "A", cap: 2500, source: { repo: "r", ref: "HEAD", path: "p", parse: parseUsage } },
    { key: "b", label: "B", cap: 2000, source: { repo: "r", ref: "HEAD", path: "p", parse: parseUsage } },
  ],
};

test("every keyset's caps add up to its daily limit or less", () => {
  for (const k of KEYSETS) assert.ok(k.sites.reduce((a, s) => a + s.cap, 0) <= KEYSET_LIMIT, k.label);
  const keys = KEYSETS.flatMap((k) => k.sites.map((s) => s.key));
  assert.equal(new Set(keys).size, keys.length, "a site is on one keyset");
});

test("parsers read each site's own file, and anything malformed is null", () => {
  assert.deepEqual(parseUsage('{"day":"2026-11-18","calls":2200}'), { day: "2026-11-18", calls: 2200 });
  assert.deepEqual(parseMeta('{"ebay":{"day":"2026-11-18","calls":3300,"qday":"2026-11-18","qcalls":3300}}'), { day: "2026-11-18", calls: 3300 });
  assert.deepEqual(parseCallsByDay('{"calls":{"2026-11-15":2200,"2026-11-17":2210}}'), { day: "2026-11-17", calls: 2210 });
  assert.deepEqual(parseCeStatus('{"quotaDay":"2026-11-17","quotaSpent":2900,"rateLimited":false}'), { day: "2026-11-17", calls: 2900, rateLimited: false });
  const op = JSON.stringify({ at: "2026-11-19T10:00:00Z", checks: [{ name: "eBay quota use", status: "ok", detail: "Spent 0 calls so far this quota day and 2220 the day before (ceiling 2500; eBay showed 2520 of 5000 left at the start of the last run)." }] });
  assert.deepEqual(parseOpStatus(op, now), { day: "2026-11-18", calls: 2220, othersCalls: 2480 });
  for (const bad of ["", "nope", "{}", '{"calls":"x"}']) {
    assert.equal(parseUsage(bad), null);
    assert.equal(parseMeta(bad), null);
    assert.equal(parseCallsByDay(bad), null);
    assert.equal(parseOpStatus(bad, now), null);
  }
});

test("ok under the warn line, warn near the limit, crit at the limit, over a cap, or on a 429", () => {
  const r = (a: number, b: number, extra: object = {}) => judgeKeyset(ks, [{ key: "a", spend: { day: "2026-11-18", calls: a, ...extra } }, { key: "b", spend: { day: "2026-11-18", calls: b } }], now);
  assert.equal(r(2400, 2000).severity, "ok");
  assert.equal(r(2500, 2400).severity, "crit", "B over its own 2,000 cap");
  assert.equal(r(2500, 1900).severity, "ok");
  const near: Keyset = { ...ks, sites: [ks.sites[0], { ...ks.sites[1], cap: 2500 }] };
  assert.equal(judgeKeyset(near, [{ key: "a", spend: { day: "2026-11-18", calls: 2500 } }, { key: "b", spend: { day: "2026-11-18", calls: 2400 } }], now).severity, "warn");
  assert.equal(judgeKeyset(near, [{ key: "a", spend: { day: "2026-11-18", calls: 2500 } }, { key: "b", spend: { day: "2026-11-18", calls: 2500 } }], now).severity, "crit");
  assert.equal(r(100, 100, { rateLimited: true }).severity, "crit");
  assert.equal(r(100, 100).metric?.value, 200);
});

test("stale or missing numbers are unknown, never a false ok", () => {
  assert.equal(judgeKeyset(ks, [], now).severity, "unknown");
  assert.equal(judgeKeyset(ks, [{ key: "a", spend: { day: "2026-11-10", calls: 10 } }], now).severity, "unknown");
});
