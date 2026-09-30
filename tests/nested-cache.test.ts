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
  "getArbitrageVsTcgplayer",
  "getTcgDealRanks",
  "getPricesAsOf",
  "getCrossRegionGaps",
  "getSealedGroups",
  "getPreorderGroups",
  "getHomeStats",
  // 2026-09-25: Rising Cards' two loaders (getCachedRisingCards is now an
  // uncached assembly over these) and the /movers "Most searched" strip's.
  "getRiseHistory",
  "getRiseInputs",
  "getTopDemand",
  // 2026-09-26: the homepage "Cheapest on eBay" row. It has no cache of its
  // own, but every input is one of the day-caches getArbitrageVsTcgplayer
  // reads (minByCard, the eBay row pull, TCGplayer's rows), which a wrapping
  // cache would disable.
  "getCheapestOnEbay",
  "getCheapestOnEbayFor",
  // 2026-09-28: Rising Cards' ranking rebuilt as of 7 days ago (rank movement),
  // and the day-cached demand read behind it.
  "getRisingWeekAgo",
  "getDemandWeekAgo",
  // 2026-09-29: the set tracker's per-(set, market) catalogue with each card's
  // cheapest real-store listing (lib/set-checklist.ts, key set-checklist).
  "getSetChecklist",
  // 2026-09-30: Deal Finder's Cheapest on eBay and Underpriced vs eBay views.
  // No cache of their own; their inputs are the day-caches above.
  "getCheapestOnEbayPage",
  "getUnderpricedVsEbay",
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

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITIVE NESTING — ONE OR MORE HOPS AWAY (added 2026-09-14, DECISIONS.md
// "Find the fifth burn before RM10 dies").
// ─────────────────────────────────────────────────────────────────────────────
// The direct-call test above only sees `unstable_cache(() => getSealedGroups(`.
// The real bug that shipped (tools/rising-sealed/page.tsx) was
// `unstable_cache(() => getRisingSealed(market))`, where getRisingSealed calls
// computeRisingSealed, which called getSealedGroups — two hops away, and
// invisible to a regex that only looks at the immediate callback. Next's
// fetchCache: "force-no-store" flag is inherited down the whole call chain
// from the outer unstable_cache, not just the first call, so a self-cached
// loader is disabled no matter how many local function calls sit between it
// and the outer wrapper.
//
// This walks every top-level named function in src/, indexes its body (brace-
// matched, not line-based, so multi-line bodies are captured correctly), then
// for every unstable_cache/cachedOrDirect callback that calls ONE locally-named
// function (and that function isn't itself already in SELF_CACHED — the test
// above owns that case), recursively checks whether that function's body — or
// anything IT calls, up to a few hops — contains a bare call to a self-cached
// loader. A name-based heuristic across the whole tree, not a real per-file
// import graph, so a generic helper name could in principle cause a false
// positive; SELF_CACHED's names are specific enough that this has not
// happened running it against this codebase.
function indexFunctionBodies(files: string[]): Map<string, string[]> {
  const bodiesByName = new Map<string, string[]>();
  const funcDeclRe = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(funcDeclRe)) {
      const name = m[1];
      let i = m.index! + m[0].length;
      let depth = 1; // already past the opening "(" of the parameter list
      while (depth > 0 && i < src.length) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        i++;
      }
      const braceStart = src.indexOf("{", i);
      if (braceStart === -1) continue;
      let bd = 0;
      let j = braceStart;
      for (; j < src.length; j++) {
        if (src[j] === "{") bd++;
        else if (src[j] === "}") {
          bd--;
          if (bd === 0) break;
        }
      }
      const body = src.slice(braceStart, j + 1);
      const arr = bodiesByName.get(name) ?? [];
      arr.push(body);
      bodiesByName.set(name, arr);
    }
  }
  return bodiesByName;
}

function findsSelfCachedCall(
  name: string,
  bodiesByName: Map<string, string[]>,
  depth: number,
  visited: Set<string>,
): string | null {
  if (depth <= 0 || visited.has(name)) return null;
  visited.add(name);
  for (const body of bodiesByName.get(name) ?? []) {
    for (const s of SELF_CACHED) {
      if (new RegExp(`(?<![A-Za-z0-9_.])${s}\\(`).test(body)) return s;
    }
    for (const m of body.matchAll(/([A-Za-z0-9_]+)\(/g)) {
      const callee = m[1];
      if (callee !== name && bodiesByName.has(callee)) {
        const hit = findsSelfCachedCall(callee, bodiesByName, depth - 1, visited);
        if (hit) return hit;
      }
    }
  }
  return null;
}

test("no self-cached loader is nested through a chain of local function calls", () => {
  const files = walk(SRC);
  const bodiesByName = indexFunctionBodies(files);
  const callbackRe = /(?:unstable_cache|cachedOrDirect)\(\s*(?:async\s*)?\(\)\s*=>\s*(?:await\s+)?([A-Za-z0-9_]+)\(/g;
  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(callbackRe)) {
      const called = m[1];
      if (SELF_CACHED.includes(called)) continue; // the direct test above owns this shape
      const hit = findsSelfCachedCall(called, bodiesByName, 5, new Set());
      if (hit) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(
          `${relative(ROOT, file)}:${line} — ${called}() transitively calls self-cached ${hit}(); ` +
            `read ${hit}() OUTSIDE the wrapping cache and pass its result in as a parameter instead ` +
            `(see screener.ts's getBaselines/rankUndervalued split)`,
        );
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
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

test("the arbitrage aggregates behind the Deal Finder list are shared-cached", () => {
  // minByCard is a full-market groupBy (~1,400 rows) that used to run on every
  // ranking call — including every request to the force-dynamic /premium and
  // /tools/deal-finder pages. The eBay and TCGplayer row pulls and the
  // "Prices as of" aggregate are day-cached the same way. (The flip tab's
  // per-retailer groupBy went with the tab on 2026-09-25.)
  const src = read("src/lib/arbitrage.ts");
  assert.match(src, /\["arb-min-by-card"/, "minByCard must go through cachedOrDirect");
  assert.match(src, /\["arb-ebay-rows"/, "the eBay row pull must go through cachedOrDirect");
  assert.match(src, /\["arb-tcg-us-rows-v3"/, "the TCGplayer row pull must go through cachedOrDirect");
  assert.match(src, /\["arb-prices-as-of"/, "the prices-as-of aggregate must go through cachedOrDirect");
});

test("sealed groups are shared across lambdas, not only memoised per instance", () => {
  // 38 cold lambdas in twenty minutes each re-pulled the whole sealed table
  // through the per-instance memo. The computed groups (~100 KB per market)
  // now also sit in the shared data cache; the memo stays as the fast path.
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /\["sealed-groups-v2"/, "computed sealed groups must go through cachedOrDirect");
  assert.match(src, /firstSeenAt: [^\n]*new Date\(/, "Date fields must be revived after the JSON round-trip through the data cache");
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SEALED WATCH RUN READS THE GROUPS DIRECTLY (2026-09-29).
// ─────────────────────────────────────────────────────────────────────────────
// lib/sealed-watch.ts calls getSealedGroups(market) (and getPreorderGroups)
// as they are — self-cached — with no unstable_cache or cachedOrDirect of its
// own, and it is never invoked from inside one: the paid cron route awaits it
// at the top level.
test("the sealed watch run calls getSealedGroups directly, unwrapped, and the cron route does not wrap it", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const run = strip(read("src/lib/sealed-watch.ts"));
  assert.match(run, /import \{ getPreorderGroups, getSealedGroups, type SealedGroup \} from "\.\/sealed-import";/);
  assert.match(run, /deps\.groups \?\? getSealedGroups/, "the default loader is the self-cached one, passed as-is");
  assert.doesNotMatch(run, /unstable_cache|cachedOrDirect/, "no cache of its own");
  const route = strip(read("src/app/api/cron/price-alerts/paid/route.ts"));
  assert.doesNotMatch(route, /unstable_cache|cachedOrDirect/);
  assert.match(route, /await runSealedWatches\(\{ sendCap: afterDecks/);
  const deck = strip(read("src/lib/deck-watch.ts"));
  assert.doesNotMatch(deck, /unstable_cache|cachedOrDirect/, "the deck run is per member: nothing to cache");
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SEALED-ONLY ALERT PASS READS UNCACHED, AND WRAPS NOTHING (2026-09-29).
// ─────────────────────────────────────────────────────────────────────────────
// /api/cron/price-alerts/sealed runs four times a day's worth of sealed passes
// without busting CONTENT_TAG: it reads SealedListing itself
// (lib/sealed-alert-read.ts), so there is no self-cached loader to wrap, no
// cache to bypass and no revalidateTag. getSealedGroupsFresh is uncached by
// construction — the point is that it is NOT one of SELF_CACHED and is never
// put inside an unstable_cache callback either (that would be a pointless
// per-outer-miss recompute). tests/sealed-cadence.test.ts pins the rest.
test("the sealed-only cron route and its fresh read use no cache and call no self-cached loader", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const route = strip(read("src/app/api/cron/price-alerts/sealed/route.ts"));
  const fresh = strip(read("src/lib/sealed-alert-read.ts"));
  for (const [name, src] of [["route", route], ["sealed-alert-read", fresh]] as const) {
    assert.doesNotMatch(src, /unstable_cache|cachedOrDirect|revalidateTag|revalidatePath/, `${name}: no cache, no bust`);
    for (const loader of SELF_CACHED) assert.ok(!new RegExp(`\\b${loader}\\(`).test(src), `${name} must not call the self-cached ${loader}`);
  }
  assert.ok(!SELF_CACHED.includes("getSealedGroupsFresh"), "the fresh read is not a cached loader");
  // Nothing in src wraps it in a cache callback.
  const wrapped = new RegExp("(?:unstable_cache|cachedOrDirect)\\(\\s*(?:async\\s*)?\\(\\)\\s*=>\\s*(?:await\\s+)?(?:getSealedGroupsFresh|getAllSealedGroupsFresh|getPreorderGroupsFresh)\\(");
  for (const f of walk(SRC)) assert.doesNotMatch(strip(readFileSync(f, "utf8")), wrapped, relative(ROOT, f));
});
