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
// over the cap when this was written (2026-09-21). The Search Console export
// that arrived the same day turned the case from "tidy" into "measured": at the
// SAME average position of 7.8, /blog converts at 3.89% and /guides at 1.18%,
// and the clearest difference between them is that 67% of guide descriptions
// were over this cap against 26% of blog ones. 29,875 impressions — 18% of the
// site's total — were sitting on a description cut off mid-sentence.
//
// Driven to 1 on 2026-09-24. The survivor is the Radiance leak post, left
// deliberately: it is the site's best page (8,142 impressions at 11.19% CTR)
// and mid-news-cycle, so editing it to save 44 characters trades a working
// page for a rule. What this test does is stop the number going UP,
// and force it down as pages are fixed: add an over-length excerpt and the count
// rises and this fails; fix a batch and lower BUDGET in the same commit.
//
// ONE CAVEAT FOR ANYONE AUTOMATING THIS. `assert.equal` below is right for a
// human working alone and hostile to several writers at once — a batch of agents
// each fixing one description will each try to lower this constant and race each
// other (they went 47, 44, 43, 42 in one afternoon while the real count moved
// underneath them). Set it once, at the end, from a single count.
//
// The right long-term value of BUDGET is 0.
const BUDGET = 1;
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

// ─────────────────────────────────────────────────────────────────────────────
// A TITLE OVER ~60 RENDERED CHARACTERS IS CUT IN THE RESULT.
// ─────────────────────────────────────────────────────────────────────────────
// Both article routes append a site-name suffix (" — RiftCompare", 14 chars), so
// the budget for the `title` field itself is 46. 36 articles were over it on
// 2026-09-24, carrying 30,278 impressions — 18% of the site's total shipping a
// headline with its end chopped off, several of them mid-word.
//
// Driven to 1 the same day. The survivor is deliberate: the Radiance leak post
// is the site's best page by a distance (8,142 impressions at 11.19% CTR, a
// quarter of all clicks) and it is mid-news-cycle. Editing a title that is
// working that hard, during the spike that makes it work, to save a few
// characters is a bad trade and destroys the attribution for it.
const TITLE_SUFFIX = " — RiftCompare".length;
const TITLE_RENDERED_MAX = 60;
const TITLE_BUDGET = 1;

test("no new article titles that get cut in the search result", () => {
  const over = ARTICLES.filter((a) => a.title.length + TITLE_SUFFIX > TITLE_RENDERED_MAX);
  assert.ok(
    over.length <= TITLE_BUDGET,
    `${over.length} titles render over ${TITLE_RENDERED_MAX} chars, up from the budgeted ${TITLE_BUDGET}: ` +
      over.map((a) => `${a.slug} (${a.title.length + TITLE_SUFFIX})`).join(", "),
  );
  assert.equal(
    over.length,
    TITLE_BUDGET,
    `${TITLE_BUDGET - over.length} over-length title(s) fixed — lower TITLE_BUDGET to ${over.length} in this commit to keep the gain.`,
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
