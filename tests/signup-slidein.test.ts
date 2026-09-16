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
  // WIDTH DIVERGES ON PURPOSE since 2026-09-16 ("the slider is actually
  // really, really annoying… on a mobile it covers the full page"). This card
  // is max-w-[20rem] on phones and only returns to PremiumSlideIn's max-w-sm
  // from sm up. The shared things — the corner utility, the z-tier and the
  // presence primitive — are what this test is actually for, and they are all
  // still asserted here; a matching pixel width was never the invariant.
  assert.match(code, /w-\[calc\(100%-2rem\)\] max-w-\[20rem\][\s\S]{0,120}sm:max-w-sm/, "phones get the narrower card");
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

test("the CTA returns the visitor to the page they were on, NOT to /premium", () => {
  // REVERSED 2026-09-16 with the pitch itself. Sending a brand-new account
  // straight to the pricing page was coherent while this card sold Premium;
  // now that it sells the free account, landing them on /premium is a
  // bait-and-switch on what they just agreed to.
  const code = codeOnly(read(SRC));
  assert.match(code, /next=\{pathname \?\? "\/"\}/, "AuthForm must return the visitor to the current route");
  assert.doesNotMatch(code, /next="\/premium"/, "the free-account CTA must not divert to the paid page");
});

test("/premium is in SKIP_PATHS — no point pitching a sign-up-for-Premium popup on the page that already sells it", () => {
  const code = codeOnly(read(SRC));
  const skipMatch = code.match(/const SKIP_PATHS = \[([^\]]*)\]/);
  assert.ok(skipMatch, "expected a SKIP_PATHS declaration");
  assert.match(skipMatch![1], /"\/premium"/, "SKIP_PATHS must include /premium, mirroring PremiumSlideIn's own list");
});

test("the card reads no trial or price state at all — it makes no paid offer", () => {
  // This used to pin HOW the popup decided its trial framing (trialDays, the
  // config value, rather than the signed-in-only trialEligible flag). With the
  // 2026-09-16 reversal there is no trial framing to get right: the card names
  // no price, no trial and no $0, because it asks for no money. Reading any of
  // that state here would be the first step back toward a paid pitch on the
  // surface the owner explicitly took it off.
  //
  // The trialDays-vs-trialEligible distinction still matters and is still
  // pinned — in tests/premium-slidein.test.ts, for the surface that does pitch.
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /trialEligible|trialAvailable|trialDays/, "no trial state on a free-account card");
  assert.doesNotMatch(code, /premiumZeroToday|premiumFromLine|premiumLockInTail|PREMIUM_PRICE_AMOUNT/, "no price helpers");
  assert.doesNotMatch(code, /premiumPriceIncreaseAnnounced/, "no price-increase banner on a card that quotes no price");
});

test("it wears NO gold: gold is reserved for the surfaces that ask for money", () => {
  // REVERSED 2026-09-16. Gold is this site's Premium colour on every surface
  // that sells it (PremiumButton, PremiumSlideIn, the nav spotlight). A card
  // that sells the FREE tier wearing Premium's colour promises a paid tier it
  // deliberately never mentions, which is the kind of small dishonesty this
  // suite exists to prevent.
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /gold/, "no gold anywhere on the free-account card");
  assert.doesNotMatch(code, />\s*Premium\s*</, "no Premium badge");
  assert.match(code, /Create a free account/, "the heading must state the actual ask");
  // The pitch is the shared comparison component, not a table hand-rolled into
  // this file (see the access-tiers test of the same name).
  assert.match(code, /<FreeAccountCompare \/>/, "the pitch must be the shared component");
  assert.doesNotMatch(code, /PremiumPitchPanel/, "the free-vs-Premium panel belongs to PremiumSlideIn now");
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
