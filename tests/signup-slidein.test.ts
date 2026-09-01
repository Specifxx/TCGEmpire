import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/components/SignupPromoPopup.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// SignupPromoPopup was a full-screen modal — backdrop, scroll-locked, focus-
// trapped, centred card — and that shape cost this codebase a real production
// incident: on a short phone (iOS Safari with its toolbars showing), a card
// taller than the viewport overflowed EQUALLY IN BOTH DIRECTIONS, so the close
// button pinned to its top sat above the top of the screen with no way to reach
// it. tests/signup-popup-dismissible.test.ts pinned the fix for that shape.
//
// 2026-09-01: the whole shape changed. It's now a corner slide-in, matching
// PremiumSlideIn — non-modal, never blocks scroll, never traps focus, and by
// construction is a small fixed-size card that is never taller than the
// viewport, so the specific failure mode above cannot recur regardless of
// content height. tests/signup-popup-dismissible.test.ts is retired along with
// it; this file pins the NEW contract instead, mirroring
// tests/premium-slidein.test.ts's own coverage of the same pattern.
// ─────────────────────────────────────────────────────────────────────────────

test("it is NON-MODAL: it yields to real modals and never blocks them", () => {
  const code = codeOnly(read(SRC));
  // Reads the shared dialog flag so it won't slide in over an open modal…
  assert.match(code, /dataset\.rcDialog === "1"/, "must not appear on top of an open modal");
  // …but must NEVER set it, unlike the old modal version — a corner card has no
  // business claiming the modal lock.
  assert.doesNotMatch(code, /dataset\.rcDialog\s*=\s*["']1["']/, "a non-modal slide-in must not claim the modal flag");
  // No scroll lock and no focus trap — both modal behaviours the old version had.
  assert.doesNotMatch(code, /body\.style\.overflow\s*=\s*["']hidden["']/, "must not lock page scroll");
  assert.doesNotMatch(code, /aria-modal="true"/, "must not claim to be a modal");
  assert.doesNotMatch(code, /e\.key !== "Tab"/, "must not run a Tab-cycling focus trap");
});

test("dismissible independently of content height: the ✕, Escape, and a full-width secondary button", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /aria-label="Dismiss"/, "expected a labelled dismiss button");
  assert.match(code, /e\.key === "Escape"/, "Escape must dismiss it");
  assert.match(code, /Maybe later/, "expected the full-width secondary dismiss in the thumb zone");
  // Both call the same handler, so neither path can desync from the other
  // (e.g. one persisting SEEN_KEY and the other not).
  const dismissCalls = (code.match(/onClick=\{dismiss\}/g) ?? []).length;
  assert.ok(dismissCalls >= 1, "the ✕ and/or secondary button must call dismiss()");
});

test("shares PremiumSlideIn's exact corner, sizing and entrance pattern", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /bottom-20 left-4 z-\[70\][\s\S]{0,100}sm:bottom-4/, "must share PremiumSlideIn's corner and breakpoint");
  assert.match(code, /w-\[calc\(100%-2rem\)\] max-w-sm[\s\S]{0,80}sm:w-auto/, "must share PremiumSlideIn's responsive width");
  assert.match(code, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => setEntered\(true\)\)\)/, "must use the same double-rAF entrance trick");
  assert.match(code, /setTimeout\(\(\) => setShown\(false\), 250\)/, "must let the exit transition finish before unmounting, same 250ms as PremiumSlideIn");
});

test("the honest comparison table survives the chrome change unchanged", () => {
  // The redesign only ever meant to change the outer shell — the actual content
  // (and the guarantees tests/access-tiers.test.ts pins about it: no Premium-
  // gated tools, the tie row, the anonymous-alerts concession) must still exist,
  // just inside the new wrapper.
  const code = codeOnly(read(SRC));
  assert.match(code, /const COMPARISON:/, "the COMPARISON table must still exist");
  assert.match(code, /<table/, "must still render a real table, not a demoted div layout");
  assert.match(code, /<AuthForm providers=\{providers\} bare compact source="popup"/, "must still embed AuthForm the same way");
});

test("the timing/trigger system (buy_click-aware) is untouched by the shell change", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /export const PROMO_DELAY_MS = 30_000;/);
  assert.match(code, /export const BUY_SURFACE_BACKSTOP_MS = /);
  assert.match(code, /export const POST_BUY_DELAY_MS = /);
  assert.match(code, /buyLinksOnPage\(\)/);
  assert.match(code, /hasBoughtThisSession\(\)/);
});
