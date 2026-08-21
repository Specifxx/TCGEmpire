import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const POPUP = "src/components/SignupPromoPopup.tsx";
const AUTH = "src/components/AuthForm.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Guards a reported production bug: on a short phone screen — iOS Safari with
// its address bar and toolbar showing — the signup popup could not be closed AT
// ALL. It was a full-screen dialog with no way out.
//
// Mechanism: the overlay was `fixed inset-0 flex items-center justify-center`
// with an `overflow-hidden` card and no scrolling. Once the card grew taller
// than the viewport, centring overflowed it EQUALLY IN BOTH DIRECTIONS, so the
// close button pinned to the card's top sat above the top of the screen with
// nothing to scroll. Measured in a real browser before the fix, the close
// button rendered at y = -131 (375x667), y = -188 (375x553, Safari chrome
// showing) and y = -234 (360x480). The card spanned the full width, so no
// backdrop remained to tap, and there was no Escape handler either.
//
// Four independent ways out now exist, and each assertion below pins one of
// them. Any ONE regressing still leaves the dialog closable; the tests exist so
// they can't all rot back at once.
// ─────────────────────────────────────────────────────────────────────────────

test("the popup overlay scrolls instead of clipping its own close button", () => {
  const src = read(POPUP);
  assert.match(src, /overflow-y-auto/, "the overlay must be a scroll container");
  // `min-h-full`, NOT `h-full`, is the load-bearing detail: the wrapper grows to
  // a taller-than-viewport card so centring has nothing left to overflow.
  assert.match(src, /flex min-h-full items-center justify-center/, "expected the min-h-full centring wrapper");
  assert.ok(
    !/flex h-full items-center justify-center/.test(src),
    "h-full re-introduces the both-directions overflow that put the close button off-screen"
  );
  // A clipping card can hide its own controls.
  assert.ok(
    !/max-w-md overflow-hidden/.test(src),
    "the card must not clip its own contents"
  );
});

test("the popup sizes to the DYNAMIC viewport, for iOS Safari's moving toolbars", () => {
  const src = read(POPUP);
  // `inset-0` resolves against the LARGE viewport on iOS Safari, putting the
  // bottom of a full-height fixed element behind the browser chrome.
  assert.match(src, /h-\[100dvh\]/, "expected a dynamic-viewport height");
  assert.match(src, /env\(safe-area-inset-top\)/, "expected a top safe-area inset (notch)");
  assert.match(src, /env\(safe-area-inset-bottom\)/, "expected a bottom safe-area inset (home indicator)");
});

test("the popup can be dismissed four independent ways", () => {
  const src = read(POPUP);
  // 1. the ✕ itself
  assert.match(src, /aria-label="Close"/, "expected a labelled close button");
  assert.match(src, /className="absolute right-2 top-2 z-20 tap-icon/, "close button must use the 44px tap-icon target");
  // 2. a large textual control in the thumb zone — the ✕ is a small target in
  //    the hardest corner to reach one-handed on a big phone.
  assert.match(src, /Maybe later/, "expected a secondary textual dismiss");
  // 3. tapping outside the card. The handler must sit on the WRAPPER: it covers
  //    the backdrop, so a handler on the backdrop alone never fires.
  assert.match(
    src,
    /onClick=\{dismiss\}\s*\n\s*className="relative flex min-h-full/,
    "the centring wrapper must handle outside taps"
  );
  assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/, "taps inside the card must not dismiss");
  // 4. the keyboard
  assert.match(src, /e\.key === "Escape"/, "Escape must close the dialog");
});

test("the popup meets the dialog accessibility contract", () => {
  const src = read(POPUP);
  assert.match(src, /role="dialog"[\s\S]{0,80}aria-modal="true"[\s\S]{0,80}aria-labelledby="signup-promo-title"/,
    "the dialog needs an accessible name, not a bare role");
  assert.match(src, /id="signup-promo-title"/, "the heading must carry the id aria-labelledby points at");
  assert.match(src, /closeRef\.current\?\.focus\(\)/, "focus must move into the dialog when it opens");
  assert.match(src, /returnFocusRef/, "focus must be restored on dismiss, not dropped to the document");
  assert.match(src, /document\.body\.style\.overflow = "hidden"/, "the page behind must not scroll while open");
  assert.match(src, /document\.body\.dataset\.rcDialog = "1"/, "must claim the shared dialog flag so two dialogs can't stack");
});

test("the popup does not repeat the pitch AuthForm already makes", () => {
  // The dialog's height IS the bug — the taller it gets, the further off-screen
  // its close button goes. Rendering the popup's perks and AuthForm's full
  // heading + value paragraph listed the same three perks twice.
  const popup = read(POPUP);
  assert.match(popup, /<AuthForm[^/]*\bcompact\b/, "the embedded AuthForm must run in compact mode");

  const auth = read(AUTH);
  assert.match(auth, /compact\?: boolean/, "AuthForm must accept compact");
  // A comment now precedes the heading inside the block (the /login reframe's
  // rationale); the contract is unchanged — everything between {!compact && (
  // and the <h1 is dropped in compact mode, so the popup never repeats it.
  assert.match(auth, /\{!compact && \(\s*<>[\s\S]{0,600}?<h1/, "compact must drop the duplicated heading + value block");
  assert.match(auth, /className=\{compact \? "" : "card-surface p-6"\}/, "compact must drop the nested card chrome");
});
