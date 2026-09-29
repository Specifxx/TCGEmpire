import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /premium is PLANS FIRST (2026-09-29, owner: "way too wordy now and the buttons to
// get premium are at the bottom of the page and you have to scroll"). These pin the
// structure that keeps the buy buttons on the first screen; the pixel positions were
// measured in a browser (DECISIONS.md, "/premium: plans first, a fifth of the words").
const ROOT = join(__dirname, "..");
const page = readFileSync(join(ROOT, "src/app/premium/page.tsx"), "utf8");
const cards = readFileSync(join(ROOT, "src/components/PremiumPricingCards.tsx"), "utf8");
const cta = readFileSync(join(ROOT, "src/components/PremiumCta.tsx"), "utf8");
const jsx = page.slice(page.indexOf("export default async function PremiumPage"));

test("the plan cards come straight after the hero, before anything else in the body", () => {
  const h1 = jsx.indexOf("<h1");
  const pricing = jsx.indexOf("<PremiumPricingCards");
  assert.ok(h1 > 0 && pricing > h1, "hero, then the cards");
  for (const later of ['id="what-you-get"', "<TierComparisonTable", "FAQ.map(", "<PremiumProofLine"]) {
    assert.ok(jsx.indexOf(later) > pricing, `${later} must sit below the plan cards`);
  }
  assert.doesNotMatch(jsx, /personaSections|PersonaSection|FEATURES\.map/, "the persona sections and per-feature cards are gone");
});

test("the cards are two across at every width, with a compact button, and no Free card", () => {
  assert.match(cards, /grid-cols-2/, "two narrow columns on a phone, so both buttons fit on the first screen");
  assert.match(cards, /<PremiumCta\s+compact/, "the compact button (no heading, no small print)");
  assert.match(cta, /compact\?: boolean/);
  assert.doesNotMatch(code(cards), /function FreeCard|\$0/, "no $0 anywhere on the cards");
});

test("the table is collapsed inside a <details> and the FAQ is one accordion built from the same array as the JSON-LD", () => {
  const at = jsx.indexOf("<TierComparisonTable");
  assert.match(jsx.slice(Math.max(0, at - 400), at), /<details[\s\S]*Compare every feature/);
  assert.match(jsx, /faqPage\(FAQ\)/);
  assert.match(jsx, /FAQ\.map\(/);
  // Seven questions on the live page; the trial, half-price and price-rise entries
  // exist only while their switch is on.
  const faq = page.slice(page.indexOf("const FAQ:"), page.indexOf("export default async function"));
  const always = faq.replace(/\.\.\.\([a-zA-Z]+\(\)\s*\?\s*\[[\s\S]*?\]\s*:\s*\[\]\),/g, "");
  assert.ok((always.match(/\n {4}q: /g) ?? []).length <= 7, "at most seven always-on FAQ questions");
});

test("no repeated CTA band and no popup or sticky bar on /premium", () => {
  assert.doesNotMatch(jsx, /Ready to upgrade/i);
  assert.equal((jsx.match(/<PremiumPricingCards/g) ?? []).length, 1, "one set of plan cards");
  assert.doesNotMatch(code(page) + code(cards), /position:\s*fixed|\bfixed\b|createPortal|role="dialog"/);
});

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
