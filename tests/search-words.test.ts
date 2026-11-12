import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchGuides, searchWords } from "../src/lib/search-words";
import { buildCardWhere } from "../src/lib/cards";
import { getArticles } from "../src/lib/articles";

// DECISIONS.md, "Search: words in any order, and guides when no card matches" (2026-11-12).
// The queries are the real ones from the site's search_no_results events.

test("the words that carry meaning: no stop words, no punctuation, no repeats", () => {
  assert.deepEqual(searchWords("Blade of the Exile"), ["blade", "exile"]);
  assert.deepEqual(searchWords("blade of exile"), ["blade", "exile"]);
  assert.deepEqual(searchWords("K/DA"), ["kda"]);
  assert.deepEqual(searchWords("Kai'Sa kai'sa"), ["kaisa"]);
  assert.deepEqual(searchWords("a of the"), []);
});

test("a name of two words or more also matches word by word, and never loses the whole-phrase match", () => {
  const where = buildCardWhere({ q: "blade of exile" }, "US");
  const or = where.OR as Record<string, unknown>[];
  assert.deepEqual(or[0], { nameNormalized: { contains: "bladeofexile" } }, "the typed phrase is still the first alternative");
  assert.ok(
    or.some((c) => JSON.stringify(c) === JSON.stringify({ AND: [{ nameNormalized: { contains: "blade" } }, { nameNormalized: { contains: "exile" } }] })),
    "and every word, in any order, is another",
  );
  const one = buildCardWhere({ q: "jinx" }, "US").OR as Record<string, unknown>[];
  assert.ok(!one.some((c) => "AND" in c), "one word adds nothing: the substring match already covers it");
});

test("a search that names no card finds the guide about it", () => {
  const articles = getArticles();
  const kda = matchGuides("kda", articles);
  assert.ok(kda.some((g) => g.href === "/blog/riftbound-kda-couture-collection-worlds-2026-edition" || g.href === "/guides/riftbound-kda-couture-collection-worlds-2026-edition"), JSON.stringify(kda));
  assert.ok(matchGuides("K/DA couture", articles).length >= 1);
  assert.ok(matchGuides("legacy", articles).length >= 1);
  assert.ok(matchGuides("legacy", articles).length <= 3);
  assert.deepEqual(matchGuides("zzzqqq", articles), []);
  assert.deepEqual(matchGuides("of", articles), []);
  for (const g of matchGuides("legacy", articles)) assert.match(g.href, /^\/(blog|guides)\/[a-z0-9-]+$/);
});

test("drafts never surface, and the route only looks for guides when nothing else matched", () => {
  const hits = matchGuides("secret plan", [{ slug: "secret-plan", category: "blog", title: "Secret plan", date: "2026-11-01" }]);
  assert.equal(hits.length, 1);
  const route = readFileSync("src/app/api/search/route.ts", "utf8");
  assert.match(route, /matchGuides\(q, getArticles\(\)\)/, "getArticles is the published list (drafts filtered at the source)");
  const empty = route.slice(route.indexOf("if (ranked.length === 0 && sealed.length === 0)"));
  assert.ok(empty.indexOf("matchGuides") > 0 && empty.indexOf("matchGuides") < empty.indexOf("return NextResponse.json"));
});
