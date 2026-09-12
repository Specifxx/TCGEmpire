import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ArbitrageFilters is the only true multi-select store/source picker in the
// UI (the Deal Finder's "Buy from" dropdown; BestBasket/BulkPricer/etc. only
// pick CARDS, and their store breakdowns are read-only output). Owner asked
// for "select all / select none / only" on every checkbox-list-of-stores
// feature — this file pins that all three exist here, and that the empty
// ("None") selection round-trips through the URL honestly instead of being
// silently coerced back to "every store".
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = "src/components/ArbitrageFilters.tsx";
const PAGE = "src/app/tools/deal-finder/page.tsx";

test("the store picker has select-all, select-none and per-row only actions", () => {
  const src = read(FILTERS);
  assert.match(src, /function selectAll\(\)\s*\{\s*apply\(sources\.map\(\(s\) => s\.key\)\);?\s*\}/, "select-all must apply every source's key");
  assert.match(src, /function selectNone\(\)\s*\{\s*apply\(\[\]\);?\s*\}/, "select-none must apply an empty selection");
  assert.match(src, /function selectOnly\(key: string\)\s*\{\s*apply\(\[key\]\);?\s*\}/, "only must apply a single-key selection");
  assert.match(src, /onClick=\{selectAll\}/);
  assert.match(src, /onClick=\{selectNone\}/);
  assert.match(src, /selectOnly\(s\.key\)/);
});

test("a single checkbox click still can't reach zero by accident, but the explicit actions can", () => {
  const src = read(FILTERS);
  const toggleAt = src.indexOf("function toggle(key: string)");
  assert.ok(toggleAt >= 0);
  const toggleBody = src.slice(toggleAt, toggleAt + 250);
  assert.match(toggleBody, /if \(!next\.length\) return;/, "one-at-a-time uncheck must still refuse to empty the selection");
  // selectAll/selectNone/selectOnly all go through apply() directly, bypassing
  // that guard — confirmed by the previous test asserting their bodies call
  // apply() with no length check in between.
});

test("the picker's label and the results panel both say something sensible at zero selected", () => {
  const filters = read(FILTERS);
  assert.match(filters, /if \(selected\.length === 0\) return "None selected";/, "the dropdown button must not silently show a stale/misleading label at zero");

  const page = read(PAGE);
  assert.match(page, /Pick at least one store on the buy side to see results\./, "the empty-results state must explain a zero-store selection, not just say \"no results\"");
});

test("an explicit empty buy param is respected, not coerced back to the default store list", () => {
  // buy=<empty string> (the URL selectNone() produces) must NOT be treated the
  // same as buy being absent entirely (first visit, no filter touched) — a
  // `buyParam ? … : default` truthy check can't tell those apart, since "" is
  // falsy. Both flip views must use the explicit undefined check instead.
  const page = read(PAGE);
  const matches = page.match(/buyParam !== undefined \? buyParam\.split\(","\)/g) ?? [];
  assert.equal(matches.length, 2, "both the eBay flip view and the TCGplayer flip view must use the !== undefined form");
  assert.doesNotMatch(page, /const buy = buyParam \? buyParam\.split/, "must not have reverted to the truthy-check form that can't distinguish absent from explicitly empty");
});
