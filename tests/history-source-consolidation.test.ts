import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { historySource, GLOBAL_HISTORY_COUNTRY } from "../src/lib/price-history";
import { convertCents } from "../src/lib/fx";
import { currencyOf } from "../src/lib/country";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-02: CA and EU stopped getting their own PriceHistory rows — every
// card they'd track already had a real, currently-tracked twin (US for CA, UK
// for EU), so a full second weekly snapshot for each was pure duplication.
//
// 2026-09-05: the same idea finished for AU/US/UK/SG too. Instead of writing
// up to 4 rows per card per week (one per tracked market, each in its own
// currency), price-import.ts now writes exactly ONE row per card per week —
// the cheapest price found in ANY tracked market that day, converted to USD
// cents, under the single country=GLOBAL_HISTORY_COUNTRY sentinel. Every
// market's history now resolves to that same shared series; historySource()
// (price-history.ts) is the one place that knows this and converts the
// stored USD figure back to whichever currency the caller actually wants.
//
// Live current prices (Card.lowestPriceCents*) are completely untouched —
// every market still gets its own real store/eBay scrape every import. Only
// the HISTORY archive (charts, movers, the Index, portfolio, records, the
// predictor, the public API) is consolidated.
// ─────────────────────────────────────────────────────────────────────────────

test("historySource always resolves to the single GLOBAL series, for every market", () => {
  for (const country of ["AU", "US", "UK", "SG", "CA", "EU"] as const) {
    const { source } = historySource(country);
    assert.equal(source, GLOBAL_HISTORY_COUNTRY, `${country} must read the shared GLOBAL series, not a per-market one`);
  }
});

test("historySource converts the stored USD figure into the requested market's own currency", () => {
  for (const country of ["AU", "US", "UK", "SG", "CA", "EU"] as const) {
    const { convert } = historySource(country);
    for (const usdCents of [0, 1, 12_345, 999_999]) {
      assert.equal(
        convert(usdCents),
        convertCents(usdCents, "USD", currencyOf(country)),
        `${country}'s convert() must use the same USD->${currencyOf(country)} rate fx.ts uses everywhere else`
      );
    }
  }
});

test("price-import.ts writes ONE GLOBAL row per card, the USD-converted minimum across every tracked market", () => {
  const code = codeOnly(read("src/lib/price-import.ts"));
  // The old per-country pushes must be gone — a resurrected one anywhere in
  // the file would silently double-count that market in both the shared
  // series AND (if this ever regressed) a per-market one.
  for (const c of ["AU", "US", "UK", "SG", "CA", "EU"]) {
    assert.doesNotMatch(
      code,
      new RegExp(`rows\\.push\\(\\{ cardId: c\\.id, country: "${c}"`),
      `${c} must never be pushed as its own PriceHistory row any more`
    );
  }
  // Every tracked market's own price is converted to USD through ONE shared
  // line inside a loop over the 4 markets, not 4 separate hand-written
  // conversions that could individually drift.
  assert.match(code, /convertCents\(cents, currencyOf\(country\), "USD"\)/, "expected a uniform per-market USD conversion");
  assert.match(code, /const usdCandidates: number\[\] = \[\]/, "expected the candidate list the minimum is taken over");
  assert.match(code, /Math\.min\(\.\.\.usdCandidates\)/, "expected the actual cross-market minimum, not an average or a fixed market's price");
  assert.match(code, /country: GLOBAL_HISTORY_COUNTRY/, "the row written must use the shared GLOBAL sentinel");
  // Live current prices are a SEPARATE, untouched code path — every market
  // still gets written to the Card table on every import.
  assert.match(code, /lowestPriceCentsCa:\s*nCa/, "CA's live current price must still update every import");
  assert.match(code, /lowestPriceCentsEu:\s*nEu/, "EU's live current price must still update every import");
});

// ── Every real PriceHistory reader must resolve through historySource ────────
// (market-index.ts's computeRegionIndex is pinned in market-index-restore.test.ts
// already, alongside the chain-linking it was changed in the same pass as.)
// None of the tests below needed to change when the write formula did — they
// assert the QUERY SHAPE (`country: source`, then convert), which historySource
// keeps completely stable behind its own changed internals. That stability is
// the whole point of funnelling every reader through one function.

test("price-history.ts's own 3 PriceHistory readers all resolve through historySource", () => {
  const code = codeOnly(read("src/lib/price-history.ts"));
  assert.match(code, /where:\s*\{\s*cardId,\s*country:\s*source,\s*day:\s*\{\s*gte:\s*cutoff\s*\}\s*\}/, "computePriceHistory");
  assert.match(code, /where:\s*\{\s*country:\s*source,\s*day:\s*\{\s*gte:\s*cutoff\s*\}\s*\}[\s\S]{0,400}orderBy:\s*\{\s*day:\s*"asc"\s*\}[\s\S]{0,600}latestRowDay/, "computePriceMovers");
  assert.match(code, /where:\s*\{\s*country:\s*source,\s*day:\s*\{\s*gte:\s*cutoff\s*\}\s*\}[\s\S]{0,600}latestDay/, "computeRecentlyUpdated");
  // Every extracted price is converted at the point it's read, not left raw.
  const convertCalls = code.match(/convert\(r\.lowestPriceCents\)/g) ?? [];
  assert.ok(convertCalls.length >= 3, `expected all 3 readers to convert their rows, found ${convertCalls.length} call site(s)`);
});

test("premium.ts's portfolio history read resolves through historySource", () => {
  const code = codeOnly(read("src/lib/premium.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /const \{ source, convert \} = historySource\(country\)/);
  assert.match(code, /where:\s*\{\s*country:\s*source,\s*cardId:\s*\{\s*in:\s*cardIds\s*\}/);
  assert.match(code, /lowestPriceCents:\s*convert\(r\.lowestPriceCents\)/, "the cached rows must be converted before being handed back");
});

test("public-api.ts's bulk card summary resolves through historySource", () => {
  const code = codeOnly(read("src/lib/public-api.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /where:\s*\{\s*country:\s*source,\s*day:\s*\{\s*gte:\s*cutoff\s*\}/);
});

test("screener.ts's undervalued baseline resolves through historySource", () => {
  const code = codeOnly(read("src/lib/screener.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /where:\s*\{\s*country:\s*source,\s*cardId:\s*\{\s*in:\s*ids\s*\}/);
});

test("rise-predictor.ts's GLOBAL scope reads the same shared series as every single-market scope", () => {
  // 2026-09-05: GLOBAL used to read every real per-country row and pick
  // whichever market had the deepest series per card (there was something to
  // pick between). Now there is exactly one series, period, so GLOBAL and a
  // single market read the identical rows — see tests/retired-market-safety.test.ts
  // for what that simplification removed (the per-country cast/guard it no
  // longer needs).
  const code = codeOnly(read("src/lib/rise-predictor.ts"));
  assert.match(code, /import\s*\{[^}]*GLOBAL_HISTORY_COUNTRY[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(
    code,
    /where:\s*\{\s*cardId:\s*\{\s*in:\s*ids\s*\},\s*day:\s*\{\s*gte:\s*cutoff\s*\},\s*country:\s*GLOBAL_HISTORY_COUNTRY\s*\}/,
    "every scope must filter to the single GLOBAL sentinel, unconditionally — no more scope-dependent country filter"
  );
});

test("weekly-promo.ts's pre-flight history check resolves through historySource", () => {
  const code = codeOnly(read("scripts/weekly-promo.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\.\/src\/lib\/price-history"/);
  assert.match(
    code,
    /dbHistory\.priceHistory\.count\(\{\s*where:\s*\{\s*country:\s*historySource\(market\)\.source\s*\}\s*\}\)/,
    "must check the market the promo will ACTUALLY read, or a CA/EU-only history state reports a false 'no history'"
  );
});

test("market-records.ts's two queries both redirect through historySource, using the SAME convert function", () => {
  // The subtle failure mode here isn't a wrong currency — it's the peak/trough
  // DAY-MATCHING logic (query 2's rows are matched against query 1's aggregate
  // by exact value equality). convert() is deterministic, so converting BOTH
  // queries' results with the SAME function preserves that equality; converting
  // with two different closures (or converting only one side) would silently
  // break every peak/trough day for a derived market.
  const code = codeOnly(read("src/lib/market-records.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /const \{ source, convert \} = historySource\(country\)/);
  assert.match(code, /groupBy\(\{\s*by:\s*\["cardId"\],\s*where:\s*\{\s*country:\s*source\s*\}/);
  assert.match(code, /findMany\(\{\s*where:\s*\{\s*country:\s*source,\s*cardId:\s*\{\s*in:\s*ids\s*\}/);
  // Both extraction points use the one `convert` closure resolved above — not a
  // second historySource(...) call, which would still be correct but would
  // defeat the point of this test (proving it's the SAME function both times).
  const convertCalls = code.match(/convert\(/g) ?? [];
  assert.ok(convertCalls.length >= 3, `expected convert() applied at both query-1 (peak/trough) and query-2 (v) extraction points, found ${convertCalls.length} call(s)`);
  assert.doesNotMatch(code, /historySource\(country\)[\s\S]*historySource\(country\)/, "must resolve historySource once and reuse it, not re-derive a second (possibly-inconsistent) convert closure");
});
