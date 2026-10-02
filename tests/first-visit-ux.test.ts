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

test("no sign-up card interrupts any page view: the slider is gone (2026-09-30), not just gated", () => {
  // 2026-09-30 went one step further than "value first": the owner removed the
  // signed-out sign-up slider altogether ("Users who don't want to sign up
  // don't have to... we don't want to interfere with that"). Sign-up prompts are
  // page content now (InlineSignupPrompt; tests/signup-inline.test.ts).
  assert.ok(!existsSync(join(process.cwd(), "src/lib/signup-promo-gate.ts")), "the 2026-09-24 gate module stays gone");
  assert.ok(!existsSync(join(process.cwd(), "src/components/SignupPromoPopup.tsx")), "the sign-up slider stays gone");
  assert.ok(existsSync(join(process.cwd(), "src/lib/nudge-gate.ts")), "the shared gate still serves the signed-in cards");
  // Referrer, device, width: none of them decide anything (they did on 09-24).
  assert.doesNotMatch(code("src/lib/nudge-gate.ts"), /referrer|matchMedia|innerWidth|mobile/i, "the gate has no referrer or device input");
  assert.doesNotMatch(code("src/lib/nudge-gate.ts"), /signupPromoEligible|SIGNUP_/, "and no sign-up card rules left to revive");
});

test("the Premium slide-in asks later: 3rd page view, a 48-hour-old account, never over an inline paid prompt", () => {
  const slide = code("src/components/PremiumSlideIn.tsx");
  assert.match(slide, /const views = useSessionViews\(PV_KEY, pathname, loaded && !!user\);/, "its own signed-in page count");
  assert.match(slide, /const ageMs = accountAgeMs\(user\?\.createdAt\);/, "account age from /api/me's createdAt");
  assert.match(
    slide,
    /loaded && !!user && !premium && premiumCheckout && premiumSlideInEligible\(\{ views, accountAgeMs: ageMs, pathname \}\)/,
    "signed-in accounts without Premium only, through the gate",
  );
  assert.match(slide, /if \(ss\?\.getItem\(SESSION_SEEN\) === "1"\) return;/, "once per session");
  assert.match(slide, /const SKIP_PATHS = PREMIUM_SKIP_PATHS;/);
  assert.match(slide, /if \(isSignupSession\(\)\) return;/, "and never in the sign-up session");
  // The account age reaches the client from a column getCurrentUser already selects.
  assert.match(code("src/app/api/me/route.ts"), /createdAt: user\.createdAt \? new Date\(user\.createdAt\)\.toISOString\(\) : null/);
  assert.match(code("src/lib/auth.ts"), /lastActiveAt: true, activeDays: true, createdAt: true/, "no new query: createdAt was already selected");
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

