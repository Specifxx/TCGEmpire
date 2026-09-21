import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// /cards/all — the flat HTML index of every card page.
//
// Asked for directly: "maybe make a page or sitemap contain every single card
// page so I can index them on google search." The SITEMAP half already existed
// and was already complete (1,431 URLs in cards.xml, verified live); the HTML
// half did not. These tests pin the two things most likely to go wrong with a
// page whose whole job is to render the entire catalogue: its egress cost, and
// its own indexability.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Comments out, code in — line comments FIRST (see tests/card-type-seo.test.ts
// for the 58KB-swallowing reason), with the `[^:]` guard keeping "https://".
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const PAGE = "src/app/cards/all/page.tsx";

// ── Egress: this page reads the whole catalogue, so the cost model matters ──

test("the whole catalogue is read ONCE, by one query, and cached", () => {
  const code = codeOnly(read(PAGE));
  assert.equal((code.match(/prisma\./g) ?? []).length, 1, "exactly one query");
  assert.match(code, /prisma\.card\.findMany/);
  assert.match(code, /unstable_cache\(/, "an uncached catalogue-wide read on an indexable page is the egress bug this repo has been bitten by repeatedly");
  // Never a per-card lookup — 1,431 round-trips would be the N+1 this repo's own
  // db.ts header warns about.
  assert.doesNotMatch(code, /findUnique|findFirst/);
});

test("the cache is never shorter-lived than the route itself", () => {
  const code = codeOnly(read(PAGE));
  // CLAUDE.md: never give unstable_cache a revalidate LOWER than the page's own
  // — route-segment propagation dragged five database projects down that way.
  // Passing the same `revalidate` binding makes them impossible to diverge.
  assert.match(code, /export const revalidate = 86400/);
  assert.match(code, /\{ revalidate, tags: \[CONTENT_TAG\] \}/);
});

test("a directory selects names and URLs, not images or prices", () => {
  const code = codeOnly(read(PAGE));
  const select = code.slice(code.indexOf("select: {"), code.indexOf("});", code.indexOf("select: {")));
  for (const column of ["imageUrl", "imageThumbUrl", "blurDataUrl", "description", "lowestPriceCents", "retailerPrices"]) {
    assert.ok(!select.includes(column), `${column} has no business in a link index`);
  }
  for (const column of ["slug", "name", "setCode", "collectorNumber"]) {
    assert.ok(select.includes(column), `${column} is needed for the link and its label`);
  }
});

test("a database blip renders a thin page, never a 500 on an indexable URL", () => {
  const code = codeOnly(read(PAGE));
  assert.match(code, /catch \{[\s\S]{0,80}return \[\];/, "the read must fail open to an empty list");
  assert.match(code, /cards\.length === 0 &&/, "and the page must say so rather than looking broken");
});

// ── Its own indexability: the gates every indexable page has to clear ──────

test("the page clears the crawl checks that apply to every indexable URL", () => {
  const code = codeOnly(read(PAGE));
  // scripts/crawl-check.ts fails a page with h1Count !== 1, a missing/mismatched
  // canonical, or no BreadcrumbList.
  assert.equal((code.match(/<h1/g) ?? []).length, 1, "exactly one h1");
  assert.match(code, /alternates: pageAlternates\(PATH\)/, "self-referencing canonical");
  assert.match(code, /"@type": "BreadcrumbList"/);
  assert.match(code, /application\/ld\+json/);
});

test("it carries real editorial copy, because a wall of links is a thin page", () => {
  // adsense-guard's "indexable pages under 150 unique editorial words" budget is
  // still zero-tolerance, and a page of 1,431 anchors and nothing else is the
  // textbook case it exists to catch.
  const body = read(PAGE);
  const prose = body.slice(body.indexOf("Editorial context"), body.indexOf("Jump links"));
  const words = prose.replace(/<[^>]*>/g, " ").split(/\s+/).filter((w) => /[a-z]{3}/i.test(w));
  assert.ok(words.length >= 150, `only ${words.length} words of editorial copy`);
});

// ── The anchors themselves, which are the entire point of the page ────────

test("every anchor is distinct, even across printings that share a name", () => {
  const code = codeOnly(read(PAGE));
  // "Fury Rune" occurs 31 times in the catalogue. Identical anchor text pointing
  // at different URLs is how you tell a crawler two pages are the same page, so
  // the label carries the printing credentials AND the collector number.
  assert.match(code, /cardDisplayName\(c\.name, c\)/);
  assert.match(code, /\{c\.collectorNumber\}/);
  assert.match(code, /href=\{`\/card\/\$\{c\.slug\}`\}/);
});

test("a slugless card is listed but not linked — that URL would be a redirect", () => {
  const code = codeOnly(read(PAGE));
  assert.match(code, /c\.slug \? \(/, "linking a slugless card would publish a 308 to the slug");
});

// ── Discoverability of the index itself ──────────────────────────────────

test("the index is submitted and reachable, not an orphan", () => {
  // An HTML index nothing links to helps nothing: crawl-check counts sitemap
  // URLs with no inbound internal link as orphans.
  assert.match(read("src/lib/sitemap-sections.ts"), /\/cards\/all`, changeFrequency: "daily"/);
  assert.match(read("src/app/cards/page.tsx"), /href="\/cards\/all"/, "linked from the facet index");
  assert.match(read("src/components/nav-groups.ts"), /href: "\/cards\/all"/, "and from site navigation");
});
