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
//
// 2026-09-04: the CHROME above stayed put, but the CONTENT it wraps flipped
// from an honest free-account comparison to a Premium pitch (explicit product
// instruction — see the component's own header comment). The mechanical tests
// below (non-modal, dismissible, corner/sizing/entrance, instant timing) are
// untouched, since none of that changed; the content-specific tests further
// down were rewritten to match what actually renders now. See
// tests/access-tiers.test.ts for the honesty/no-automatic-grant guarantees on
// the new pitch itself.
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
  // 2026-09-16 (P7, mobile bottom tab bar): the sm:bottom-4/bottom-20 pair
  // retired in favour of one shared corner utility (globals.css) that clears
  // the bar below lg and collapses to the same plain inset above it — so all
  // THREE corner nudges (this one, PremiumSlideIn, AnnualSwitchNudge) must
  // carry the identical string, not just this one and PremiumSlideIn.
  const CORNER = /above-bottombar fixed left-4 z-\[70\]/;
  assert.match(code, CORNER, "must share the tab-bar-aware corner utility");
  assert.match(code, /w-\[calc\(100%-2rem\)\] max-w-sm[\s\S]{0,80}sm:w-auto/, "must share PremiumSlideIn's responsive width");
  assert.match(codeOnly(read("src/components/AnnualSwitchNudge.tsx")), CORNER, "AnnualSwitchNudge must carry the identical corner string");
  // 2026-09-16: the hand-rolled double-rAF entrance + bare setTimeout exit
  // (that this test used to pin literally) both moved onto the shared
  // usePresence(shown, 250) primitive (src/lib/motion.ts) — same 250ms exit,
  // same "let the transition finish before unmounting" contract, just no
  // longer duplicated per-component. Assert the SAME call exists in
  // PremiumSlideIn.tsx too, since that's this test's actual intent: one
  // shared pattern, not two copies that can drift.
  assert.match(code, /usePresence\(shown, 250\)/, "must use the shared presence primitive, same 250ms exit as PremiumSlideIn");
  assert.match(codeOnly(read("src/components/PremiumSlideIn.tsx")), /usePresence\(shown, 250\)/, "PremiumSlideIn must share the exact same call");
});

test("the popup embeds AuthForm the same way it always has", () => {
  // 2026-09-04: the PITCH inside this card changed from a free-account
  // comparison table to a Premium pitch (see tests/access-tiers.test.ts for
  // the content-honesty guarantees on that new pitch). The embed itself did
  // not — still bare + compact, still attributed to "popup".
  const code = codeOnly(read(SRC));
  assert.match(code, /<AuthForm providers=\{providers\} bare compact source="popup"/, "must still embed AuthForm the same way");
});

// ── The Premium pitch (2026-09-04) ──────────────────────────────────────────
// Replaces the tests this file used to run against the free-account COMPARISON
// table, which no longer exists — see the component's own header comment for
// the full reasoning behind the change and tests/access-tiers.test.ts for the
// honesty/no-automatic-grant guarantees on the new content.

test("the CTA sends the OAuth round trip to /premium, not back to the current page", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /next="\/premium"/, "AuthForm must be given a literal /premium next, not pathname");
  assert.doesNotMatch(code, /next=\{pathname/, "must not fall back to returning the visitor to where they were");
});

test("/premium is in SKIP_PATHS — no point pitching a sign-up-for-Premium popup on the page that already sells it", () => {
  const code = codeOnly(read(SRC));
  const skipMatch = code.match(/const SKIP_PATHS = \[([^\]]*)\]/);
  assert.ok(skipMatch, "expected a SKIP_PATHS declaration");
  assert.match(skipMatch![1], /"\/premium"/, "SKIP_PATHS must include /premium, mirroring PremiumSlideIn's own list");
});

test("trial framing is computed from trialDays (config), not trialEligible (which requires sign-in)", () => {
  // useMe()'s trialEligible is only ever true for a SIGNED-IN user (it checks
  // their own trialStartedAt) — always false for the signed-out audience this
  // popup targets, per lib/use-me.ts's own Me type comment. A brand-new
  // account has by definition never used the trial, so eligibility here only
  // needs the trial to be configured at all (trialDays > 0), which api/me's
  // route returns unconditionally, signed in or not.
  const code = codeOnly(read(SRC));
  assert.match(code, /const trialAvailable = trialDays > 0/, "must derive eligibility from config, not the signed-in-only flag");
  assert.doesNotMatch(code, /trialEligible/, "must not reference the signed-in-only trialEligible flag at all");
});

test("the heading and badge match PremiumSlideIn's Premium colouring, not the old brand-blue free-account styling", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /border-gold\/50/, "the card border must be gold, matching PremiumSlideIn");
  assert.match(code, /border-gold\/40[^"]*text-gold/s, "the badge must be gold-styled");
  assert.match(code, />\s*Premium\s*</, "the badge text must say Premium");
  // 2026-09-10: the non-trial fallback stopped being a tool count and became
  // the site's new Premium tagline, in lockstep with PremiumSlideIn's own
  // heading — the chip row those tools were counted for is now a graphic.
  assert.match(
    code,
    /trialAvailable \? "Try Premium free" : "Never overpay for a Riftbound card"/,
    "heading logic must mirror PremiumSlideIn's own",
  );
});

test("shows instantly — the buy_click-aware timing system was removed after this file was first written (2026-09-01)", () => {
  // This test originally pinned the OPPOSITE: that the delay/trigger system
  // survived the modal→slide-in chrome change untouched. It was then removed
  // entirely by explicit instruction ("no timer... shows on any page"), a
  // second, later change to the same component. Pinning its absence here
  // keeps this file honest about what's actually true today instead of
  // quietly describing a system that no longer exists.
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /PROMO_DELAY_MS|BUY_SURFACE_BACKSTOP_MS|POST_BUY_DELAY_MS/);
  assert.doesNotMatch(code, /buyLinksOnPage\(\)|hasBoughtThisSession\(\)/);
});
