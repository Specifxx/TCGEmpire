import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /premium, 70% SIMPLER (2026-10-17, owner: "way too convoluted… a lot of double up
// on information… the comparison should only be ticks and crosses… cut down a
// lot"). DECISIONS.md, "/premium, 70% simpler". These pin the shape: hero, plan
// cards, ticks table, a short FAQ, and nothing said twice. The plans-first rule
// (2026-09-29) still holds: a buy button is on the first screen.
//
// REORDERED 2026-10-23 (the conversion redesign, DECISIONS.md "/premium, rebuilt
// to convert, honestly"): the hero now carries its own checkout button, so the
// plan card moved below the live proof (deals teaser, demo); a phone gets a
// sticky bar once the hero has scrolled away. The rest still holds.
const ROOT = join(__dirname, "..");
const page = readFileSync(join(ROOT, "src/app/premium/page.tsx"), "utf8");
const cards = readFileSync(join(ROOT, "src/components/PremiumPricingCards.tsx"), "utf8");
const ticks = readFileSync(join(ROOT, "src/components/PremiumTicks.tsx"), "utf8");
const cta = readFileSync(join(ROOT, "src/components/PremiumCta.tsx"), "utf8");
const jsx = page.slice(page.indexOf("export default async function PremiumPage"));

test("the headline, then the plan table with the ticks under it, and nothing after (2026-10-25)", () => {
  const h1 = jsx.indexOf("<h1");
  const pricing = jsx.indexOf("<PremiumPlanTable");
  assert.ok(h1 > 0 && pricing > h1, "headline, then the plans");
  const t = readFileSync(join(ROOT, "src/components/premium/PremiumPlanTable.tsx"), "utf8");
  assert.ok(t.indexOf("<PremiumTicks") > t.indexOf("<PlanCard"), "the ticks table sits under the cards");
  // The things that said the same thing again are gone.
  assert.doesNotMatch(page, /WHAT_YOU_GET|id="what-you-get"|PremiumMissingGrid|PremiumProofLine|TierComparisonTable|PremiumDealsTeaser|PremiumSavingsDemo|PremiumFaqList/);
  assert.doesNotMatch(cards, /PLUS_FEATURES|PREMIUM_FEATURES_ON_PLUS|PREMIUM_FEATURES_STANDALONE|features\.map/, "no feature bullets on the Plus-era cards");
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
  assert.match(body, /c\.key === "premium" \? "w-\[72px\]" : "w-\[56px\]"/, "the dense (slider) columns: 56px, Pro 72px");
  assert.match(body, /<Mark v=\{cellValue\(r\.from, c\.key\)\}/, "every cell is the source row's value");
  assert.doesNotMatch(body, /overflow-x-auto|min-w-\[/, "no sideways scroll and no width floor");
  assert.doesNotMatch(body, /◐|shortCaption|detail:/, "no half marks, captions or descriptions");
  // A Plus member sees what Premium adds; a Premium member, who has every tick, does not.
  assert.match(jsx, /already && currentTier === "plus" && \(/);
});

test("no repeated CTA band, no sticky bar and no popup on /premium", () => {
  assert.doesNotMatch(jsx, /Ready to upgrade/i);
  assert.equal((jsx.match(/<PremiumPlanTable/g) ?? []).length, 1, "one set of plan cards");
  assert.doesNotMatch(jsx, /PremiumStickyCta/, "the sticky bar went on 2026-10-25");
  // (PremiumTicks is left out: its "table-fixed" is a column layout, not a sticky bar.)
  assert.doesNotMatch(code(page) + code(cards), /position:\s*fixed|\bfixed\b|createPortal|role="dialog"/);
});

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
