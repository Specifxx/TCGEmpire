import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLES, getArticle } from "../src/lib/articles";
import { META_DECKS } from "../src/lib/meta-decks";
import { groupStaples } from "../src/lib/deck-groups";

// ─────────────────────────────────────────────────────────────────────────────
// /guides/best-riftbound-cards — the "best cards" listicle.
//
// Every number in that article is a COUNT over prisma/meta-decks.json, not an
// opinion, which is the only reason a page can claim to rank cards without
// asserting anything about how they play. The risk that creates is specific:
// the decklists are re-cut as the metagame moves, and the moment they are, a
// hand-typed "48 cards" or "in five of the ten lists" becomes a confident,
// checkable falsehood on an indexed page.
//
// So these tests re-derive every figure the prose states and compare. When the
// meta is next updated this file fails and names the number to change — which is
// the intended workflow, not an obstacle to it.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "best-riftbound-cards";
const article = getArticle(SLUG);
const staples = groupStaples(META_DECKS, 2);
const text = () => {
  const a = article!;
  return [a.body, a.excerpt, ...(a.summary ?? []), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join("\n");
};

test("the article exists, is published, and is a guide", () => {
  assert.ok(article, `${SLUG} must exist`);
  assert.ok(!article!.draft, "it is published, so the counts below are live claims");
  assert.equal(article!.category, "guide", "category decides the URL — /guides/, not /blog/");
});

test("the stated staple count matches the decklists", () => {
  const claimed = /produces \*\*(\d+) cards\*\*/.exec(article!.body)?.[1];
  assert.ok(claimed, "the body must state how many cards the count produced");
  assert.equal(
    Number(claimed),
    staples.length,
    `body says ${claimed} staples; the decklists now produce ${staples.length}. Re-cut the article's figures.`,
  );
  // The same number appears in the excerpt and the summary — all three must agree.
  assert.ok(article!.excerpt.includes(String(staples.length)), "the excerpt quotes a stale staple count");
  assert.ok(
    (article!.summary ?? []).some((s) => s.includes(String(staples.length))),
    "the summary quotes a stale staple count",
  );
});

test("the stated three-deck count matches", () => {
  const atLeastThree = staples.filter((s) => s.deckCount >= 3).length;
  assert.match(
    text(),
    new RegExp(`\\b${atLeastThree}\\b[^.]*three decks or more|Twenty of them`, "i"),
    `${atLeastThree} cards now appear in 3+ decks — check the article still says so`,
  );
  // Spelled out in the summary as a word; assert the digit form in the body instead.
  assert.ok(
    article!.body.includes("three decks or more"),
    "the body must state the 3+ deck cut",
  );
  assert.equal(atLeastThree, 20, `the article spells this as "Twenty" — it is now ${atLeastThree}`);
});

test("the named most-played card is still the most-played card", () => {
  const top = staples[0];
  const runnerUp = Math.max(...staples.slice(1).map((s) => s.deckCount));
  assert.ok(text().includes(top.name), `the most-played card is now ${top.name}; the article does not name it`);
  assert.match(
    article!.body,
    new RegExp(`\\*\\*${top.name}\\*\\*, in five of the ten lists`),
    `the article's headline claim names a card and a count that must match ${top.name} at ${top.deckCount}/${META_DECKS.length}`,
  );
  assert.equal(top.deckCount, 5, `top card is now in ${top.deckCount} decks, not 5`);
  assert.equal(META_DECKS.length, 10, `the sample is now ${META_DECKS.length} decks, not 10`);
  assert.equal(runnerUp, 3, "the article says no other card is in more than three");
});

test("the type breakdown matches", () => {
  const by = staples.reduce<Record<string, number>>((a, s) => ({ ...a, [s.section]: (a[s.section] ?? 0) + 1 }), {});
  const claim = /(\d+) of the 48 are spells, against (\d+) units, (\d+) battlefields, (\d+) gear and (\d+) champion/.exec(
    article!.body,
  );
  assert.ok(claim, "the body must state the type breakdown");
  assert.equal(Number(claim![1]), by.spell ?? 0, "spell count drifted");
  assert.equal(Number(claim![2]), by.unit ?? 0, "unit count drifted");
  assert.equal(Number(claim![3]), by.battlefield ?? 0, "battlefield count drifted");
  assert.equal(Number(claim![4]), by.gear ?? 0, "gear count drifted");
  assert.equal(Number(claim![5]), by.champion ?? 0, "champion count drifted");
});

test("the playset and battlefield arithmetic matches", () => {
  const playsets = staples.filter((s) => s.maxQty === 3).length;
  assert.ok(
    article!.body.includes(`Twenty-five of the 48`),
    "the body states how many staples are run at three copies",
  );
  assert.equal(playsets, 25, `${playsets} staples are now run at 3 copies, not 25`);

  // "each deck runs three battlefields, so the ten lists have thirty slots"
  const perDeck = META_DECKS.map((d) => d.cards.filter((c) => c.section === "battlefield").reduce((n, c) => n + c.qty, 0));
  assert.ok(perDeck.every((n) => n === 3), `not every deck runs 3 battlefields: ${perDeck.join(",")}`);
  assert.equal(perDeck.reduce((a, b) => a + b, 0), 30, "the stated 30 battlefield slots no longer holds");
  assert.equal(staples.filter((s) => s.section === "battlefield").length, 7, "the stated 7 recurring battlefields drifted");
});

test("every champion card the article names really is a shared one", () => {
  const champs = staples.filter((s) => s.section === "champion");
  assert.equal(champs.length, 2, `${champs.length} champion cards are now shared, not 2`);
  for (const c of champs) {
    assert.ok(article!.body.includes(c.name), `the body must name the shared champion card ${c.name}`);
  }
});

test("every card named in the itemList is a real staple, in order", () => {
  const items = article!.itemList?.items ?? [];
  assert.ok(items.length >= 5, "a listicle's ItemList should carry the ranked entities");
  const byName = new Map(staples.map((s) => [s.name, s]));
  for (const it of items) {
    const s = byName.get(it.name);
    assert.ok(s, `ItemList names "${it.name}", which is not a card played in 2+ decks`);
  }
  // The first entry must be the actual most-played card — an ItemList whose
  // order contradicts the page is exactly what rich-result validation flags.
  assert.equal(items[0].name, staples[0].name, "the ItemList must lead with the most-played card");
});

test("the galleries are generated, not hand-listed", () => {
  // The whole point: a hard-coded slug list would go stale the next time the
  // decklists change, and could name a card that isn't in one.
  const embeds = article!.embeds ?? [];
  assert.equal(embeds.length, 2, "expected the two staple galleries");
  for (const e of embeds) {
    assert.ok(e.metaStaples, "each gallery must derive from the decklists");
    assert.ok(!e.slugs, "no hand-listed slugs — they rot");
  }
  assert.deepEqual(
    embeds.map((e) => (typeof e.metaStaples === "object" ? e.metaStaples.minDecks : 2)),
    [2, 3],
    "the two cuts are 2+ decks and 3+ decks",
  );
  // Both markers must be placed in the body, or a gallery renders in the wrong spot.
  for (const [i] of embeds.entries()) {
    assert.ok(article!.body.includes(`[[embed:${i}]]`), `body must place [[embed:${i}]]`);
  }
});

test("the resolver honours the minDecks floor and prefers base printings", () => {
  const src = readFileSync(join(process.cwd(), "src/components/ArticleView.tsx"), "utf8");
  assert.match(src, /if \(e\.metaStaples\)/, "ArticleView must handle the metaStaples mode");
  assert.match(src, /groupStaples\(META_DECKS, minDecks\)/, "it must use the shared staple counter");
  assert.match(src, /isPromo: false/, "a promo printing is a different product from the card a decklist names");
  assert.match(src, /isBase\(r\) && !isBase\(prev\)/, "it must prefer the base printing of each staple");
  // groupStaples itself must keep excluding runes and side decks, or the
  // article's "48" and its own caveat about runes stop being true.
  const gs = readFileSync(join(process.cwd(), "src/lib/deck-groups.ts"), "utf8");
  assert.match(gs, /c\.section === "rune" \|\| c\.section === "sideboard"/, "runes and side decks stay excluded");
});

test("it does not cannibalise the value articles, and links to them instead", () => {
  const body = article!.body;
  for (const slug of ["most-valuable-riftbound-cards", "most-expensive-riftbound-cards"]) {
    assert.ok(body.includes(slug), `must point price-intent readers at ${slug} rather than compete with it`);
  }
  // Titles must stay distinct: this page is about play rate, those are about money.
  const others = ARTICLES.filter((a) => a.slug !== SLUG && /\bcards\b/i.test(a.title));
  for (const o of others) {
    assert.notEqual(o.title.toLowerCase(), article!.title.toLowerCase(), `title collides with ${o.slug}`);
  }
  assert.ok(/most-played|counted|counting/i.test(body), "the page must state its measured basis");
});

test("it makes no claim about how the cards play", () => {
  // The article ranks by play rate precisely so it never has to assert card
  // power, which would need rules text we do not hold for most of these cards
  // (the same discipline as lib/keywords.ts's DATA-ACCURACY RULE).
  const banned = [
    /\bbroken\b/i,
    /\boverpowered\b/i,
    /\bbest card in the game\b/i,
    /\bauto-?include\b/i,
    /because it (lets|deals|draws|gives)/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(text()), `article makes an unverifiable power claim matching ${re}`);
  }
  assert.ok(
    /deliberately does not do is tell you \*why\*/i.test(article!.body),
    "the article should say plainly, in the body, that it is not making power claims",
  );
});
