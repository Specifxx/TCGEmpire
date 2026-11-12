// Owner, 2026-11-12: "we just want eBay and TCGplayer as the paid links at the top". A pinned paid row is eBay or TCGplayer
// only; Fetch TCG is an ordinary store row (we are not paid for it); Amazon shows only with a real price, never as a
// search-link row. These source guards fail the build if any of that comes back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk(root).map((p) => ({ p, s: readFileSync(p, "utf8") }));

test("no component pins Fetch TCG or tags it as paid", () => {
  for (const { p, s } of files) {
    assert.doesNotMatch(s, /PIN_OUTLINE\.fetch/, p);
    for (const m of s.matchAll(/retailer="fetchtcg"[\s\S]{0,400}/g)) {
      assert.doesNotMatch(m[0], /table_pinned|surface="[^"]*pinned/, `${p}: Fetch must not be a pinned row`);
    }
    assert.doesNotMatch(s, /Fetch TCG<\/span>\s*<span[^>]*>Marketplace/, `${p}: Fetch is just a store`);
  }
});

test("Amazon has no search-link row: the slot draws nothing without a real price", () => {
  const slot = readFileSync(new URL("../src/components/AmazonLiveSlot.tsx", import.meta.url), "utf8");
  assert.match(slot, /if \(!live\) return null;/);
  assert.doesNotMatch(slot, /Check Amazon →/);
  for (const { p, s } of files) {
    assert.doesNotMatch(s, /surface="amazon_search"/, `${p}: an unpriced Amazon link row`);
    assert.doesNotMatch(s, /Also on Amazon: we don/, p);
  }
});
