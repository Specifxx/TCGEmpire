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

test("the hero, then what you're missing, then the plan cards, before anything else in the body", () => {
  // 2026-10-15 (owner: "show what users are missing out on at the very top … the
  // ticks and crosses must be visible as well as formatted nicely on a phone"):
  // the ticks-and-crosses grid sits between the hero and the cards.
  const h1 = jsx.indexOf("<h1");
  const grid = jsx.indexOf("<PremiumMissingGrid");
  const pricing = jsx.indexOf("<PremiumPricingCards");
  assert.ok(h1 > 0 && grid > h1 && pricing > grid, "hero, then the grid, then the cards");
  for (const later of ['id="what-you-get"', "FAQ.map(", "<PremiumProofLine"]) {
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

test("the grid is built for a phone, and the FAQ is one accordion built from the same array as the JSON-LD", () => {
  const grid = readFileSync(join(ROOT, "src/components/PremiumMissingGrid.tsx"), "utf8");
  assert.doesNotMatch(jsx, /<TierComparisonTable|Compare every feature/, "the collapsed table went; the grid is the comparison");
  assert.match(grid, /table-fixed/, "fixed columns, so a long caption wraps instead of widening the table");
  assert.match(grid, /w-\[64px\] sm:w-\[120px\]/, "64px tier columns on a phone");
  assert.doesNotMatch(grid, /overflow-x-auto|min-w-\[/, "no sideways scroll and no width floor");
  assert.match(grid, /c\.key === you/, "the visitor's own column says You");
  assert.match(jsx, /currentTier !== "premium" && \(/, "a Premium member, who has every tick, is not shown the grid");
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
