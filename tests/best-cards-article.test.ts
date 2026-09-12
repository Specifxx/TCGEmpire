import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// /guides/best-riftbound-cards — ranked by a signal the site measures itself.
//
// Until 2026-09-12 this guide ranked cards by how many of the hand-typed lists
// in prisma/meta-decks.json ran each one, and this file re-derived every number
// in the prose from that JSON. The JSON was stale within weeks (DECISIONS.md,
// "Meta decks: removed") and went with the meta decks. The guide now leads with
// search demand — getPopularCards(), the same query the homepage's popular
// carousel runs — and these tests pin the things that would let the old, stale
// shape creep back: a hand-listed gallery, a decklist count in the prose, a
// link to a page that no longer exists.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(p, "utf8");
const article = ARTICLES.find((a) => a.slug === "best-riftbound-cards");

// Everything a reader (or a crawler) can see, in one string.
const visible = (a: NonNullable<typeof article>) =>
  [
    a.title,
    a.excerpt,
    ...(a.summary ?? []),
    ...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
    a.browseCta?.label ?? "",
    a.browseCta?.blurb ?? "",
    ...(a.embeds ?? []).flatMap((e) => [e.title, e.note ?? ""]),
    a.body,
  ].join("\n");

test("the guide exists, is a guide, and is marked as updated when it changed basis", () => {
  assert.ok(article, "best-riftbound-cards must exist");
  assert.equal(article!.category, "guide");
  assert.ok(article!.updated && article!.updated >= "2026-09-12", "the basis change is a substantive edit and must stamp `updated`");
});

test("the gallery is live and demand-ranked, not hand-listed", () => {
  const embeds = article!.embeds ?? [];
  assert.equal(embeds.length, 1, "one gallery: the most-wanted cards");
  assert.equal(embeds[0].popular, true, "it must be the popular (search-demand) mode");
  assert.ok(!embeds[0].slugs, "never a hand-typed slug list — that is the shape that went stale");
  assert.ok(!("metaStaples" in embeds[0]), "the decklist-derived mode is gone");
  assert.match(article!.body, /\[\[embed:0\]\]/, "the body must actually place the gallery");
  assert.equal(article!.itemList, undefined, "a static ranked list would contradict the live gallery");
});

test("no article anywhere still asks for the retired decklist-derived gallery", () => {
  for (const a of ARTICLES) {
    const all = [...(a.embeds ?? []), ...(a.embed ? [a.embed] : [])];
    for (const e of all) assert.ok(!("metaStaples" in e), `${a.slug} still uses metaStaples`);
  }
});

test("the prose makes no decklist-count claim and links no removed page", () => {
  const text = visible(article!);
  assert.doesNotMatch(text, /\]\(\/decks/, "the meta-deck pages are gone; a link to one is a redirect at best");
  assert.doesNotMatch(text, /\b\d+ of the (\d+|ten) (tournament )?(lists|decks)\b/i, "counts over decklists were the stale claim");
  assert.doesNotMatch(text, /meta decks page/i);
  assert.match(text, /search(ed|es)? for|search demand/i, "the stated basis must be search demand");
});

test("it makes no claim about how the cards play", () => {
  assert.match(article!.body, /What this page deliberately does not do is tell you \*why\* any of these cards is good/);
});

test("it sends readers to pages that exist: the demand leaderboard and the deck builder", () => {
  assert.equal(article!.browseCta?.href, "/tools/demand");
  assert.match(article!.body, /\]\(\/deck\)/, "the deck builder is how a reader prices what they want");
});

test("ArticleView serves the popular mode from getPopularCards, and the old mode is gone", () => {
  const src = read("src/components/ArticleView.tsx");
  assert.match(src, /if \(e\.popular\)/);
  assert.match(src, /getPopularCards\(e\.take \?\? 12, DEFAULT_COUNTRY\)/, "reuse the homepage's query rather than hand-rolling one");
  // A comment MENTIONING the retired mode's name (explaining why it's gone) is
  // fine and expected; live usage — an `e.metaStaples` check, an import of
  // META_DECKS/groupStaples, or a branch calling groupStaples(...) — is not.
  assert.doesNotMatch(src, /e\.metaStaples/);
  assert.doesNotMatch(src, /import[^;]*\b(META_DECKS|groupStaples)\b/);
  assert.doesNotMatch(src, /groupStaples\(/);
});
