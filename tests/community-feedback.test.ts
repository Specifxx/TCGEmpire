// Reddit-feedback batch, 2026-10-02 (DECISIONS.md, "Community feedback batch:
// ban badges, ad-free arcade, author box, did-you-mean").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNED_CARDS, banFor } from "../src/lib/banlist";
import { cardSlug } from "../src/lib/card-url";
import { didYouMean, editDistance, typoBudget } from "../src/lib/did-you-mean";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("banFor matches every printing by name, and only banned names", () => {
  for (const b of BANNED_CARDS) {
    assert.equal(banFor(b.name)?.slug, b.slug);
    assert.equal(banFor(b.name.toUpperCase())?.name, b.name, "case-insensitive");
    // The name must be the card's real name: its slug is built from it.
    assert.ok(b.slug.startsWith(cardSlug({ name: b.name, setCode: "", collectorNumber: "" })), `${b.name} ↔ ${b.slug}`);
  }
  assert.equal(banFor("Jinx, Loose Cannon"), null);
});

test("the ban notice renders on the card page and in the quick view, linking the ban list", () => {
  assert.match(read("src/app/card/[id]/page.tsx"), /<BanNotice name=\{card\.name\} \/>/);
  assert.match(read("src/components/QuickView.tsx"), /<BanNotice name=\{card\.name\} compact \/>/);
  const notice = code("src/components/BanNotice.tsx");
  assert.match(notice, /href=\{BANLIST_HREF\}/);
  assert.doesNotMatch(notice, /cookies|getCountry|prisma/, "safe in the ISR card tree and the client");
});

test("editDistance and the typo budget", () => {
  assert.equal(editDistance("jinx", "jinz"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.ok(editDistance("abc", "abcdefgh", 2) > 2, "bounded");
  assert.equal(typoBudget(3), 0);
  assert.equal(typoBudget(4), 1);
  assert.equal(typoBudget(7), 2);
});

test("didYouMean suggests near-miss names, closest first, never exact or far ones", () => {
  const names = ["Jinx, Loose Cannon", "Jinx, Demolitionist", "Vayne, Hunter", "Ahri, Inquisitive", "Kai'Sa, Survivor", "Ezreal, Prodigy"];
  assert.deepEqual(didYouMean("jinz", names).sort(), ["Jinx, Demolitionist", "Jinx, Loose Cannon"]);
  assert.deepEqual(didYouMean("vaybe", names), ["Vayne, Hunter"]);
  assert.deepEqual(didYouMean("kaisaa", names), ["Kai'Sa, Survivor"]);
  assert.deepEqual(didYouMean("zzzzzzz", names), []);
  assert.deepEqual(didYouMean("ab", names), [], "too short to guess");
  assert.ok(didYouMean("jinz", names, 1).length === 1);
});

test("the search route offers suggestions only on an empty result, from the cached catalogue", () => {
  const route = code("src/app/api/search/route.ts");
  assert.match(route, /if \(ranked\.length === 0 && sealed\.length === 0\) \{\s*const rows = await getPriceGuideRows\(\)/);
  assert.doesNotMatch(route, /unstable_cache/);
});

test("game results scroll into view and the shared author box uses the registry's words", () => {
  for (const g of ["HigherLower", "PriceCheck", "Zoomed", "Pairs", "SealedBid"]) {
    assert.match(read(`src/components/games/${g}.tsx`), /<ResultPanel\b/, g);
  }
  const article = read("src/components/ArticleView.tsx");
  assert.match(article, /data-author-box/);
  assert.match(article, /\{byline\.bio\[0\]\}/);
  assert.match(article, /\{ARTICLE_PROCESS\}/);
});
