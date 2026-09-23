import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// What a signed-in FREE account sees that leads to Premium, after sign-up.
// DECISIONS.md, "Premium after sign-up: the post-signup funnel", 2026-09-23.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("welcome checklist: the Premium step is optional, earned, and never shown to a member", () => {
  const src = code("src/components/WelcomeChecklist.tsx");
  // Free accounts only, checkout live, and only after the account has watched
  // a card — so it never greets someone the moment they arrive.
  assert.match(src, /const offerPremium = !premium && premiumCheckout && watchDone;/);
  // Not one of the core steps: the counter stays out of three.
  assert.match(src, /const doneCount = \[marketDone, watchDone, collectionDone\]\.filter\(Boolean\)\.length;/);
  assert.match(src, /\{doneCount\}\/3 done/);
  // Finishing the three core steps no longer hides the step from the quickest
  // users — it collapses to one card carrying it, unless there is nothing to offer.
  assert.match(src, /if \(doneCount === 3 && !offerPremium\) return null;/);
  assert.match(src, /You&apos;re set up/);
  // The trial is only promised when the account is eligible for one.
  assert.match(src, /const trialOffer = trialEligible && trialDays > 0;/);
  assert.match(src, /trialOffer \? `Try Premium free for \$\{trialDays\} days` : "See what Premium adds"/);
  assert.match(src, /<PremiumButton surface="checklist" \/>/, "attributed to the checklist");
  assert.doesNotMatch(src, /from "\.\/ui\/Dialog"/, "still inline, never a modal");
});
