import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";
import { monthYear } from "../src/lib/content/month-year";

// CTR pass, 2026-09-24: five pages ranking on page one and losing the click.
// Query first; descriptions tease the payoff; "(Mon YYYY)" only on the two
// time-sensitive pages, derived from `updated` so title and dateModified agree.

const get = (slug: string) => {
  const a = ARTICLES.find((x) => x.slug === slug);
  assert.ok(a, slug);
  return a!;
};
const QUERY_FIRST: Record<string, RegExp> = {
  "riftbound-banlist-explained": /^Riftbound Ban List\b/,
  "riftbound-empower-explained": /^Riftbound Empower\b/,
  "riftbound-card-size-sleeves-deck-boxes": /^Riftbound Card Size\b/,
  "riftbound-flow-explained": /^Riftbound Flow\b/,
  "most-expensive-riftbound-cards": /^Most Expensive Riftbound Cards\b/,
};

test("each title leads with its query and fits 60 characters with the suffix", () => {
  for (const [slug, re] of Object.entries(QUERY_FIRST)) {
    const a = get(slug);
    assert.match(a.title, re, slug);
    assert.ok(`${a.title} — RiftCompare`.length <= 60, `${slug}: ${a.title}`);
    assert.ok(a.excerpt.length <= 155, `${slug} excerpt ${a.excerpt.length}`);
  }
});

test("dated titles take their month from `updated`; evergreen ones carry none", () => {
  for (const slug of ["riftbound-banlist-explained", "most-expensive-riftbound-cards"]) {
    const a = get(slug);
    assert.ok(a.updated, slug);
    assert.ok(a.title.includes(`(${monthYear(a.updated!)})`), `${slug}: ${a.title}`);
  }
  for (const slug of ["riftbound-empower-explained", "riftbound-card-size-sleeves-deck-boxes", "riftbound-flow-explained"]) {
    assert.doesNotMatch(get(slug).title, /\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\)/, slug);
  }
  assert.equal(monthYear("2026-09-15"), "Sep 2026");
});

test("descriptions tease rather than give the answer away", () => {
  assert.doesNotMatch(get("riftbound-card-size-sleeves-deck-boxes").excerpt, /63 ?x ?88/, "the size itself is the payoff");
  assert.doesNotMatch(get("riftbound-card-size-sleeves-deck-boxes").title, /63 ?x ?88/);
});
