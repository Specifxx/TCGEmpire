import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYWORDS, hasOwnGuide, keywordPageDescription, keywordPageTitle } from "../src/lib/keywords";

// Page scorecard 2026-11-23: keyword pages at position ~9 with 0 clicks for question
// searches ("what does tank do riftbound"). Titles ask that question; descriptions open
// with the page's own first FAQ answer.
test("keyword titles ask the searcher's question, under 60 characters", () => {
  for (const kw of KEYWORDS) {
    const t = keywordPageTitle(kw, 120);
    if (hasOwnGuide(kw)) {
      assert.equal(t, `${kw.name} — Riftbound Keyword Reference | RiftCompare`);
      continue;
    }
    assert.match(t, new RegExp(`^What Does ${kw.name} Do in Riftbound\\?`));
    assert.ok(t.length <= 60, `${kw.slug}: ${t.length} chars`);
    assert.ok(keywordPageTitle(kw, 0).length <= 60);
  }
});

test("keyword descriptions lead with the page's own answer and fit a snippet", () => {
  const titles = new Set<string>();
  for (const kw of KEYWORDS) {
    const d = keywordPageDescription(kw);
    titles.add(d);
    assert.ok(d.length <= 161 || hasOwnGuide(kw), `${kw.slug}: ${d.length} chars`);
    assert.ok(d.endsWith(`ard${hasOwnGuide(kw) ? " printed" : ""} with ${kw.name}, live-priced.`));
    const source = hasOwnGuide(kw) || !kw.faqs?.[0] ? kw.directAnswer : kw.faqs[0].a;
    const lead = d.slice(0, d.search(/ (Plus every|Every) card/)).replace(/…$/, "");
    assert.ok(source.replace(/\s+/g, " ").startsWith(lead), `${kw.slug}: lead not from its own answer`);
  }
  assert.equal(titles.size, KEYWORDS.length, "descriptions are unique");
});
