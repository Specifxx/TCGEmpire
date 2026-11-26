import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MAX_IDS, MIN_PUBLIC, PULSE_SITES, parseIds, pulseVoter, pulses } from "../src/lib/sentiment";
import { voterId } from "../src/lib/deal-votes";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";

test("a product's split stays hidden until MIN_PUBLIC people answered", () => {
  const few = pulses([
    { productId: "p1", choice: "buy", n: MIN_PUBLIC - 2 },
    { productId: "p1", choice: "hold", n: 1 },
  ]);
  assert.deepEqual(few["p1"], { n: MIN_PUBLIC - 1 });
  const enough = pulses([
    { productId: "p1", choice: "buy", n: 6 },
    { productId: "p1", choice: "hold", n: 3 },
    { productId: "p1", choice: "skip", n: 1 },
  ]);
  assert.deepEqual(enough["p1"], { n: 10, buy: 6, hold: 3, skip: 1 });
});

test("unknown choices are ignored, never counted", () => {
  assert.deepEqual(pulses([{ productId: "p2", choice: "sell", n: 50 }]), {});
});

test("ids are validated, unique and capped", () => {
  assert.deepEqual(parseIds("cmvj069js009f7ivhx4prx1ip,cmvj069js009f7ivhx4prx1ip,../x,a b"), ["cmvj069js009f7ivhx4prx1ip"]);
  const many = Array.from({ length: 100 }, (_, i) => `prod-${i}`).join(",");
  assert.equal(parseIds(many).length, MAX_IDS);
});

test("the voter id is a keyed hash, stable, never the address, and not the deal-vote id", () => {
  const a = pulseVoter("203.0.113.7", "UA");
  assert.equal(a, pulseVoter("203.0.113.7", "UA"));
  assert.notEqual(a, pulseVoter("203.0.113.8", "UA"));
  assert.ok(!a.includes("203"));
  assert.notEqual(a, voterId("203.0.113.7", "UA"));
});

test("the route takes answers only from the listed sister origins and caches its reads six hours", () => {
  const src = readFileSync("src/app/api/sentiment/route.ts", "utf8");
  assert.match(src, /siteFor\(origin\)/);
  assert.match(src, /s-maxage=21600/);
  assert.match(src, /select|groupBy/);
  assert.deepEqual([...PULSE_SITES].sort(), ["dex", "mtg", "tcgprices"]);
});
