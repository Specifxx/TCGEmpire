import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LIB = "src/lib/sealed-index.ts";
const PAGE = "src/app/market/sealed/page.tsx";
const CONSTITUENTS_UI = "src/components/SealedIndexConstituents.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// The Sealed Index (/market/sealed), 2026-09-02 — the sealed-side sibling of the
// singles RiftCompare Index, built once SealedPriceHistory (see
// sealed-price-history.test.ts) gave sealed products something to chart. Kept as
// a SEPARATE index rather than merged into the 200-card basket (wildly different
// price scales), and unlike the singles Index — which ranks 200 constituents by
// search volume — this one has no demand signal to rank or weight by, so it
// simply includes the whole (small, ~30-group) shipped catalogue, equal-weighted.
// Reuses market-index.ts's chainLinkSeries/computeStats directly rather than
// reimplementing chain-linking a second time.
// ─────────────────────────────────────────────────────────────────────────────

test("reuses chainLinkSeries and computeStats from market-index.ts rather than reimplementing chain-linking", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /import\s*\{\s*chainLinkSeries,\s*computeStats,\s*type MarketStats\s*\}\s*from\s*"\.\/market-index"/);
  assert.doesNotMatch(code, /function chainLinkSeries/, "must not redefine the chain-linking algorithm");
  assert.doesNotMatch(code, /function computeStats/, "must not redefine the stats helper");
});

test("constituents are the whole shipped (non-preorder) catalogue, equal-weighted — no search-based ranking", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /getSealedGroups\(country\)/, "must use the shipped-only listing (pre-orders excluded, like the live /sealed page)");
  assert.doesNotMatch(code, /getAllSealedGroups|getPreorderGroups/, "must not include pre-order-only or unfiltered groups in the basket");
  assert.match(code, /const weights = groups\.map\(\(\) => 1\)/, "every constituent must carry the same weight");
  assert.doesNotMatch(code, /searchCount|MAX_WEIGHT_SHARE/i, "there is no demand signal to weight or cap by — see the file header");
});

test("every market's sealed history is read natively — no historySource()/CA-EU derivation", () => {
  // Unlike singles (market-index.ts uses historySource() because CA/EU history is
  // derived from US/UK), EBAY_SEALED_MARKETS tracks all 6 markets independently —
  // the sealed catalogue is cheap enough to search natively everywhere.
  const code = codeOnly(read(LIB));
  assert.doesNotMatch(code, /historySource/, "sealed history needs no market-derivation layer");
  assert.match(
    code,
    /dbHistory\.sealedPriceHistory\.findMany\(\{\s*where:\s*\{\s*country,\s*groupKey:\s*\{\s*in:\s*groups\.map/,
    "must read this market's own history directly by country, not a resolved/derived source",
  );
});

test("week-scoped cache, same TTL convention as the singles Index", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /import\s*\{\s*sydneyWeekKey,\s*type PricePoint\s*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /\["rc-sealed-index",\s*country,\s*sydneyWeekKey\(\)\]/, "cache key must be market + week scoped");
  assert.match(code, /revalidate:\s*8 \* 86400/, "must match market-index.ts's week-plus-slack TTL");
  assert.match(code, /tags:\s*\[CONTENT_TAG\]/);
});

test("defaults to US with no GLOBAL composite, and returns null (not throws) on any error", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /export async function getSealedIndex\(market: Country = DEFAULT_COUNTRY\)/);
  assert.doesNotMatch(code, /GLOBAL/, "no cross-region composite — one region in its own currency, matching market-index.ts's own removal");
  const fn = code.slice(code.indexOf("async function computeSealedRegionIndex"), code.indexOf("\n}\n\n// WEEK-scoped"));
  assert.match(fn, /try\s*\{/);
  assert.match(fn, /\}\s*catch\s*\{\s*return null;\s*\}/, "must fail closed to the page's warming-up state, never throw");
});

test("SEALED_INDEX_MIN_GROUPS gates a near-empty basket before it's charted", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /export const SEALED_INDEX_MIN_GROUPS = \d+/);
  assert.match(code, /if \(groups\.length < SEALED_INDEX_MIN_GROUPS\) return null;/);
});

// ─────────────────────────────────────────────────────────────────────────────
// UI reuse: IndexStats was loosened to a minimal structural prop (mirroring
// market-index.ts's own StatsConstituent treatment of computeStats) so the
// Sealed Index's differently-shaped SealedMarketIndex can share the same "key
// statistics" panel instead of a duplicate component.
// ─────────────────────────────────────────────────────────────────────────────

test("IndexStats takes the minimal shape it reads, not the full card-specific MarketIndex", () => {
  const src = codeOnly(read("src/components/IndexStats.tsx"));
  assert.match(src, /type StatsPanelIndex = \{ stats: MarketStats; currency: string; startDay: string \}/);
  assert.match(src, /function IndexStats\(\{ index \}: \{ index: StatsPanelIndex \}\)/);
  assert.doesNotMatch(src, /import type \{ MarketIndex \}/, "no longer needs the full card-specific type");
});

test("SealedIndexConstituents links out to /sealed?q=, not a card-specific href — no per-product page exists", () => {
  const src = codeOnly(read(CONSTITUENTS_UI));
  assert.doesNotMatch(src, /cardHref|cardImageAlt/, "must not reuse card-only helpers on sealed data");
  assert.match(src, /sealedImageAlt\(/, "must use the sealed-specific alt-text helper");
  assert.match(src, /href=\{`\/sealed\?q=\$\{encodeURIComponent\(c\.name\)\}`\}/, "each row must link to a real, working filter on /sealed");
  // No Weight column — every row is the same 1/N share (see sealed-index.ts), so
  // a column for it would carry no information the page copy doesn't already say.
  assert.doesNotMatch(src, /weightPct/, "must not render a weight column for a basket that is uniformly weighted");
});

// ─────────────────────────────────────────────────────────────────────────────
// The page.
// ─────────────────────────────────────────────────────────────────────────────

test("the page is dynamic and market-switchable, matching /market and /market/records", () => {
  const src = read(PAGE);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /<MarketSwitcher[\s\S]{0,150}basePath="\/market\/sealed"/);
});

test("the warming-up empty state cites the real MIN_GROUPS constant, not a hard-coded duplicate number", () => {
  const src = codeOnly(read(PAGE));
  assert.match(src, /import\s*\{\s*getSealedIndex,\s*SEALED_INDEX_MIN_GROUPS,\s*type SealedIndexConstituent\s*\}\s*from\s*"@\/lib\/sealed-index"/);
  assert.match(src, /is warming up/i);
  assert.match(src, /\{SEALED_INDEX_MIN_GROUPS\}/, "the copy must interpolate the real constant, not restate it as a literal");
});

test("the methodology section discloses equal-weighting honestly — search volume is only cited as the SINGLES Index's method, never claimed as this one's own", () => {
  const src = read(PAGE);
  const section = src.slice(src.indexOf('id="cite"'));
  assert.match(section, /weighted equally|does not weight by demand/i, "must say this Index itself carries no demand weighting");
  // "search volume" is fine to MENTION (contrasting against the singles Index,
  // which genuinely is search-weighted) but must never be the stated reason
  // THIS index's own constituents are weighted the way they are.
  for (const m of section.matchAll(/[^.]*search volume[^.]*\./gi)) {
    assert.match(m[0], /unlike|singles Index/i, `"search volume" appears without the contrast that makes it true of THIS index: "${m[0].trim()}"`);
  }
  // The chain-linking formula is identical, so it links to the existing citable
  // guide rather than duplicating the derivation in a second article.
  assert.match(section, /\/guides\/understanding-the-riftcompare-index-methodology/);
});

test("the page is discoverable: in the sitemap, and linked from /market", () => {
  assert.match(read("src/lib/sitemap-sections.ts"), /\/market\/sealed/, "must be in the sitemap");
  assert.match(read("src/app/market/page.tsx"), /href="\/market\/sealed"/, "the singles Index page must link to its sealed sibling");
});

test("breadcrumb nests the Sealed Index under the RiftCompare Index, not as a sibling of Home", () => {
  const src = read(PAGE);
  assert.match(src, /name: "RiftCompare Index", item: `\$\{SITE_URL\}\/market`/);
  assert.match(src, /name: "Sealed Index", item: `\$\{SITE_URL\}\/market\/sealed`/);
});
