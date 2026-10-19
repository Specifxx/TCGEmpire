import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { CountryProvider } from "../src/components/CountryProvider";
import { Filters } from "../src/components/Filters";
import { SealedFilters } from "../src/components/SealedFilters";
import { applyKeyword, clearedFilters, hrefWith, KEPT_ON_CLEAR, KEYWORD_MAX } from "../src/lib/filter-params";
import { buildCardWhere } from "../src/lib/cards";

// ─────────────────────────────────────────────────────────────────────────────
// A KEYWORD BOX INSIDE THE FILTER PANELS (2026-10-19, owner: "when you have the
// filters, there should be a search bar in the filters as well … so you don't
// need to use the search bar at the top of the website"). The header search
// sends /browse?q= ALONE, dropping every ticked filter; the panel's box writes
// the same `q` and keeps them. This file pins:
//   • the URL it writes (lib/filter-params.ts): trimmed q, everything else
//     kept, page back to 1; "Clear" keeps the search and the order;
//   • that each panel draws the box (and /price-guide, whose toolbar already
//     searches, does not), with the right label, type and placeholder;
//   • that it is applied on Enter or the button, never per keystroke, and is
//     the same metered `q` on /browse, not a way around the allowance;
//   • that every page carrying a panel reads `q` on the server.
// ─────────────────────────────────────────────────────────────────────────────

// tsx compiles JSX with the classic runtime (React.createElement), as in
// tests/ebay-clicks-funnel.test.ts.
(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source without comments, so a regex below matches code, not prose about it. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const router = {
  push() {},
  replace() {},
  refresh() {},
  prefetch() {},
  back() {},
  forward() {},
};

/** Render a client panel the way the App Router would on the server, with this URL. */
function render(el: ReactElement, path: string, qs = ""): string {
  return renderToStaticMarkup(
    h(
      AppRouterContext.Provider,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { value: router as any },
      h(
        PathnameContext.Provider,
        { value: path },
        h(SearchParamsContext.Provider, { value: new URLSearchParams(qs) }, h(CountryProvider, { initial: "US", children: el })),
      ),
    ),
  );
}

const searchForm = (html: string) => html.match(/<form[^>]*role="search"[\s\S]*?<\/form>/)?.[0] ?? "";
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];

// ── The URL it writes ────────────────────────────────────────────────────────

test("the keyword sets a trimmed q, keeps every other filter and the order, and starts again at page 1", () => {
  const p = new URLSearchParams("set=OGN,SFD&rarity=Epic&variant=alt&min=5&sort=price_asc&size=60&market=UK&page=4");
  applyKeyword(p, "  jinx  ");
  assert.equal(p.get("q"), "jinx");
  assert.equal(p.get("page"), null, "a new search starts at page 1");
  for (const [k, v] of [["set", "OGN,SFD"], ["rarity", "Epic"], ["variant", "alt"], ["min", "5"], ["sort", "price_asc"], ["size", "60"], ["market", "UK"]]) {
    assert.equal(p.get(k), v, `${k} survives the search`);
  }
});

test("an empty or blank keyword removes q; replacing one keeps a single q", () => {
  const p = new URLSearchParams("q=jinx&type=Unit&page=2");
  applyKeyword(p, "   ");
  assert.equal(p.toString(), "type=Unit");
  const r = new URLSearchParams("q=jinx&type=Unit");
  applyKeyword(r, "ahri");
  assert.deepEqual(r.getAll("q"), ["ahri"]);
  assert.equal(hrefWith("/browse", new URLSearchParams()), "/browse", "no dangling ?");
  assert.equal(hrefWith("/sets/origins", r), "/sets/origins?q=ahri&type=Unit");
});

test("Clear keeps the search and the order, and nothing else, in both panels and the chip row", () => {
  assert.deepEqual([...KEPT_ON_CLEAR], ["q", "sort"]);
  assert.equal(clearedFilters("q=jinx&set=OGN&rarity=Epic&min=1&max=9&priced=1&sort=price_desc&page=3").toString(), "q=jinx&sort=price_desc");
  assert.equal(clearedFilters("set=OGN&instock=1&atmsrp=1").toString(), "");
  for (const f of ["src/components/Filters.tsx", "src/components/SealedFilters.tsx", "src/components/ActiveFilters.tsx"]) {
    assert.match(code(f), /clearedFilters\((optimistic|params\.toString\(\))\)/, `${f} clears through the shared rule`);
  }
  // The card panel pushed the bare path, dropping a search, until this change.
  assert.doesNotMatch(code("src/components/Filters.tsx"), /setOptimistic\(""\)/);
});

test("q is the search, not a facet: no chip, and not in the panels' Clear count", () => {
  assert.doesNotMatch(code("src/components/ActiveFilters.tsx"), /key: "q"/);
  for (const f of ["src/components/Filters.tsx", "src/components/SealedFilters.tsx"]) {
    const count = code(f).match(/const activeCount =[\s\S]*?;\n/)?.[0] ?? "";
    assert.ok(count, f);
    assert.doesNotMatch(count, /"q"/, `${f} counts filters, not the search`);
  }
});

// ── The box in each panel ────────────────────────────────────────────────────

test("the card panel draws a labelled search box at the top, prefilled from q, with Clear only while a search is on", () => {
  const html = render(h(Filters, { currency: "USD" }), "/browse", "q=jinx&rarity=Epic");
  const form = searchForm(html);
  assert.ok(form, "a role=search form in the panel");
  assert.equal(attr(form, "action"), "/browse", "without JavaScript it is a plain GET search of the same page");
  assert.match(form, /<label[^>]*for="filters-q"[^>]*>Search<\/label>/);
  const input = form.match(/<input[^>]*>/)?.[0] ?? "";
  assert.equal(attr(input, "id"), "filters-q");
  assert.equal(attr(input, "type"), "search");
  assert.equal(attr(input, "name"), "q");
  assert.equal(attr(input, "enterKeyHint"), "search");
  assert.equal(attr(input, "class"), "input", "the panel's own input style");
  assert.equal(attr(input, "value"), "jinx");
  assert.equal(attr(input, "maxLength"), String(KEYWORD_MAX));
  // buildCardWhere matches name and collector number, never a set name or rules text.
  assert.equal(attr(input, "placeholder"), "Card name or number…");
  assert.match(form, /<button type="submit"[^>]*>Search<\/button>/);
  assert.match(form, /aria-label="Clear the search"/);
  // At the top: before the first facet.
  assert.ok(html.indexOf('role="search"') < html.indexOf("Price (USD)"), "the box sits above the facets");

  const none = searchForm(render(h(Filters, { currency: "USD" }), "/browse", "rarity=Epic"));
  assert.equal(attr(none.match(/<input[^>]*>/)?.[0] ?? "", "value"), "");
  assert.doesNotMatch(none, /Clear the search/, "nothing to clear without a search");
});

test("the card panel's box posts to the panel's own page (a set page searches that set)", () => {
  const html = render(h(Filters, { basePath: "/sets/origins", hideSet: true, currency: "USD" }), "/sets/origins", "q=jinx");
  assert.equal(attr(searchForm(html), "action"), "/sets/origins");
});

test("search={false} leaves the box out (the price guide, whose toolbar already searches the same q)", () => {
  const html = render(h(Filters, { basePath: "/price-guide", currency: "USD", search: false }), "/price-guide", "q=jinx");
  assert.equal(searchForm(html), "");
  assert.doesNotMatch(html, /filters-q/);
  assert.match(read("src/app/price-guide/page.tsx"), /<Filters basePath=\{PRICE_GUIDE_PATH\}[^>]*search=\{false\}/);
  assert.match(read("src/components/price-guide/PriceGuideToolbar.tsx"), /id="price-guide-q"/, "the guide's own box is still there");
});

test("the sealed panel draws the same box on /sealed and /pokemon/sealed, worded for products", () => {
  for (const basePath of ["/sealed", "/pokemon/sealed"]) {
    const html = render(
      h(SealedFilters, { types: ["Booster Box"], sets: [{ code: "OGN", name: "OGN" }], currency: "USD", basePath }),
      basePath,
      "q=booster&type=Booster%20Box",
    );
    const form = searchForm(html);
    assert.ok(form, basePath);
    assert.equal(attr(form, "action"), basePath);
    assert.match(form, /<label[^>]*for="sealed-filters-q"[^>]*>Search<\/label>/);
    const input = form.match(/<input[^>]*>/)?.[0] ?? "";
    assert.equal(attr(input, "type"), "search");
    assert.equal(attr(input, "enterKeyHint"), "search");
    assert.equal(attr(input, "class"), "input");
    assert.equal(attr(input, "value"), "booster");
    assert.equal(attr(input, "placeholder"), "Product name…");
    assert.ok(html.indexOf('role="search"') < html.indexOf("Price (USD)"), `${basePath}: above the facets`);
  }
});

test("every page with a card or sealed panel shows the box, except the price guide", () => {
  for (const f of ["src/app/browse/page.tsx", "src/app/sets/[set]/page.tsx"]) {
    const tag = read(f).match(/<Filters\b[^>]*\/>/)?.[0] ?? "";
    assert.ok(tag, f);
    assert.doesNotMatch(tag, /search=\{false\}/, f);
  }
  for (const f of ["src/app/sealed/page.tsx", "src/app/pokemon/sealed/page.tsx"]) assert.match(read(f), /<SealedFilters\b/, f);
});

// ── Applied on submit, and metered like any other /browse search ─────────────

test("the box applies on Enter or its button, never per keystroke", () => {
  const box = code("src/components/FilterSearch.tsx");
  assert.match(box, /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*apply\(text\);/);
  assert.match(box, /onChange=\{\(e\) => setText\(e\.target\.value\)\}/, "typing only edits the field");
  assert.doesNotMatch(box, /setTimeout|debounce|onBlur|fetch\(|router/, "no navigation, request or timer per keystroke");
  assert.match(box, /if \(next\.trim\(\) !== current\) onApply\(next\)/, "the same words again do not re-render the page");
  // It follows the URL's q (header search, back/forward) without clobbering typing on other navigations.
  assert.match(box, /useEffect\(\(\) => setText\(current\), \[current\]\)/);
  assert.match(code("src/components/Filters.tsx"), /current=\{sp\.get\("q"\) \?\? ""\}/);
  assert.match(code("src/components/SealedFilters.tsx"), /current=\{sp\.get\("q"\) \?\? ""\}/);
});

test("on /browse the panel's q is the same metered search as the header's: the page meters q whatever wrote it", () => {
  // The panels only write the URL; neither talks to the search API or the meter.
  for (const f of ["src/components/Filters.tsx", "src/components/SealedFilters.tsx", "src/components/FilterSearch.tsx"]) {
    assert.doesNotMatch(code(f), /search-quota|\/api\/search/, `${f} must not meter (or skip metering) on its own`);
  }
  assert.match(code("src/components/Filters.tsx"), /onApply=\{\(text\) => update\(\(p\) => applyKeyword\(p, text\), "search"\)\}/);
  assert.match(code("src/components/Filters.tsx"), /basePath = "\/browse"/);
  // /browse meters a first-page q before querying and counts it from the client
  // (tests/search-limits.test.ts pins the order); applyKeyword always lands on page 1.
  const page = read("src/app/browse/page.tsx");
  assert.match(page, /const searchQ = \(searchParams\.q \?\? ""\)\.trim\(\);/);
  assert.match(page, /searchQ\.length >= 2 && page === 1 \? await quotaContext\(\)/);
  assert.match(page, /\{quota\?\.metered && <SearchQuotaTick q=\{searchQ\} \/>\}/);
});

// ── Every page with a panel filters by q on the server ───────────────────────

test("/browse and /sets/[set] answer q through buildCardWhere, ANDed with the ticked filters", () => {
  type W = { OR?: { nameNormalized?: { contains: string }; collectorNumber?: { contains: string } }[]; rarity?: unknown; setCode?: unknown };
  const w = buildCardWhere({ q: "Jinx", rarity: "Epic" }, "US") as W;
  assert.deepEqual(w.rarity, { in: ["Epic"] });
  assert.ok(w.OR?.some((c) => c.nameNormalized?.contains === "jinx"), "name");
  assert.ok(w.OR?.some((c) => c.collectorNumber?.contains === "Jinx"), "collector number");
  // The set page pins its own set over anything the words imply ("crystal rose" names Vendetta).
  const page = read("src/app/sets/[set]/page.tsx");
  assert.match(page, /const where = \{ \.\.\.buildCardWhere\(searchParams, country\), setCode: set\.code \};/);
  const scoped = { ...(buildCardWhere({ q: "crystal rose jinx" }, "US") as W), setCode: "OGN" };
  assert.equal(scoped.setCode, "OGN");
  // A searched set view says what it was searched for, and stays noindex like any filtered view.
  assert.match(page, /\{searchQ && \(\s*<> for <span className="text-brand-400">“\{searchQ\}”<\/span><\/>/);
  assert.match(page, /const filtered = !isCleanPagination\(searchParams\);/);
  // A set page is never metered (tests/search-limits.test.ts).
  assert.doesNotMatch(page, /search-quota/);
});

test("/sealed filters its already-loaded groups by q in memory: no new query, no new cache", () => {
  const page = code("src/app/sealed/page.tsx");
  assert.match(page, /const q = one\(searchParams\.q\)\.trim\(\);/);
  assert.match(page, /g\.name\.toLowerCase\(\)\.includes\(ql\) \|\|\s*g\.productType\.toLowerCase\(\)\.includes\(ql\) \|\|\s*\(g\.setCode \?\? ""\)\.toLowerCase\(\)\.includes\(ql\)/);
  assert.equal((page.match(/getSealedGroups\(/g) ?? []).length, 2, "the market read and its default-market fallback, as before");
  assert.doesNotMatch(page, /unstable_cache|prisma/);
  // /pokemon/sealed reads q through parseBrowse and filterTiles (tests/pokemon-board.test.ts).
  assert.match(read("src/app/pokemon/sealed/page.tsx"), /sortTiles\(filterTiles\(all, query\), query\.sort\)/);
});
