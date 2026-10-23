import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /premium, 70% SIMPLER (2026-10-17, owner: "way too convoluted… a lot of double up
// on information… the comparison should only be ticks and crosses… cut down a
// lot"). DECISIONS.md, "/premium, 70% simpler". These pin the shape: hero, plan
// cards, ticks table, a short FAQ, and nothing said twice. The plans-first rule
// (2026-09-29) still holds: the buy buttons are on the first screen.
const ROOT = join(__dirname, "..");
const page = readFileSync(join(ROOT, "src/app/premium/page.tsx"), "utf8");
const cards = readFileSync(join(ROOT, "src/components/PremiumPricingCards.tsx"), "utf8");
const ticks = readFileSync(join(ROOT, "src/components/PremiumTicks.tsx"), "utf8");
const cta = readFileSync(join(ROOT, "src/components/PremiumCta.tsx"), "utf8");
const jsx = page.slice(page.indexOf("export default async function PremiumPage"));

test("the hero, then the plan cards with the ticks under them, then the FAQ", () => {
  const h1 = jsx.indexOf("<h1");
  const pricing = jsx.indexOf("<PremiumPricingCards");
  const faq = jsx.indexOf("FAQ.map(");
  assert.ok(h1 > 0 && pricing > h1 && faq > pricing, "hero, then the cards, then the FAQ");
  assert.ok(cards.indexOf("<PremiumTicks") > cards.indexOf("<PaidTierCard"), "the ticks table sits under the cards");
  // The things that said the same thing again are gone.
  assert.doesNotMatch(page, /WHAT_YOU_GET|id="what-you-get"|PremiumMissingGrid|PremiumProofLine|TierComparisonTable/);
  assert.doesNotMatch(cards, /PLUS_FEATURES|PREMIUM_FEATURES_ON_PLUS|PREMIUM_FEATURES_STANDALONE|features\.map/, "no feature bullets on the cards");
});

test("the cards are two across at every width, with a compact button, and no Free card", () => {
  assert.match(cards, /grid-cols-2/, "two narrow columns on a phone, so both buttons fit on the first screen");
  assert.match(cards, /<PremiumCta\s+compact/, "the compact button (no heading, no small print)");
  assert.match(cta, /compact\?: boolean/);
  assert.doesNotMatch(code(cards), /function FreeCard|\$0/, "no $0 anywhere on the cards");
});

test("the table shows each plan's real limits, built for a phone", () => {
  // Since 2026-10-22 (DECISIONS.md "/premium shows each plan's real limits") a
  // cell is a ✓, a dash, or the short limit itself ("10 cards", "Top 3"), read
  // from TIER_COMPARISON (tests/premium-ticks.test.ts). The tier columns grew
  // from 68px to 72px on a phone to hold those strings.
  const body = code(ticks);
  assert.match(body, /table-fixed/);
  assert.match(body, /w-\[72px\] sm:w-\[120px\]/, "72px tier columns on a phone");
  assert.match(body, /c\.key === "premium" \? "w-\[72px\]" : "w-\[56px\]"/, "the dense (slider) columns: 56px, Premium 72px");
  assert.match(body, /<Mark v=\{cellValue\(r\.from, c\.key\)\}/, "every cell is the source row's value");
  assert.doesNotMatch(body, /overflow-x-auto|min-w-\[/, "no sideways scroll and no width floor");
  assert.doesNotMatch(body, /◐|shortCaption|detail:/, "no half marks, captions or descriptions");
  // A Plus member sees what Premium adds; a Premium member, who has every tick, does not.
  assert.match(jsx, /already && currentTier === "plus" && \(/);
});

test("a short FAQ, one accordion built from the same array as the JSON-LD", () => {
  assert.match(jsx, /faqPage\(FAQ\)/);
  assert.match(jsx, /FAQ\.map\(/);
  // Five always-on questions since 2026-10-22 ("Is price comparison free?" and
  // "Can I switch from Plus to Premium?" joined, from the Premium explainer's
  // FAQ); the free-Premium, trial, half-price and price-rise entries exist only
  // while their switch (or reward) is on.
  const faq = page.slice(page.indexOf("const FAQ:"), page.indexOf("export default async function"));
  const always = faq.replace(/\.\.\.\([^?\n]+\?\s*\[[\s\S]*?\]\s*:\s*\[\]\),/g, "");
  // The Plus question is addressed to a CURRENT Plus member since Plus went off
  // sale (2026-10-23): the off-sale wording is the second arm of a PLUS_ON_SALE ternary.
  const alwaysQs = [...always.matchAll(/\n {4}q: (?:PLUS_ON_SALE \? "[^"]+" : )?"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    alwaysQs,
    ["What's free?", "Is price comparison free?", "I'm on Plus. Can I switch to Premium?", "How do I cancel?", "What happens to cards I already track?"],
    "five always-on FAQ questions, in this order",
  );
  // "Can I get Premium for free?" only while a reward actually grants days.
  assert.match(faq, /\.\.\.\(FEEDBACK_PREMIUM_DAYS > 0 \|\| REFERRAL_PREMIUM_DAYS > 0\s*\?\s*\[\s*\{\s*q: "Can I get Premium for free\?"/);
});

test("no repeated CTA band and no popup or sticky bar on /premium", () => {
  assert.doesNotMatch(jsx, /Ready to upgrade/i);
  assert.equal((jsx.match(/<PremiumPricingCards/g) ?? []).length, 1, "one set of plan cards");
  // (PremiumTicks is left out: its "table-fixed" is a column layout, not a sticky bar.)
  assert.doesNotMatch(code(page) + code(cards), /position:\s*fixed|\bfixed\b|createPortal|role="dialog"/);
});

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
