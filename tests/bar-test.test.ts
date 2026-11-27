import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BAR_TEST_START, barArm } from "../src/lib/bar-test";

// The sealed page's phone buy bar test (2026-11-27, DECISIONS.md "The sealed page's phone buy bar test").
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("starts on 3 Dec and draws no bar before then (and off a browser)", () => {
  assert.equal(BAR_TEST_START, Date.parse("2026-12-03T00:00:00Z"));
  assert.equal(barArm(BAR_TEST_START - 1), null);
  assert.equal(barArm(BAR_TEST_START + 1), null, "no window on the server");
});

test("the bar shows only in the 'bar' arm, in the visitor's own market, with the board's own cheapest listing", () => {
  const view = read("src/components/SealedProductView.tsx");
  assert.match(view, /\{arm === "bar" && own && <SealedStickyBuyBar/);
  assert.match(view, /const best = headlineOffer\(group\.listings\);/);
  assert.match(view, /affiliateUrl\(best\.url, best\.retailer, "\/sealed"\)/);
  assert.match(view, /lg:hidden/);
});

test("clicks are counted on sealed pages outside the quick view", () => {
  const lib = read("src/lib/bar-test.ts");
  assert.match(lib, /closest\('\[role="dialog"\]'\)\) return/);
  assert.match(lib, /startsWith\("\/sealed\/"\)/);
  assert.match(read("src/components/OutboundLink.tsx"), /barTestClick\(e\.currentTarget, isPaidLink\(href\)\)/);
});
