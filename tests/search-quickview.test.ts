import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Clicking a card in the search dropdown (typed results, or the zero-state
// "Trending" row — both are CardTileData under the hood, both go through
// activateCardLike) must open the QuickView modal, not navigate to the full
// page. This already regressed once: a rewrite of SearchBar.tsx replaced
// `openQuickView(card)` with `router.push(cardHref(card))`, on the reasoning
// that the modal "never changed the URL and left Back doing nothing useful" —
// which doesn't hold up against QuickView.tsx's own pushState/popstate
// handling (see that file). Restoring the modal is a product decision as much
// as a bug fix, so this guard exists to make the next rewrite of this file
// change it on purpose, not lose it silently to a merge/refactor again.

test("a plain click on a search result opens QuickView, not a page navigation", () => {
  const src = read("src/components/SearchBar.tsx");
  assert.match(src, /import \{ useQuickView \} from "\.\/QuickView";/, "SearchBar must import useQuickView");
  assert.match(
    src,
    /const \{ open: openQuickView \} = useQuickView\(\);/,
    "SearchBar must obtain QuickView's open() function",
  );

  const fn = /function activateCardLike\([\s\S]*?\n  \}/.exec(src);
  assert.ok(fn, "activateCardLike() must exist — it's the single path both the card-result row and the trending row funnel through");
  const body = fn![0];

  assert.match(body, /openQuickView\(card\)/, "the plain-click path must call openQuickView(card)");
  assert.doesNotMatch(
    body,
    /router\.push\(/,
    "activateCardLike must not navigate — that is the exact regression this guards against",
  );
});

test("a modifier/middle click on a search result still opens the full page in a new tab", () => {
  // QuickView is a same-tab affordance; a visitor asking for a new tab (Cmd/
  // Ctrl-click, or Shift/Alt-Enter on the keyboard path) wants the real page
  // there, not a modal duplicated across tabs. This branch predates the
  // regression and must survive the fix untouched.
  const src = read("src/components/SearchBar.tsx");
  const fn = /function activateCardLike\([\s\S]*?\n  \}/.exec(src)![0];
  assert.match(
    fn,
    /if \(newTab\) \{\s*\n\s*window\.open\(cardHref\(card\), "_blank", "noopener"\);/,
    "the newTab branch must still open the real card page via window.open",
  );
});

test("both the typed-results row and the zero-state Trending row route through activateCardLike", () => {
  // The fix is a single-point change specifically because both rows call the
  // same function — assert that's still true, so a future edit that inlines
  // one of them can't silently reintroduce the old behavior in just one spot.
  const src = read("src/components/SearchBar.tsx");
  const calls = src.match(/activateCardLike\(/g) ?? [];
  // 1 definition + at least 2 call sites (card row onClick, trending row
  // onClick) + the keyboard Enter path's 2 branches (card, trending).
  assert.ok(calls.length >= 5, `expected activateCardLike to be defined once and called from every row + the keyboard path, found ${calls.length} occurrences`);
});

test("sealed-product search results are unaffected — they still navigate, by design", () => {
  // Scoped deliberately: the ask (and QuickView's own domain) is card results.
  // Sealed products have their own, separate SealedQuickViewProvider elsewhere
  // in the app that this file does not wire up — asserting the boundary here
  // so a future "just make search consistent" pass doesn't blur it by
  // accident, without a decision to do so.
  const src = read("src/components/SearchBar.tsx");
  const fn = /function activateSealed\([\s\S]*?\n  \}/.exec(src);
  assert.ok(fn, "activateSealed() must exist");
  assert.match(fn![0], /router\.push\(href\)/, "sealed results should still navigate to /sealed?q=…");
});
