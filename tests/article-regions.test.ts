import test from "node:test";
import assert from "node:assert/strict";

import { getArticles } from "../src/lib/articles";
import { COUNTRY_LIST } from "../src/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// Article prose must not quietly pick a subset of the markets we serve.
//
// The failure this guards is not a typo — it is drift. Copy written when the
// site had four markets said "AUD, NZD, USD or GBP"; SGD and CAD readers were
// then told, in the site's own words, that their currency was not one of the
// options. The T1 Signature Edition drawing FAQ was the same shape once — it
// gave opening times for Pacific/Eastern/UK/Australia while the article body
// tabulated all six — before that article was retired (AdSense remediation
// Phase 26, its registration window having closed).
//
// The rule: a passage may mention ONE currency (e.g. a US-priced product), or
// it may enumerate the markets we price — but a partial enumeration is a bug,
// because it reads as an exhaustive list and is wrong for the omitted markets.
// Derived from COUNTRY_LIST, so adding a market makes this fail until the copy
// is updated, which is the point.
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCIES = [...new Set(COUNTRY_LIST.map((c) => c.currency))];

/**
 * Currencies named as an ENUMERATION — "AUD, NZD, USD or GBP" — rather than
 * merely mentioned. The distinction matters: "comparing GBP to USD by eye" is an
 * illustrative example of a cross-currency mistake, not a claim about which
 * markets we support, and flagging it would train people to ignore this test.
 * Only comma/or/and-joined runs count.
 */
const ISO = CURRENCIES.join("|");
const LIST_RE = new RegExp(`\\b(?:${ISO})\\b(?:\\s*(?:,|,?\\s*(?:or|and))\\s*\\b(?:${ISO})\\b)+`, "g");

function enumerated(text: string): string[] {
  const out = new Set<string>();
  for (const run of text.match(LIST_RE) ?? []) {
    for (const iso of CURRENCIES) if (new RegExp(`\\b${iso}\\b`).test(run)) out.add(iso);
  }
  return [...out];
}

const articles = getArticles();

test("there are articles to check", () => {
  assert.ok(articles.length > 0);
});

test("no article enumerates a partial list of our market currencies", () => {
  const bad: string[] = [];
  for (const a of articles) {
    const text = [a.excerpt, a.body, ...(a.summary ?? []), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join("\n");
    const found = enumerated(text);
    // An enumeration reads as "here are the currencies we support", so a
    // partial one is wrong for every market it leaves out.
    if (found.length > 1 && found.length < CURRENCIES.length) {
      bad.push(`${a.slug}: names ${found.join(", ")} but omits ${CURRENCIES.filter((c) => !found.includes(c)).join(", ")}`);
    }
  }
  assert.deepEqual(bad, [], `partial market lists:\n  ${bad.join("\n  ")}`);
});

test("no summary or FAQ answer names some markets' local times but not others", () => {
  // Naming a handful of specific regions in a one-line answer is the exact shape
  // of the original bug: it looks complete and silently excludes the rest.
  const REGION = /\b(Pacific|Eastern|UK|United Kingdom|Australia|Singapore|Canada)\b/g;
  const bad: string[] = [];
  for (const a of articles) {
    for (const text of [...(a.summary ?? []), ...(a.faq ?? []).map((f) => f.a)]) {
      // Only applies to passages that are actually giving clock times.
      if (!/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(text)) continue;
      // A UTC anchor makes the passage region-neutral on its own; quoting the
      // publisher's local framing next to it is context, not exclusion.
      if (/\bUTC\b/.test(text)) continue;
      const regions = [...new Set(text.match(REGION) ?? [])];
      // ANY region-local clock time without a UTC anchor. An earlier version of
      // this test allowed up to three named regions, which let the original
      // defect through untouched — it named four (Pacific, Eastern, UK,
      // Australia) and still excluded New Zealand, Singapore and Canada. There
      // is no safe count: a summary or FAQ answer is one or two lines, so the
      // only version that works for every reader is the neutral one.
      if (regions.length > 0) {
        bad.push(`${a.slug}: clock times for ${regions.join(", ")} with no UTC anchor — state the window in UTC`);
      }
    }
  }
  assert.deepEqual(bad, [], `region-partial times:\n  ${bad.join("\n  ")}`);
});
