import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signupPromoEligible, isExternalReferrer, ENGAGED_MS } from "../src/lib/signup-promo-gate";

// Section 4 of the 2026-09-24 brief: first visit from Reddit/Discord.
// DECISIONS.md, "First visit from Reddit/Discord: no sign-up prompt on the
// first page".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const base = { views: 1, engagedMs: 0, externalEntry: false, mobile: false };

test("sign-up slide-in: second page view, or a minute of reading on the first", () => {
  assert.equal(signupPromoEligible(base), false, "not in the first seconds of a first visit");
  assert.equal(signupPromoEligible({ ...base, engagedMs: ENGAGED_MS - 1 }), false);
  assert.equal(signupPromoEligible({ ...base, engagedMs: ENGAGED_MS }), true);
  assert.equal(signupPromoEligible({ ...base, views: 2 }), true);
  assert.equal(ENGAGED_MS, 60_000);
});

test("never on the first page from another site, never on a phone's first view", () => {
  assert.equal(signupPromoEligible({ ...base, externalEntry: true, engagedMs: 10 * ENGAGED_MS }), false);
  assert.equal(signupPromoEligible({ ...base, mobile: true, engagedMs: 10 * ENGAGED_MS }), false);
  // From the second page on, both are allowed — they have chosen to browse.
  assert.equal(signupPromoEligible({ ...base, views: 2, externalEntry: true, mobile: true }), true);
  assert.equal(isExternalReferrer("https://www.reddit.com/r/riftboundtcg/", "riftcompare.com"), true);
  assert.equal(isExternalReferrer("https://riftcompare.com/sets", "riftcompare.com"), false);
  assert.equal(isExternalReferrer("", "riftcompare.com"), false, "a typed URL is not a referral");
  const popup = read("src/components/SignupPromoPopup.tsx");
  assert.match(popup, /signupPromoEligible\(\{/);
  assert.match(popup, /if \(!eligible\) return;/);
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
  assert.match(t, /cardImageSrc\(r\)/);
  assert.match(t, /See all \{totalPriced/);
  assert.match(t, /href="\/browse"/);
});
