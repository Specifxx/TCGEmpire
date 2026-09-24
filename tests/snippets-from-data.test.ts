import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNED_CARDS, BANLIST_UPDATED, BANLIST_SLUG, banDate } from "../src/lib/banlist";
import { mostExpensiveTitle } from "../src/lib/most-expensive-title";
import { getArticle } from "../src/lib/articles";
import { NAV_GROUPS } from "../src/components/nav-groups";

// Section 3 of the 2026-09-24 brief — DECISIONS.md, "Search snippets: answers
// in the title, from data".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("ban list: title, count, date and ItemList all come from lib/banlist.ts", () => {
  const a = getArticle(BANLIST_SLUG)!;
  assert.equal(a.updated, BANLIST_UPDATED, "dateModified is the last wave's date");
  assert.equal(a.title, `Riftbound Ban List (Sep 2026): ${BANNED_CARDS.length} Banned Cards`);
  assert.ok(`${a.title} — RiftCompare`.length <= 60);
  assert.equal(a.itemList?.items.length, BANNED_CARDS.length);
  assert.equal(BANNED_CARDS.length, 13);
  assert.equal(BANNED_CARDS.filter((b) => b.formats.includes("Standard")).length, 12);
  assert.deepEqual(BANNED_CARDS.filter((b) => !b.formats.includes("Standard")).map((b) => b.name), ["Master Yi, Wuju Bladesman"]);
  // Every table row is also an embed on the page, so it resolves to a real card.
  const embedded = new Set((a.embeds ?? []).flatMap((e) => e.slugs));
  for (const b of BANNED_CARDS) assert.ok(embedded.has(b.slug), b.slug);
  assert.match(banDate("2026-09-15"), /^15 Sept? 2026$/, "ICU spells the month Sep or Sept");
});

test("ban list: the table is the first thing under the H1, and the nav links it", () => {
  const view = read("src/components/ArticleView.tsx");
  const h1 = view.indexOf("<h1 ");
  const table = view.indexOf("<BanListTable />");
  assert.ok(h1 > 0 && table > h1, "after the H1");
  for (const later of ["<ArticleShare", "article.hero && (", "<AnswerBox"]) {
    assert.ok(table < view.indexOf(later), `before ${later}`);
  }
  const db = NAV_GROUPS.find((g) => g.title === "The card database")!;
  assert.ok(db.links.some((l) => l.href === `/guides/${BANLIST_SLUG}` && l.label === "Ban list"));
  assert.match(read("src/components/BanListTable.tsx"), /Updated \{banDate\(BANLIST_UPDATED\)\} · \{BANNED_CARDS\.length\} cards banned/);
});

test("most expensive: month, #1 card and price in the title, under 60 characters", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(
    mostExpensiveTitle({ name: "Ahri, Nine-Tailed Fox", priceCents: 125_000 }, now),
    "Most Expensive Riftbound Cards (Sep 2026): #1 Ahri US$1,250",
  );
  for (const name of ["Baron Nashor", "Kennen, Heart of the Tempest", "Diana, Scorn of the Moon"]) {
    const t = mostExpensiveTitle({ name, priceCents: 1_234_500 }, now);
    assert.ok(t.length <= 60, t);
    assert.match(t, /Sep 2026/);
    assert.match(t, /US\$12,345/);
  }
  assert.equal(mostExpensiveTitle(null, now), "Most Expensive Riftbound Cards (Sep 2026) — RiftCompare");
  assert.match(read("src/app/blog/[slug]/page.tsx"), /mostExpensiveTitle\(await topMostExpensive\(\)\)/);
});

test("card size: the answer leads the title, the description and the first sentence", () => {
  const a = getArticle("riftbound-card-size-sleeves-deck-boxes")!;
  assert.match(a.title, /63 × 88 mm/);
  assert.ok(`${a.title} — RiftCompare`.length <= 60);
  assert.match(a.excerpt, /^Riftbound cards are 63 × 88 mm/);
  assert.match(a.body, /^Riftbound cards are \*\*63 × 88 mm\*\*/);
  assert.equal(a.updated, "2026-09-24");
});

test("set pages: 'Card List: All N Cards + Prices' leads, and the grid is not pushed below the intro", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  assert.match(src, /`Riftbound \$\{set\.name\} Card List: All \$\{cardCount\} Cards \+ Prices`/);
  for (const [name, n] of [["Unleashed", 219], ["Origins", 298], ["Vendetta", 166], ["Spiritforged", 221]] as const) {
    assert.ok(`Riftbound ${name} Card List: All ${n} Cards + Prices`.length <= 60, name);
  }
  const grid = src.indexOf("{totalInSet === 0 ? (");
  const intro = src.indexOf("{intro.length > 0 && (");
  assert.ok(grid > 0 && intro > grid, "the data-derived intro renders under the grid");
});
