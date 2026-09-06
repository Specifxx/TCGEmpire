import test from "node:test";
import assert from "node:assert/strict";

import { ALL_KEYWORD_NAMES, KEYWORDS, keywordBySlug, keywordSlug } from "../src/lib/keywords";

// ─────────────────────────────────────────────────────────────────────────────
// The /keywords glossary is now fully populated — every name in
// ALL_KEYWORD_NAMES has a verified KeywordEntry (2026-08-12). Before this, the
// hub page rendered "Soon" placeholders for the ~27 names with no entry — the
// gap this test suite locks shut, so a future edit can't silently reintroduce
// one without a deliberate change here.
// ─────────────────────────────────────────────────────────────────────────────

test("every name in ALL_KEYWORD_NAMES has a real KEYWORDS entry — no more hub placeholders", () => {
  for (const name of ALL_KEYWORD_NAMES) {
    const entry = keywordBySlug(keywordSlug(name));
    assert.ok(entry, `"${name}" is listed in ALL_KEYWORD_NAMES but has no KEYWORDS entry — /keywords would render it as an unlinked "Soon" placeholder`);
    assert.equal(entry!.name, name, `KEYWORDS entry for "${keywordSlug(name)}" has name "${entry!.name}", expected "${name}"`);
  }
});

test("ALL_KEYWORD_NAMES and KEYWORDS carry exactly the same set of keywords", () => {
  // Catches drift in the OTHER direction: an entry added to KEYWORDS without
  // also being catalogued in ALL_KEYWORD_NAMES would be a real, working page
  // that's simply missing from the hub's alphabetised index.
  const catalogued = new Set(ALL_KEYWORD_NAMES);
  for (const k of KEYWORDS) {
    assert.ok(catalogued.has(k.name), `KEYWORDS has "${k.name}" but it isn't listed in ALL_KEYWORD_NAMES`);
  }
  assert.equal(KEYWORDS.length, ALL_KEYWORD_NAMES.length, "KEYWORDS and ALL_KEYWORD_NAMES have diverged in length");
});

test("slug and keywordSlug(name) always agree", () => {
  for (const k of KEYWORDS) {
    assert.equal(k.slug, keywordSlug(k.name), `${k.name}'s slug "${k.slug}" doesn't match keywordSlug(name) — /keywords/${k.slug} and the hub's generated link would disagree`);
  }
});

test("every relatedKeywords entry resolves to a real KEYWORDS slug", () => {
  // The bottom-of-page "related keyword" chips render straight off this list —
  // a typo'd or removed slug here is a dead link on every affected page.
  const slugs = new Set(KEYWORDS.map((k) => k.slug));
  for (const k of KEYWORDS) {
    for (const rel of k.relatedKeywords) {
      assert.ok(slugs.has(rel), `${k.name}'s relatedKeywords lists "${rel}", which is not a real keyword slug`);
      assert.notEqual(rel, k.slug, `${k.name} lists itself in relatedKeywords`);
    }
  }
});

test("every entry has a direct answer, real sections, and at least 3 FAQs", () => {
  for (const k of KEYWORDS) {
    const words = k.directAnswer.trim().split(/\s+/).length;
    assert.ok(words >= 30 && words <= 100, `${k.name}'s directAnswer is ${words} words — expected roughly 50-80`);
    assert.ok(k.sections.length >= 1, `${k.name} has no sections`);
    for (const s of k.sections) {
      assert.ok(s.heading.trim().length > 0, `${k.name} has a section with an empty heading`);
      assert.ok(s.body.trim().length >= 80, `${k.name}'s "${s.heading}" section body looks too thin (${s.body.trim().length} chars)`);
    }
    assert.ok(k.faqs.length >= 3, `${k.name} has only ${k.faqs.length} FAQs — expected at least 3`);
    for (const faq of k.faqs) {
      assert.ok(faq.q.trim().endsWith("?"), `${k.name} has a FAQ question that doesn't end in "?": ${JSON.stringify(faq.q)}`);
      assert.ok(faq.a.trim().length > 0, `${k.name} has an empty FAQ answer for "${faq.q}"`);
    }
  }
});

test("no duplicate slugs, names, or rulesContain markers within one set", () => {
  const slugs = new Set<string>();
  const names = new Set<string>();
  for (const k of KEYWORDS) {
    assert.ok(!slugs.has(k.slug), `duplicate slug: ${k.slug}`);
    slugs.add(k.slug);
    assert.ok(!names.has(k.name), `duplicate name: ${k.name}`);
    names.add(k.name);
  }
  // rulesContain CAN legitimately repeat across different sets (e.g. two
  // keywords scoped to different sets could share a marker in theory) — but
  // every entry here is scoped to the same set (VEN, see the KeywordEntry.set
  // comment), so within that one set every marker must be unique, or two
  // keyword pages would show each other's cards.
  const byMarkerInSet = new Map<string, string>();
  for (const k of KEYWORDS) {
    const key = `${k.set}|${k.rulesContain}`;
    const clash = byMarkerInSet.get(key);
    assert.ok(!clash, `${k.name} and ${clash} share the marker "${k.rulesContain}" in set ${k.set} — their "every card" lists would overlap or collide`);
    byMarkerInSet.set(key, k.name);
  }
});

test("sections and FAQs read as our own prose, not a copy-pasted rules citation", () => {
  // A soft guard for the DATA-ACCURACY RULE at the top of lib/keywords.ts: this
  // can't verify a paraphrase is faithful, but it CAN catch the laziest failure
  // mode — literally leaving in the source document's own rule-numbering style
  // ("805.1.a.") instead of writing it out.
  const RULE_NUMBER = /\b\d{3}\.\d/;
  for (const k of KEYWORDS) {
    assert.doesNotMatch(k.directAnswer, RULE_NUMBER, `${k.name}'s directAnswer looks like it still has a raw rule citation in it`);
    for (const s of k.sections) {
      assert.doesNotMatch(s.body, RULE_NUMBER, `${k.name}'s "${s.heading}" section looks like it still has a raw rule citation in it`);
    }
  }
});
