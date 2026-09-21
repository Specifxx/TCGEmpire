import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Search Console, 28 days to 2026-09-21: the two guides with the most
// impressions were also the two with the worst click-through.
//
//   riftbound-banlist-explained   8,313 impr / 16 clicks  ("riftbound ban list"
//                                 pos 8.9, 0.1% CTR; "riftbound banned cards"
//                                 pos 8.6, 0.2%)
//   riftbound-empower-explained  17,695 impr / 85 clicks  ("riftbound empower"
//                                 pos 4.9, 1.9%)
//
// Both ranked on page one and lost the click on the snippet: a title that said
// "Explained" to a query asking for a LIST, and a description that promised "a
// complete guide" instead of answering the question. These pin the snippet
// shapes that replaced them. The guide page clamps the description at
// DESCRIPTION_MAX (155) — an excerpt over that ships with a "…" mid-sentence.
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPTION_MAX = 155;
const TITLE_SUFFIX = " — RiftCompare"; // src/app/guides/[slug]/page.tsx

function article(slug: string) {
  const a = ARTICLES.find((x) => x.slug === slug);
  assert.ok(a, `expected ${slug} to exist`);
  return a!;
}

test("the banlist guide's title is a list, not an explainer", () => {
  const a = article("riftbound-banlist-explained");
  assert.match(a.title, /^Riftbound Ban List\b/, "must lead with the query term");
  assert.match(a.title, /Banned Card/i, "must name the 'banned cards' query too");
  assert.doesNotMatch(a.title, /Explained/, "'Explained' mismatches list intent");
  assert.ok(
    `${a.title}${TITLE_SUFFIX}`.length <= 60,
    `title is ${`${a.title}${TITLE_SUFFIX}`.length} chars with the suffix`,
  );
});

test("the banlist guide's description names both formats and is not clamped", () => {
  const a = article("riftbound-banlist-explained");
  assert.match(a.excerpt, /Standard/);
  assert.match(a.excerpt, /2v2/);
  assert.match(a.excerpt, /live prices/);
  assert.ok(a.excerpt.length <= DESCRIPTION_MAX, `excerpt is ${a.excerpt.length} chars`);
});

test("the empower guide's description answers the question in its first sentence", () => {
  const a = article("riftbound-empower-explained");
  // The definition the body opens with, so snippet and page agree.
  assert.match(a.excerpt, /^Empower lets a card gain new abilities/);
  assert.match(a.excerpt, /Disempower/);
  assert.ok(a.excerpt.length <= DESCRIPTION_MAX, `excerpt is ${a.excerpt.length} chars`);
  // Title shape is owned by tests/seo-landing-pages.test.ts; only the excerpt moved.
  assert.match(a.title, /Explained: How the .+ Mechanic Works/);
});
