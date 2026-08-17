import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_COUNTRY, priceField } from "../src/lib/country";
import { hasAnyMarketPrice } from "../src/lib/market-rows";

const ROOT = process.cwd();
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

const sitemap = read("src/lib/sitemap-sections.ts");
const gallery = read("src/app/sets/[set]/gallery/page.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// 1. The sitemap must describe the page it is submitting.
// ─────────────────────────────────────────────────────────────────────────────
// `lowestPriceCents` is the AUSTRALIAN column (schema.prisma names all six), but
// DEFAULT_COUNTRY is "US" — the baseline the card page renders for a crawler and
// the market whose rows gate its Product JSON-LD. The cards() section branched
// both lastmod and priority on the AU column.
//
// That is not a near-miss, because the two markets have very different coverage:
// TCGplayer is a real US store so US pricing is catalogue-wide, while AU pricing
// is only what local shops actually stock. The common "priced in the US, no AU
// listing" card therefore fell to the unpriced branch and was stamped with
// `createdAt` — and Card has no @updatedAt, so that date is frozen at import
// forever. The sitemap told Google a page whose prices change daily had not
// changed since the day it was created.

test("the card sitemap does not branch on the Australian column", () => {
  const at = sitemap.indexOf("async function cards(");
  assert.ok(at >= 0, "cards() moved — re-derive this test");
  const body = sitemap.slice(at, sitemap.indexOf("async function sets(", at));
  assert.doesNotMatch(
    body,
    /c\.lowestPriceCents\s*!=\s*null/,
    "lowestPriceCents is AU; the page these URLs point at renders the US baseline"
  );
  assert.match(
    body,
    /hasAnyMarketPrice\(c\)/,
    "decide priced/unpriced from the markets the page can actually show"
  );
});

test("the priced decision drives both lastmod and priority", () => {
  const at = sitemap.indexOf("async function cards(");
  const body = sitemap.slice(at, sitemap.indexOf("async function sets(", at));
  assert.match(body, /priority: priced \?/, "priority must use the same decision");
  assert.match(body, /lastModified: priced \?/, "lastmod must use the same decision");
});

test("hasAnyMarketPrice sees a card priced in any single market", () => {
  const bare = {
    lowestPriceCents: null,
    lowestPriceCentsNz: null,
    lowestPriceCentsUs: null,
    lowestPriceCentsUk: null,
    lowestPriceCentsSg: null,
    lowestPriceCentsCa: null,
  };
  assert.equal(hasAnyMarketPrice(bare), false, "a card with no price anywhere is unpriced");
  // The exact case the AU-only test got wrong: priced in the baseline market, and
  // in nothing else.
  assert.equal(
    hasAnyMarketPrice({ ...bare, [priceField(DEFAULT_COUNTRY)]: 1234 }),
    true,
    `a card priced only in ${DEFAULT_COUNTRY} (the baseline) must count as priced`
  );
  for (const f of Object.keys(bare)) {
    assert.equal(hasAnyMarketPrice({ ...bare, [f]: 999 }), true, `${f} alone must count as priced`);
  }
});

test("the baseline market is the one the sitemap query orders by", () => {
  // If DEFAULT_COUNTRY ever moves, the orderBy column has to move with it —
  // otherwise the sitemap silently sorts by a market nobody is served.
  assert.equal(priceField(DEFAULT_COUNTRY), "lowestPriceCentsUs");
  const at = sitemap.indexOf("async function cards(");
  const body = sitemap.slice(at, sitemap.indexOf("async function sets(", at));
  assert.match(body, /orderBy:\s*\{\s*lowestPriceCentsUs:/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. "Couldn't count" is not "there is nothing here".
// ─────────────────────────────────────────────────────────────────────────────
// The set gallery derived its thin-page noindex from a card count that fell back
// to 0 on any database error. This repo has had five Neon projects exhaust their
// transfer allowance (see the log in lib/db.ts), so an unreachable database is a
// recorded event, not a hypothetical — and the route is statically rendered with
// revalidate = 3600, which means the noindex gets BAKED INTO the cached HTML and
// served to Googlebot until some later request happens to regenerate it. An
// outage during a deploy would have noindexed every set's gallery at once.
//
// Every sibling route already uses -1 for "unknown" so that only a CONFIRMED zero
// suppresses indexing. The gallery had copied the `=== 0` half of that rule and
// dropped the sentinel that makes it safe.

test("the set gallery's card count fails OPEN for indexability", () => {
  assert.match(
    gallery,
    /prisma\.card\.count\([\s\S]{0,120}?\.catch\(\(\) => -1\)/,
    "catch(() => 0) lets a transient DB failure noindex a fully-populated gallery, " +
      "and ISR caches that answer long after the outage ends"
  );
  assert.match(gallery, /const thin = total === 0;/, "only a confirmed zero may trip noindex");
});

test("the unknown-count sentinel never reaches the page title", () => {
  assert.doesNotMatch(
    gallery,
    /All \$\{set\.totalCards \?\? total\} Cards/,
    'a failed count would render "All -1 Cards" in the title Google indexes'
  );
  assert.match(gallery, /total >= 0 \? total : null/, "guard the count before showing it");
});

test("the gallery matches the convention its siblings already follow", () => {
  // The rule is only load-bearing if it is the same rule everywhere.
  for (const p of [
    "src/app/sets/[set]/page.tsx",
    "src/app/cards/type/[type]/page.tsx",
    "src/app/cards/rarity/[rarity]/page.tsx",
    "src/app/cards/printing/[printing]/page.tsx",
    "src/app/stores/[slug]/page.tsx",
  ]) {
    // Spelled either as a `.catch(() => -1)` on the count itself or as a `-1` in a
    // surrounding catch block (stores/[slug] returns a whole stats object) — what
    // matters is that the unknown case is a NEGATIVE, never 0.
    assert.match(
      read(p),
      /\.catch\(\(\) => -1\)|count: -1/,
      `${p} no longer uses the -1 sentinel — the convention has drifted`
    );
  }
});
