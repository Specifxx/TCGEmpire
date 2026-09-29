import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Section 4 of the 2026-09-24 brief: first visit from Reddit/Discord.
// DECISIONS.md, "First visit from Reddit/Discord: no sign-up prompt on the
// first page", 2026-09-24. REVERSED the morning of 2026-09-29 (both cards on
// the first page, instant), then RESTORED IN SPIRIT that afternoon by the owner
// ("Nudges: value first" in DECISIONS.md): the gate is back, simpler and
// stricter, and it no longer looks at the referrer or the device at all.
// tests/nudge-gate.test.ts runs the rules; these pin that the components use them.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the sign-up card never shows on a first page view: the gate is back, and it ignores referrer and device", () => {
  // The module is back under its new name, with new rules, not resurrected.
  assert.ok(!existsSync(join(process.cwd(), "src/lib/signup-promo-gate.ts")), "the 2026-09-24 gate module stays gone");
  assert.ok(existsSync(join(process.cwd(), "src/lib/nudge-gate.ts")), "the shared gate exists");
  const popup = code("src/components/SignupPromoPopup.tsx");
  assert.match(popup, /signupPromoEligible\(\{[\s\S]*?views,[\s\S]*?engagedMs:[\s\S]*?signInStarted: signInStarted\(\)/, "the sign-up card asks the gate");
  assert.match(popup, /if \(!gate\(\)\) return;/, "and does not arm without it");
  assert.match(popup, /onFire: \(\) => \{\s*if \(!gate\(\)\) return;/, "and checks again when the timer fires");
  // Referrer, device, width: none of them decide anything (they did on 09-24).
  assert.doesNotMatch(popup, /document\.referrer|isExternalReferrer|externalEntry|matchMedia|innerWidth/, "no referrer or device input");
  assert.doesNotMatch(code("src/lib/nudge-gate.ts"), /referrer|matchMedia|innerWidth|mobile/i, "the gate has no referrer or device input");
  // The engaged clock that opens a first page is the shared one, with the landing-page threshold.
  assert.match(popup, /useEngaged\(signupEngagedNeededMs\(pathname\), pathname, loaded && !user && !shown && views === 1\)/);
  // What always held: who each card is for, the caps and snoozes, the skipped paths.
  assert.match(popup, /if \(!loaded \|\| user \|\| shown \|\| views === 0\) return;/, "signed-out visitors only");
  assert.match(popup, /if \(readLocal\(DISMISS_COUNT_KEY\) >= MAX_NUDGE_DISMISSALS\) return;/);
  assert.match(popup, /const SKIP_PATHS = SIGNUP_SKIP_PATHS;/);
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

test("price table: direction is not colour-only, rows have thumbnails, capped with See all", () => {
  const t = read("src/components/home/PriceTodayTable.tsx");
  assert.match(t, /"▲ "/);
  assert.match(t, /"▼ "/);
  assert.match(t, /className="sr-only"[\s\S]{0,120}"Price up "/);
  assert.match(t, /cardImageSrc\(row\)/);
  assert.match(t, /See all \{totalPriced/);
  assert.match(t, /href="\/browse"/);
});

