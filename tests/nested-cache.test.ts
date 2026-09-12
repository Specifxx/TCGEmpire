import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// A CACHED LOADER CALLED INSIDE ANOTHER unstable_cache CALLBACK IS NOT CACHED.
// ─────────────────────────────────────────────────────────────────────────────
// Next.js 14.2 runs every unstable_cache callback under a store with
// fetchCache: "force-no-store", and gates the cache READ on that flag — so a
// nested unstable_cache (or cachedOrDirect) recomputes on every outer miss and
// its own key/TTL/tag mean nothing. The first egress audit of the history
// project (2026-09-11) measured the result: whole-market PriceHistory reads
// running 86 and 36 times in twenty minutes with nothing else happening,
// because getPriceMovers, getRisingCards, getUndervalued and the arbitrage row
// pulls were all invoked from inside getCachedTopDeals' hourly entry, and two
// pages had wrapped already-cached loaders in a second cache of their own.
//
// These pin the known shapes statically. The runtime guard in cachedOrDirect
// (lib/price-history.ts) logs anything they miss.

// Loaders that cache THEMSELVES (unstable_cache / cachedOrDirect inside). Wrapping
// one of these in another unstable_cache silently disables its cache.
const SELF_CACHED = [
  "getPriceMovers",
  "getRecentlyUpdated",
  "getPriceHistory",
  "getUndervalued",
  "getMarketIndex",
  "getAllTimeRecords",
  "getBulkCardSummary",
  "getCachedRisingCards",
  "getCachedTopDeals",
  "getTopDeals",
  "getEbayCheapest",
  "getArbitrage",
  "getArbitrageVsTcgplayer",
  "getCrossRegionGaps",
  "getSealedGroups",
  "getPreorderGroups",
  "getHomeStats",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("no self-cached loader is wrapped in another unstable_cache / cachedOrDirect", () => {
  const wrap = new RegExp(
    `(?:unstable_cache|cachedOrDirect)\\(\\s*(?:async\\s*)?\\(\\)\\s*=>\\s*(?:await\\s+)?(${SELF_CACHED.join("|")})\\(`,
    "g",
  );
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(wrap)) {
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`${relative(ROOT, file)}:${line} — ${m[1]} is self-cached; the outer cache disables it`);
    }
  }
  assert.deepEqual(offenders, [], "call the loader directly — it caches itself:\n" + offenders.join("\n"));
});

test("getCachedTopDeals assembles independently cached sources; it has no outer cache of its own", () => {
  // getTopDeals fans out to four loaders that each cache themselves. An outer
  // unstable_cache around the whole thing turned every one of them into an
  // uncached read on each hourly miss (and on every stale-while-revalidate
  // refresh) — the widest history and demand scans in the repo, per market.
  const src = read("src/lib/top-deals.ts");
  // The call and the import, not the word — the header comment explains the rule.
  assert.doesNotMatch(src, /unstable_cache\(|from "next\/cache"/, "top-deals.ts must not import or call unstable_cache");
  assert.match(src, /getCachedRisingCards\(/, "the rising column must come from the shared day-keyed cache in rise-predictor.ts");
});

test("the rising-cards scan has exactly one cached entry point", () => {
  const src = read("src/lib/rise-predictor.ts");
  assert.match(src, /export function getCachedRisingCards\(/, "getCachedRisingCards must live next to the scan it caches");
  // Nobody else wraps getRisingCards — that produced two competing keys for the
  // same 400-card scan (admin used "rising-cards", public "rising-cards-public").
  for (const file of walk(SRC)) {
    if (file.endsWith("rise-predictor.ts")) continue;
    const s = readFileSync(file, "utf8");
    assert.doesNotMatch(
      s,
      /(?:unstable_cache|cachedOrDirect)\(\s*\(\)\s*=>\s*getRisingCards\(/,
      `${relative(ROOT, file)} wraps getRisingCards itself — use getCachedRisingCards`,
    );
  }
});

test("cachedOrDirect detects nesting at runtime and logs every compute", () => {
  const src = read("src/lib/price-history.ts");
  assert.match(src, /isUnstableCacheCallback/, "the nested-cache guard reads Next's isUnstableCacheCallback flag");
  assert.match(src, /\[egress-guard:nested-cache\]/, "a nested call must be logged under the egress-guard prefix");
  assert.match(src, /\[egress-guard:cache-miss\]/, "every real compute must be logged so cadence is measurable from the function logs");
});

test("the arbitrage aggregates behind the eBay deals feed are shared-cached", () => {
  // minByCard / minByCardAndRetailer are full-market groupBys (~1,400 rows each)
  // that used to run on every getEbayCheapest / getArbitrage call — including
  // every request to the force-dynamic /premium and /tools/deal-finder pages.
  const src = read("src/lib/arbitrage.ts");
  assert.match(src, /\["arb-min-by-card"/, "minByCard must go through cachedOrDirect");
  assert.match(src, /\["arb-min-by-card-retailer"/, "minByCardAndRetailer must go through cachedOrDirect");
});

test("sealed groups are shared across lambdas, not only memoised per instance", () => {
  // 38 cold lambdas in twenty minutes each re-pulled the whole sealed table
  // through the per-instance memo. The computed groups (~100 KB per market)
  // now also sit in the shared data cache; the memo stays as the fast path.
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /\["sealed-groups-v1"/, "computed sealed groups must go through cachedOrDirect");
  assert.match(src, /firstSeenAt: [^\n]*new Date\(/, "Date fields must be revived after the JSON round-trip through the data cache");
});
