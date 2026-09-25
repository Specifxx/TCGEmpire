import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hrefFor, parseDealFinderParams } from "../src/lib/deal-finder-href";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ArbitrageFilters is the only true multi-select store/source picker in the
// UI (the Deal Finder's "Buy from" dropdown; BestBasket etc. only pick CARDS,
// and their store breakdowns are read-only output). Owner asked for "select
// all / select none / only" on every checkbox-list-of-stores feature — this
// file pins that all three exist here, and that the empty ("None") selection
// round-trips through the URL honestly instead of being silently coerced back
// to "every store".
//
// Since 2026-09-25 ticking changes a local draft and an Apply button navigates
// (it used to router.push on every checkbox — a server round trip per click,
// and a possible cold aggregate per intermediate selection). "only" still
// applies at once: it is a deliberate one-click choice.
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = "src/components/ArbitrageFilters.tsx";
const PAGE = "src/app/tools/deal-finder/page.tsx";

test("the store picker has select-all, select-none and per-row only actions", () => {
  const src = read(FILTERS);
  assert.match(src, /function selectAll\(\)\s*\{\s*setDraft\(sources\.map\(\(s\) => s\.key\)\);?\s*\}/, "select-all must tick every source");
  assert.match(src, /function selectNone\(\)\s*\{\s*setDraft\(\[\]\);?\s*\}/, "select-none must clear the selection");
  assert.match(src, /function selectOnly\(key: string\)\s*\{\s*apply\(\[key\]\);?\s*\}/, "only must apply a single-key selection at once");
  assert.match(src, /onClick=\{selectAll\}/);
  assert.match(src, /onClick=\{selectNone\}/);
  assert.match(src, /selectOnly\(s\.key\)/);
});

test("ticking is local; one Apply navigates, through hrefFor with the page's full parameter set", () => {
  const src = read(FILTERS);
  assert.match(src, /onClick=\{\(\) => apply\(draft\)\}/, "Apply submits the draft");
  assert.equal((src.match(/router\.push\(/g) ?? []).length, 1, "exactly one navigation site");
  assert.match(src, /router\.push\(hrefFor\(params, \{ buy: next, page: 1 \}\)/, "the URL keeps sort and mine, and resets the page");
  const toggleAt = src.indexOf("function toggle(key: string)");
  const toggleBody = src.slice(toggleAt, src.indexOf("function selectAll"));
  assert.doesNotMatch(toggleBody, /apply\(|router/, "a checkbox click must not navigate");
});

test("a single checkbox click still can't reach zero by accident, but the explicit actions can", () => {
  const src = read(FILTERS);
  const toggleAt = src.indexOf("function toggle(key: string)");
  assert.ok(toggleAt >= 0);
  const toggleBody = src.slice(toggleAt, toggleAt + 250);
  assert.match(toggleBody, /if \(!next\.length\) return;/, "one-at-a-time uncheck must still refuse to empty the selection");
});

test("the picker's label and the results panel both say something sensible at zero selected", () => {
  const filters = read(FILTERS);
  assert.match(filters, /if \(selected\.length === 0\) return "None selected";/, "the dropdown button must not silently show a stale/misleading label at zero");

  const page = read(PAGE);
  assert.match(page, /Pick at least one store on the buy side to see results\./, "the empty-results state must explain a zero-store selection, not just say \"no results\"");
});

test("an explicit empty buy param is respected, not coerced back to the default store list", () => {
  // buy=<empty string> (the URL selectNone() + Apply produces) must NOT be
  // treated the same as buy being absent entirely (first visit, no filter
  // touched) — a truthy check can't tell those apart, since "" is falsy.
  const opts = { allowMine: false, ebayKey: "ebay_us" };
  assert.deepEqual(parseDealFinderParams({ buy: "" }, opts).buy, [], "buy= is an explicit empty selection");
  assert.equal(parseDealFinderParams({}, opts).buy, null, "no buy param means the default list");
  assert.deepEqual(parseDealFinderParams({ buy: "a, b,,c" }, opts).buy, ["a", "b", "c"]);
  // …and it survives a round trip through every link on the page.
  const none = parseDealFinderParams({ buy: "" }, opts);
  assert.match(hrefFor(none, { page: 2 }), /[?&]buy=(&|$)/, "the empty selection is carried, not dropped");
  assert.doesNotMatch(hrefFor(parseDealFinderParams({}, opts), { page: 2 }), /buy=/, "the default stays implicit");
  const page = read(PAGE);
  assert.match(page, /const buy = params\.buy \?\? tcgBuyKeys;/, "the page falls back only on null (absent), never on []");
});
