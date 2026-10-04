import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSealedForSearch, matchSealedGroups, sealedSearchTokens } from "../src/lib/sealed-search";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04, owner: "if I search origins and I click enter, there's no sealed
// products found … the search bar should work for sealed products as well … and
// sealed products should also use the quick view open." One matcher
// (lib/sealed-search.ts) serves the navbar dropdown and the /browse results, and
// a sealed result opens the sealed quick view where a card result opens its own.
// ─────────────────────────────────────────────────────────────────────────────

const G = (name: string, productType: string, setCode: string | null) => ({ name, productType, setCode });
const CATALOG = [
  G("Spirit Forged Booster Box", "Booster Box", "SFD"),
  G("Origins Booster Box", "Booster Box", "OGN"),
  G("Origins Booster Pack", "Booster Pack", "OGN"),
  G("Origins Bundle", "Bundle", "OGN"),
  G("Proving Grounds Kit", "Proving Grounds", "OGS"),
  G("Riftbound Booster Box (OGN)", "Booster Box", "OGN"),
  G("Mystery Box", "Booster Box", null),
];
const names = (q: string) => matchSealedGroups(CATALOG, q).map((g) => g.name);

test("a set name finds that set's sealed products, whatever the product is called", () => {
  const found = names("origins");
  assert.ok(found.includes("Origins Booster Box"));
  assert.ok(found.includes("Origins Booster Pack"));
  assert.ok(found.includes("Origins Bundle"));
  // Listed under its code only: still an Origins product (the set's own name).
  assert.ok(found.includes("Riftbound Booster Box (OGN)"));
  // "Origins: Proving Grounds" is a set whose name contains the word.
  assert.ok(found.includes("Proving Grounds Kit"));
  assert.ok(!found.includes("Spirit Forged Booster Box"));
  assert.ok(!found.includes("Mystery Box"));
});

test("every word must match, in any order, and plurals and punctuation do not decide it", () => {
  assert.deepEqual(names("origins booster box"), ["Origins Booster Box", "Riftbound Booster Box (OGN)"]);
  assert.deepEqual(names("booster box origins"), ["Origins Booster Box", "Riftbound Booster Box (OGN)"]);
  assert.ok(names("booster boxes").includes("Spirit Forged Booster Box"), "boxes -> box");
  assert.ok(names("Origins Booster-Pack").includes("Origins Booster Pack"), "punctuation is not a letter");
  assert.ok(names("ORIGINS: BUNDLES").includes("Origins Bundle"), "case, colon and plural");
  assert.deepEqual(names("origins booster akali"), [], "one word that matches nothing rules a product out");
});

test("no query, or nothing sealed in it, matches nothing", () => {
  assert.deepEqual(matchSealedGroups(CATALOG, ""), []);
  assert.deepEqual(matchSealedGroups(CATALOG, "  ,, "), []);
  assert.deepEqual(names("akali"), []);
  assert.deepEqual(sealedSearchTokens("Booster Boxes"), ["booster", "box"]);
});

test("the whole phrase in the name ranks first; the caller's own order is kept within a rank", () => {
  // "Origins Booster Box" has the phrase in its name; "Riftbound Booster Box
  // (OGN)" has the words only through the set's name. Both come back, phrase first,
  // even though the second sits earlier in the input.
  const reordered = [CATALOG[5], CATALOG[1]];
  assert.deepEqual(matchSealedGroups(reordered, "origins booster box").map((g) => g.name), ["Origins Booster Box", "Riftbound Booster Box (OGN)"]);
  // Same rank: input order.
  assert.deepEqual(names("origins").slice(0, 3), ["Origins Booster Box", "Origins Booster Pack", "Origins Bundle"]);
});

test("a market with no sealed rows falls back to the default market, and says which one it priced in", async () => {
  const calls: string[] = [];
  const load = async (c: string) => {
    calls.push(c);
    return c === "US" ? [{ id: 1 }] : [];
  };
  // UK has none -> the US rows, priced in the US.
  const uk = await loadSealedForSearch("UK", load as never);
  assert.deepEqual(uk, { groups: [{ id: 1 }], priceCountry: "US" });
  assert.deepEqual(calls, ["UK", "US"]);
  // The default market is read once, never retried against itself.
  calls.length = 0;
  const us = await loadSealedForSearch("US", (async (c: string) => (calls.push(c), [])) as never);
  assert.deepEqual(us, { groups: [], priceCountry: "US" });
  assert.deepEqual(calls, ["US"]);
});

// ── The three surfaces ───────────────────────────────────────────────────────

test("/api/search uses the shared matcher and sends the whole group, in a stated currency", () => {
  const route = code("src/app/api/search/route.ts");
  assert.match(route, /matchSealedGroups\(sealedRead\.groups, q\)\.slice\(0, 4\)/);
  assert.match(route, /loadSealedForSearch\(country, getSealedGroups\)/);
  assert.match(route, /sealedCurrency/);
  // Not the old substring filter and not a trimmed projection: the quick view
  // needs every listing, so the group goes out whole.
  assert.doesNotMatch(route, /\.includes\(ql\)/);
  assert.doesNotMatch(route, /lowestPriceCents: g\.lowestPriceCents,\s*\}\)\)/);
  // Still no cache wrapped around the self-caching loader (egress rule 6).
  assert.doesNotMatch(route, /unstable_cache/);
});

test("a sealed row in the dropdown opens the sealed quick view instead of navigating", () => {
  const bar = code("src/components/SearchBar.tsx");
  assert.match(bar, /import \{ useSealedQuickView \} from "\.\/SealedQuickView"/);
  assert.match(bar, /openSealedQuickView\(s, sealedCurrency \?\? countryCurrency\)/);
  // Plain click and keyboard Enter go through activateSealed; a modifier click
  // keeps the row's real /sealed link for a new tab.
  assert.match(bar, /activateSealed\(s, idx \+ 1, false\)/);
  assert.match(bar, /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) \{\s*trackEvent\("search_suggestion_selected", \{ suggestion_rank: idx \+ 1, result_type: "sealed"/);
  const fn = bar.slice(bar.indexOf("function activateSealed"), bar.indexOf("function commitSearch"));
  assert.doesNotMatch(fn, /router\.push/, "activating a sealed result no longer leaves the page");
  assert.match(fn, /window\.open\(`\/sealed\?q=\$\{encodeURIComponent\(s\.name\)\}`, "_blank", "noopener"\)/);
  // Prices are in the sealed read's own currency, not the visitor's market's.
  assert.match(bar, /formatMoney\(s\.lowestPriceCents, sealedCurrency \?\? countryCurrency\)/);
});

test("/browse?q= lists the matching sealed products above the cards, each opening the sealed quick view", () => {
  const page = code("src/app/browse/page.tsx");
  // Only a plain text search's first page; never under a card-only filter.
  assert.match(page, /const wantsSealed = q\.length >= 2 && page === 1 && CARD_ONLY_FILTERS\.every\(\(k\) => !searchParams\[k\]\)/);
  for (const k of ["rarity", "domain", "printing", "set", "priced", "min", "max"]) {
    assert.match(page, new RegExp(`"${k}"`), `${k} is a card-only filter`);
  }
  assert.match(page, /loadSealedForSearch\(country, getSealedGroups\)\.catch\(\(\) => null\)/, "a failed read only drops the section");
  assert.match(page, /matchSealedGroups\(sealedRead\.groups, q\)/);
  assert.match(page, /<SealedTile[\s\S]{0,200}currency=\{sealedCurrency\}[\s\S]{0,120}soldOutEverywhere=\{soldOutEverywhere\(g\.listings\)\}/);
  // The sealed read happens at page level, never inside the default view's cache.
  const cacheCall = page.slice(page.indexOf("unstable_cache(runQuery"), page.indexOf("unstable_cache(runQuery") + 200);
  assert.doesNotMatch(cacheCall, /getSealedGroups/);
  // The count line, the compact eBay CTA and the empty state all know about sealed.
  assert.match(page, /sealedMatches\.length > 0 &&/);
  assert.match(page, /q && hasResults && \(\s*<EbayBuyCta query=\{q\} freeText compact/);
  assert.match(page, /total === 0 && sealedMatches\.length > 0 \?/);
  assert.match(page, /q && !hasResults && \(\s*<EbayBuyCta query=\{q\} freeText source="browse-no-results"/);
  // The sealed quick view's provider is global, so a tile opens it from here.
  assert.match(read("src/app/layout.tsx"), /<SealedQuickViewProvider>/);
});
