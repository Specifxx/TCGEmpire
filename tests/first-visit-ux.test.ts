import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Section 4 of the 2026-09-24 brief: first visit from Reddit/Discord.
// DECISIONS.md, "First visit from Reddit/Discord: no sign-up prompt on the
// first page", 2026-09-24. REVERSED the morning of 2026-09-29 (both cards on
// the first page, instant), then RESTORED IN SPIRIT that afternoon by the owner
// ("Nudges: value first" in DECISIONS.md), and settled on 2026-09-30 by removing
// the signed-out card altogether ("The sign-up slider is gone"). The Premium
// slide-in keeps its gate. tests/nudge-gate.test.ts runs the rules; these pin
// that the components use them.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the sign-up card never interrupts a visit's first pages (removed 09-30, restored gated 10-15)", () => {
  // 2026-09-30 went one step further than "value first": the owner removed the
  // signed-out sign-up slider altogether ("Users who don't want to sign up
  // don't have to... we don't want to interfere with that"). Sign-up prompts are
  // page content now (InlineSignupPrompt; tests/signup-inline.test.ts).
  assert.ok(!existsSync(join(process.cwd(), "src/lib/signup-promo-gate.ts")), "the 2026-09-24 gate module stays gone");
  assert.ok(!existsSync(join(process.cwd(), "src/components/SignupPromoPopup.tsx")), "the sign-up slider stays gone");
  assert.ok(existsSync(join(process.cwd(), "src/lib/nudge-gate.ts")), "the shared gate still serves the signed-in cards");
  // Referrer, device, width: none of them decide anything (they did on 09-24).
  assert.doesNotMatch(code("src/lib/nudge-gate.ts"), /referrer|matchMedia|innerWidth|mobile/i, "the gate has no referrer or device input");
  // RESTORED 2026-10-15 (owner: "bring the sign up now pop up again … gate it
  // and make it appear after so many pages"): SignupSlideIn, from the 4th page;
  // from the 2nd since 2026-10-16 (owner: "add the sign up slider back").
  assert.doesNotMatch(code("src/lib/nudge-gate.ts"), /signupPromoEligible/, "the old 09-24 gate stays gone");
  // 2026-10-17: the separate sign-up card is gone; the Akali slider asks everyone.
});

test("the header's Pricing callout: once a session, never in the sign-up session, off the sign-in and checkout pages", () => {
  // Replaced the corner Premium slider on 2026-10-25 (PricingNudge).
  const slide = code("src/components/PricingNudge.tsx");
  assert.match(slide, /premiumSliderEligible\(\{ pathname \}\)/, "through the slider's own gate");
  assert.match(slide, /if \(read\("session", SESSION_KEY\)\) return;/, "once per session");
  assert.match(slide, /if \(isSignupSession\(\)\) return;/, "and never in the sign-up session");
  assert.match(slide, /Date\.now\(\) - snoozed < PREMIUM_SLIDER_SNOOZE_MS/, "a dismissal snoozes it");
});

test("hero stats render the server's final numbers, with no count-up", () => {
  const hero = read("src/components/home/HeroStats.tsx");
  assert.doesNotMatch(hero, /<CountUp\b|from "@\/components\/CountUp"/);
  assert.match(hero, /\{totalCards\.toLocaleString\("en-US"\)\} cards/);
  // Anywhere CountUp is still used it never flashes 0, and reduced motion skips it.
  const cu = read("src/components/CountUp.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(cu, /setDisplay\(0\)/);
  assert.match(cu, /prefersReducedMotion\(\)/);
  assert.match(cu, /useState\(value\)/, "the server render (pre-hydration) is the real value");
});

