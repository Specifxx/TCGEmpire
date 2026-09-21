import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// A DESCRIPTION OVER 155 CHARACTERS SHIPS TRUNCATED, MID-SENTENCE.
// ─────────────────────────────────────────────────────────────────────────────
// /blog/[slug] and /guides/[slug] both cut `excerpt` at DESCRIPTION_MAX = 155 on
// a word boundary before it becomes <meta name="description">. So an excerpt
// written at 230 characters is not a longer description — it is a 155-character
// description whose last sentence is missing, chosen by a character count rather
// than by whoever wrote it.
//
// THIS IS A RATCHET, NOT A PASS/FAIL ON THE WHOLE CATALOGUE. 48 articles were
// over the cap when this was written (2026-09-21), and rewriting all 48 is a
// content pass scoped to real Search Console data, not something to bulk-edit
// blind — the CTR work so far has deliberately been driven by which pages
// actually earn impressions and lose the click. What this test does is stop the
// number going UP while that work happens, and force it down as pages are fixed:
// add an over-length excerpt and the count rises and this fails; fix a batch and
// lower BUDGET in the same commit.
//
// The right long-term value of BUDGET is 0.
const BUDGET = 44;
const MAX = 155;

test("no new over-length article descriptions", () => {
  const over = ARTICLES.filter((a) => a.excerpt.length > MAX);
  assert.ok(
    over.length <= BUDGET,
    `${over.length} articles have an excerpt over ${MAX} chars, up from the budgeted ${BUDGET}. ` +
      `Newly over: ${over.map((a) => `${a.slug} (${a.excerpt.length})`).join(", ")}`,
  );
  // Ratchet down: when a batch is fixed, this tells you to lower BUDGET so the
  // gain is locked in rather than quietly spent on the next long excerpt.
  assert.equal(
    over.length,
    BUDGET,
    `${BUDGET - over.length} over-length excerpt(s) have been fixed — lower BUDGET to ${over.length} in this commit to keep the gain.`,
  );
});

// The pages the CTR pass has already rewritten. These are pinned hard, because
// they are the ones earning impressions and losing the click, and a later edit
// that pushes one back over the cap would undo the whole point of the rewrite.
const REWRITTEN = [
  "buy-riftbound-cards-australia",
  "buy-riftbound-cards-us",
  "buy-riftbound-cards-uk",
  "buy-riftbound-cards-canada",
  "buy-riftbound-cards-europe",
  "riftbound-price-comparison-singapore",
  "best-riftbound-price-comparison-sites",
  "riftbound-banlist-explained",
  "riftbound-singles-vs-sealed",
];

test("the rewritten CTR pages stay within the description cap", () => {
  for (const slug of REWRITTEN) {
    const a = ARTICLES.find((x) => x.slug === slug);
    assert.ok(a, `${slug} no longer exists — if it was retired, drop it from REWRITTEN`);
    assert.ok(
      a!.excerpt.length <= MAX,
      `${slug}'s description is ${a!.excerpt.length} chars and will ship truncated`,
    );
    // A title long enough to be cut at ~60 chars with the site-name suffix
    // attached is the same failure one field up.
    assert.ok(a!.title.length <= 60, `${slug}'s title is ${a!.title.length} chars before the site-name suffix`);
  }
});
