import test from "node:test";
import assert from "node:assert/strict";
import { getArticles } from "../src/lib/articles";

// Every article links at least one tool or data page from its own text
// (2026-09-26, "Blog and tools, joined up" in DECISIONS.md). The template adds
// "Ready to buy?" and a related-tools row to every article, but those are the
// same shape on all of them; a link inside the prose, in the sentence that
// needs it, is what joins a guide to the tool it explains. Six published
// articles had none, including the ban-list guide (8,519 impressions).
//
// A RATCHET. The allowlist holds only articles that are allowed to have none,
// each with its reason, and an entry that gains a link or stops being
// published fails until it is removed — the list only ever shrinks.

// content-links.test.ts's TOOL_OR_CATEGORY (the pack's 3-link rule), widened
// to the other data pages an article can send a reader to: card pages, the
// deck library, pre-orders, release dates, auctions, methodology, gallery.
const TOOL_OR_DATA =
  /^\/(browse|sets|champions|movers|tools|trade|alerts|cards|card|sealed|market|stores|premium|singles|deck|decks|domains|keywords|portfolio|radiance-preorders|release-dates|auctions|methodology|gallery)(\/|$)/;
const LINK = /(?<!!)\[[^\]]*\]\((\/[^)\s]*)\)/g;

const ALLOWLIST: Record<string, string> = {
  // An event post for 25–27 Sep 2026: once the event passes it is a
  // retirement candidate (Phase 26), not a page to deepen.
  "riftbound-2026-regional-qualifier-los-angeles": "event post, due for retirement after the event",
};

function toolLinks(a: ReturnType<typeof getArticles>[number]): string[] {
  const texts = [a.body, ...(a.summary ?? []), ...(a.faq ?? []).map((f) => f.a)];
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(LINK)) {
      const path = m[1].split(/[?#]/)[0];
      if (TOOL_OR_DATA.test(path)) out.add(path);
    }
  }
  return [...out];
}

test("every published article links a tool or data page from its own text", () => {
  const missing = getArticles()
    .filter((a) => !(a.slug in ALLOWLIST) && toolLinks(a).length === 0)
    .map((a) => a.slug);
  assert.deepEqual(missing, [], `articles whose body, summary and FAQ link no tool or data page:\n  ${missing.join("\n  ")}`);
});

test("the allowlist only shrinks: every entry is still published and still has no tool link", () => {
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  for (const slug of Object.keys(ALLOWLIST)) {
    const a = bySlug.get(slug);
    assert.ok(a, `${slug} is no longer published — remove it from ALLOWLIST`);
    assert.deepEqual(toolLinks(a!), [], `${slug} now links a tool — remove it from ALLOWLIST`);
  }
});

test("the pattern counts tool and data pages, not articles, images or policy pages", () => {
  for (const p of ["/tools/best-basket", "/card/x-ogn-001-298", "/cards/rarity", "/deck", "/movers", "/market/records"]) {
    assert.match(p, TOOL_OR_DATA, p);
  }
  for (const p of ["/guides/x", "/blog/x", "/about", "/editorial-policy", "/cardsx", "/decksmith"]) {
    assert.doesNotMatch(p, TOOL_OR_DATA, p);
  }
  assert.deepEqual([..."![hero](/blog/x.png) [a](/browse)".matchAll(LINK)].map((m) => m[1]), ["/browse"]);
});
