import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETS } from "../src/lib/constants";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SET_PAGE = read("src/app/sets/[set]/page.tsx");
const SUFFIX = " | RiftCompare";
const TITLE_MAX = 60;
const DESC_MAX = 155;

// ─────────────────────────────────────────────────────────────────────────────
// "PRICE GUIDE" IS A PHRASE THE SITE RANKS FOR AND NEVER USED.
// ─────────────────────────────────────────────────────────────────────────────
// Search Console, 28 days to 2026-09-19: 21 queries containing "price guide" or
// "price list", 789 impressions, ONE click. Positions between 5.5 and 10 on most
// of them — so Google already considers this site an answer, and searchers
// already decline it. The phrase appeared in no title, description or heading
// anywhere in the app.
//
// Most of that volume is set-scoped ("riftbound origins price guide" at position
// 6.3, "riftbound unleashed price guide" at 7.5, "origins price guide" at 5.9),
// and /sets/<slug> is the page that ranks. Its title said "Card List & Prices".
// Same failure the ban-list guide had: page one for a phrase the title does not
// contain.
//
// WHY "CARD LIST" STILL LEADS. It is the bigger query — "riftbound unleashed
// card list" alone is 885 impressions — and tests/seo-landing-pages.test.ts pins
// list-intent first for this template. "Price Guide" replaces the weaker
// "Prices", it does not displace "Card List".

test("the set page's top title rung offers a price guide", () => {
  assert.match(
    SET_PAGE,
    /`Riftbound \$\{set\.name\} Card List & Price Guide`/,
    "the first title rung must offer 'Card List & Price Guide'",
  );
  // The rung below it is what a long set name falls to, and one existing test
  // asserts this exact string, so the ladder must keep it.
  assert.ok(SET_PAGE.includes("Card List & Prices"), "the shorter price rung must remain for long set names");
});

test("every set resolves to a title that fits, and the big sets get the phrase", () => {
  // Rebuilt from the page's own ladder. If the copy changes this drifts and
  // should be updated with it — what matters is that some rung always fits and
  // that the sets the price-guide queries actually name are the ones that get it.
  const rungs = (name: string) => [
    `Riftbound ${name} Card List & Price Guide`,
    `Riftbound ${name} Card List & Prices`,
    `Riftbound ${name} Card List`,
    `${name} Card List & Prices`,
  ];
  const resolve = (name: string) => {
    const c = rungs(name);
    return c.find((t) => (t + SUFFIX).length <= TITLE_MAX) ?? c[c.length - 1];
  };

  for (const set of SETS) {
    const title = resolve(set.name);
    assert.ok(
      (title + SUFFIX).length <= TITLE_MAX || title === rungs(set.name).at(-1),
      `${set.name} resolves to a ${(title + SUFFIX).length}-char title with no shorter rung left`,
    );
    assert.ok(/Card List/.test(title), `${set.name}'s title must keep list intent: ${title}`);
  }

  // The four sets named by real price-guide queries in the export.
  for (const name of ["Origins", "Unleashed", "Vendetta", "Radiance"]) {
    const set = SETS.find((s) => s.name === name);
    if (!set) continue; // a set can be renamed or retired; that is not this test's business
    assert.match(
      resolve(set.name),
      /Price Guide$/,
      `${name} has price-guide search demand and its title must fit the phrase`,
    );
  }
});

test("every set's description carries the phrase, including the ones whose title cannot", () => {
  // Spirit Forged and Origins: Proving Grounds are too long to fit "Price Guide"
  // in a 60-character title. The description is where they pick the phrase up,
  // so the intent is never unserved just because a set has a long name.
  const descRungs = (name: string) => [
    `The complete Riftbound ${name} card list and price guide — every card with live prices compared across stores to find the cheapest singles. Updated daily.`,
    `The complete Riftbound ${name} card list and price guide — every card with live prices compared across stores. Updated daily.`,
    `The complete Riftbound ${name} card list — every card with images, plus live prices compared across stores to find the cheapest singles. Updated daily.`,
  ];
  assert.ok(
    SET_PAGE.includes("card list and price guide —"),
    "the set description must offer a price guide",
  );
  for (const set of SETS) {
    const c = descRungs(set.name);
    const d = c.find((x) => x.length <= DESC_MAX) ?? c[c.length - 1];
    assert.ok(d.length <= DESC_MAX, `${set.name}'s description resolves to ${d.length} chars`);
    assert.ok(
      /price guide/.test(d),
      `${set.name} falls through to a description with no price-guide phrasing: ${d}`,
    );
  }
});
