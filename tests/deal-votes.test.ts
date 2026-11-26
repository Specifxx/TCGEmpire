import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { apply, tallies, parseIds, voterId, MAX_IDS } from "../src/lib/deal-votes";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";

test("a vote toggles, switches sides, and the flag is separate", () => {
  assert.deepEqual(apply(null, "hot"), { vote: 1, expired: false });
  assert.equal(apply({ vote: 1, expired: false }, "hot"), null);
  assert.deepEqual(apply({ vote: 1, expired: false }, "cold"), { vote: -1, expired: false });
  assert.deepEqual(apply({ vote: -1, expired: false }, "expired"), { vote: -1, expired: true });
  assert.deepEqual(apply({ vote: 0, expired: true }, "hot"), { vote: 1, expired: true });
  assert.equal(apply({ vote: 1, expired: true }, "clear"), null);
});

test("tallies sum hot, cold and expired per drop", () => {
  const t = tallies([
    { dropId: "a1b2c3", vote: 1, expired: false, n: 3 },
    { dropId: "a1b2c3", vote: -1, expired: true, n: 2 },
    { dropId: "a1b2c3", vote: 0, expired: true, n: 1 },
  ]);
  assert.deepEqual(t["a1b2c3"], { hot: 3, cold: 2, expired: 3 });
});

test("ids are validated, unique and capped", () => {
  assert.deepEqual(parseIds("abc123,abc123,../x,ABCDEF"), ["abc123"]);
  const many = Array.from({ length: 100 }, (_, i) => `drop-${String(i).padStart(3, "0")}`).join(",");
  assert.equal(parseIds(many).length, MAX_IDS);
});

test("the voter id is a keyed hash, never the address", () => {
  const v = voterId("203.0.113.7", "Mozilla/5.0");
  assert.equal(v.length, 22);
  assert.ok(!v.includes("203"));
  assert.equal(v, voterId("203.0.113.7", "Mozilla/5.0"));
  assert.notEqual(v, voterId("203.0.113.8", "Mozilla/5.0"));
});

test("the route stores no raw IP and caches reads for six hours", () => {
  const src = readFileSync(new URL("../src/app/api/deal-votes/route.ts", import.meta.url), "utf8");
  assert.match(src, /s-maxage=21600/);
  assert.doesNotMatch(src, /data:\s*\{[^}]*\bip\b/);
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const model = schema.slice(schema.indexOf("model DealVote"), schema.indexOf("}", schema.indexOf("model DealVote")));
  assert.doesNotMatch(model, /\bip\b|address/i);
});
