import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getArticles, type Article } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// "Shop this guide" — placement and copy contract.
//
// The strip is an article's only in-content buy path, and three failure modes
// here are silent: each one still renders a page that looks fine.
//
//   1. MARKER/BODY DRIFT. The body-splitting regex in ArticleView carries two
//      capture groups and is read on a stride of 3. `shop` takes no index, so
//      its index group is optional — one stray character in that regex and every
//      [[embed:N]] gallery on the site shifts by a slot. The stride is asserted
//      directly rather than assumed.
//   2. A MARKER WITH NO ARRAY (or an array rendered twice). `[[shop]]` in a body
//      whose article has no `shop` array renders nothing and leaves a visible
//      hole mid-article; conversely, if ArticleView ever stops honouring
//      `shopPlaced`, positioned articles render the strip twice.
//   3. COPY THAT LIES. ArticleShopStrip swaps the eBay domain per market, so a
//      label naming a country is wrong for five of the six markets we serve.
//
// See ArticleView.tsx (`bodyParts` / `shopPlaced`) and lib/articles.ts ShopLink.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ALL: Article[] = [...getArticles("guide"), ...getArticles("blog")];
const SHOP_MARKER = /^\[\[shop(?::\d+)?\]\]$/m;

// The exact production regex. Kept in sync by the source assertion below, so
// this file can exercise the split without importing a server component.
const SPLIT = /^\[\[(embed|closeup|shop)(?::(\d+))?\]\]$/m;

test("ArticleView's split regex still accepts shop and keeps a stride of 3", () => {
  const src = read("src/components/ArticleView.tsx");
  assert.ok(
    src.includes(String.raw`/^\[\[(embed|closeup|shop)(?::(\d+))?\]\]$/m`),
    "ArticleView's body-split regex changed — update SPLIT here and re-check the stride",
  );

  const body = "a\n\n[[embed:0]]\n\nb\n\n[[shop]]\n\nc\n\n[[closeup:1]]\n\nd";
  const parts = body.split(SPLIT);

  // split() with two capture groups yields [text, kind, index, …] — the whole
  // render loop in ArticleView indexes on `i % 3`, so this is load-bearing.
  assert.equal(parts.length % 3, 1, "stride broke: parts.length must be 3n+1");
  assert.deepEqual(
    parts.filter((_, i) => i % 3 === 1),
    ["embed", "shop", "closeup"],
    "marker kinds must land on i % 3 === 1",
  );
  // `shop` carries no index; the optional group must come back undefined rather
  // than swallowing the next token.
  assert.deepEqual(parts.filter((_, i) => i % 3 === 2), ["0", undefined, "1"]);
});

test("adding shop to the regex did not shift any existing article's split", () => {
  // The pre-change regex. Every article WITHOUT a [[shop]] marker must split
  // byte-identically under both — that is what proves the change was additive.
  const legacy = /^\[\[(embed|closeup):(\d+)\]\]$/m;
  for (const a of ALL) {
    if (SHOP_MARKER.test(a.body)) continue;
    assert.deepEqual(
      a.body.split(new RegExp(legacy.source, "m")),
      a.body.split(new RegExp(SPLIT.source, "m")),
      `${a.slug}: body split changed under the new marker regex`,
    );
  }
});

test("every [[shop]] marker has a shop array to render", () => {
  for (const a of ALL) {
    if (!SHOP_MARKER.test(a.body)) continue;
    assert.ok(
      a.shop && a.shop.length > 0,
      `${a.slug}: has a [[shop]] marker but no shop array — renders a hole mid-article`,
    );
  }
});

test("a body never carries more than one shop marker", () => {
  for (const a of ALL) {
    const n = (a.body.match(/^\[\[shop(?::\d+)?\]\]$/gm) ?? []).length;
    assert.ok(n <= 1, `${a.slug}: ${n} shop markers — the strip would render ${n} times`);
  }
});

test("ArticleView renders the default strip only when the body did not place one", () => {
  const src = read("src/components/ArticleView.tsx");
  assert.match(
    src,
    /\{!shopPlaced && article\.shop && article\.shop\.length > 0 && <ArticleShopStrip/,
    "the tail ArticleShopStrip must be gated on !shopPlaced or positioned articles render it twice",
  );
  // Placement: the strip must sit ABOVE the FAQ. Comparing indices rather than
  // line numbers so ordinary edits above don't break the test.
  const shopAt = src.indexOf("!shopPlaced && article.shop");
  const faqAt = src.indexOf("!bodyHasFaqSection && <ArticleFaq");
  assert.ok(shopAt > 0 && faqAt > 0, "could not locate both blocks");
  assert.ok(
    shopAt < faqAt,
    "ArticleShopStrip must render above ArticleFaq — under a long accordion the buy path goes unseen",
  );
});

test("no shop label names a country", () => {
  // ArticleShopStrip localises the eBay domain (AU, US, UK, SG), so a
  // label naming one market is wrong for the rest.
  const country = /\b(UK|USA|Australia|Australian|Britain|British|Canada|Canadian|Singapore|America|American)\b/;
  for (const a of ALL) {
    for (const s of a.shop ?? []) {
      assert.ok(!country.test(s.label), `${a.slug}: shop label names a country — "${s.label}"`);
    }
  }
});

test("shop strips stay within 1–4 links and carry a non-empty query", () => {
  for (const a of ALL) {
    if (!a.shop) continue;
    assert.ok(
      a.shop.length >= 1 && a.shop.length <= 4,
      `${a.slug}: ${a.shop.length} shop links — past 4 the strip reads as a link farm`,
    );
    for (const s of a.shop) {
      assert.ok(s.label.trim().length > 0, `${a.slug}: empty shop label`);
      assert.ok(s.query.trim().length > 0, `${a.slug}: empty shop query for "${s.label}"`);
    }
  }
});

test("the highest-intent guides all carry a buy path", () => {
  // These are the transactional guides — a reader arriving on one has already
  // decided to spend money. Regressing any of them back to zero monetisation is
  // the exact failure this whole change set exists to fix, so it is pinned.
  const MUST_MONETISE = [
    "budget-riftbound-decks",
    "where-to-buy-riftbound-cards",
    "cheapest-riftbound-booster-boxes",
    "most-valuable-riftbound-cards",
    "riftbound-singles-vs-sealed",
    "riftbound-booster-box-ev-worth-ripping-or-buying-singles",
  ];
  const bySlug = new Map(ALL.map((a) => [a.slug, a]));
  for (const slug of MUST_MONETISE) {
    const a = bySlug.get(slug);
    assert.ok(a, `${slug}: article no longer exists — update MUST_MONETISE`);
    assert.ok(
      (a.shop && a.shop.length > 0) || a.ebayPicks,
      `${slug}: transactional guide with no eBay buy path`,
    );
  }
});
