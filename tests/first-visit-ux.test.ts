import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Section 4 of the 2026-09-24 brief: first visit from Reddit/Discord.
// DECISIONS.md, "First visit from Reddit/Discord: no sign-up prompt on the
// first page". REVERSED 2026-09-29 by the owner: both corner cards show on the
// first page, as soon as it loads ("Corner nudges on page load" in
// DECISIONS.md). The gate tests below now pin the reversal.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("both corner cards show on the first page, as soon as it loads: no page-view or reading gate", () => {
  // Owner, 2026-09-29: "the slider should show up instantly and it should not
  // wait for a second page view. on blog posts and movers it should also be
  // instant … it should show up as soon as the page loads."
  assert.ok(!existsSync(join(process.cwd(), "src/lib/signup-promo-gate.ts")), "the first-visit gate module is gone");
  const popup = code("src/components/SignupPromoPopup.tsx");
  assert.doesNotMatch(popup, /signupPromoEligible|ENGAGED_MS|isLandingPage|externalEntry|matchMedia/, "no gate on the sign-up card");
  const slide = code("src/components/PremiumSlideIn.tsx");
  assert.doesNotMatch(slide, /MIN_PAGEVIEWS|PV_KEY|LANDING_ENGAGED_MS|isLandingPage/, "no page-view or landing gate on the Premium card");
  // What still holds: who each card is for, the caps and snoozes, and the paths they skip.
  assert.match(popup, /if \(!loaded \|\| user \|\| shown\) return;/, "signed-out visitors only");
  assert.match(popup, /if \(readLocal\(DISMISS_COUNT_KEY\) >= MAX_NUDGE_DISMISSALS\) return;/);
  assert.match(slide, /loaded && !!user && !premium && premiumCheckout/, "signed-in accounts without Premium only");
  assert.match(slide, /if \(ss\?\.getItem\(SESSION_SEEN\) === "1"\) return;/, "once per session");
  for (const src of [popup, slide]) assert.match(src, /const SKIP_PATHS = \["\/login", "\/verify", "\/premium"\];/);
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

test("price table: direction is not colour-only, rows have thumbnails, capped with See all", () => {
  const t = read("src/components/home/PriceTodayTable.tsx");
  assert.match(t, /"▲ "/);
  assert.match(t, /"▼ "/);
  assert.match(t, /className="sr-only"[\s\S]{0,120}"Price up "/);
  assert.match(t, /cardImageSrc\(row\)/);
  assert.match(t, /See all \{totalPriced/);
  assert.match(t, /href="\/browse"/);
});

