import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { applyCode, codeTallies, parseCodeIds, CODE_SITE, CODE_VOTE_SITES, MAX_CODE_IDS } from "../src/lib/code-votes";
import { DEAL_VOTE_SITES } from "../src/lib/deal-votes";
import { SISTER_ALERT_KEYS } from "../src/lib/sister-alerts/sites";

test("worked and didn't exclude each other, a second tap undoes, expired is separate", () => {
  assert.deepEqual(applyCode(null, "worked"), { vote: 1, expired: false });
  assert.equal(applyCode({ vote: 1, expired: false }, "worked"), null);
  assert.deepEqual(applyCode({ vote: 1, expired: false }, "failed"), { vote: -1, expired: false });
  assert.deepEqual(applyCode({ vote: -1, expired: false }, "expired"), { vote: -1, expired: true });
  assert.equal(applyCode({ vote: 1, expired: true }, "clear"), null);
});

test("tallies count each side and keep the newest worked vote", () => {
  const t = codeTallies([
    { dropId: "aw-3766186", vote: 1, expired: false, n: 4, last: new Date("2026-11-25T10:00:00Z") },
    { dropId: "aw-3766186", vote: 1, expired: true, n: 1, last: new Date("2026-11-26T09:00:00Z") },
    { dropId: "aw-3766186", vote: -1, expired: false, n: 2, last: new Date("2026-11-26T11:00:00Z") },
  ]);
  assert.deepEqual(t["aw-3766186"], { worked: 5, failed: 2, expired: 1, lastWorked: "2026-11-26T09:00:00.000Z" });
});

test("code ids are validated, unique and capped", () => {
  assert.deepEqual(parseCodeIds("aw-1234,aw-1234,../etc,AW-99"), ["aw-1234"]);
  assert.equal(parseCodeIds(Array.from({ length: 200 }, (_, i) => `aw-${100000 + i}`).join(",")).length, MAX_CODE_IDS);
});

test("code votes live apart from the deal board's drops and only take known sister origins", () => {
  assert.ok(!(DEAL_VOTE_SITES as readonly string[]).includes(CODE_SITE));
  for (const s of CODE_VOTE_SITES) assert.ok(SISTER_ALERT_KEYS.includes(s), s);
});

test("the route stores no raw IP and caches reads for six hours", () => {
  const src = readFileSync(new URL("../src/app/api/code-votes/route.ts", import.meta.url), "utf8");
  assert.match(src, /s-maxage=21600/);
  assert.match(src, /voterId\(ip/);
  assert.doesNotMatch(src, /create:\s*\{[^}]*\bip\b/);
});
