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

test("price-import.ts writes ONE GLOBAL point per card, the USD-converted minimum across every tracked market", () => {
  const code = codeOnly(read("src/lib/price-import.ts"));
  // The old per-country pushes must be gone — a resurrected one anywhere in
  // the file would silently double-count that market in the shared series.
  for (const c of ["AU", "US", "UK", "SG", "CA", "EU"]) {
    assert.doesNotMatch(
      code,
      new RegExp(`rows\\.push\\(\\{ cardId: c\\.id, country: "${c}"`),
      `${c} must never be pushed as its own history row any more`
    );
  }
  // Every tracked market's own price is converted to USD through ONE shared
  // line inside a loop over the 4 markets, not 4 separate hand-written
  // conversions that could individually drift.
  assert.match(code, /convertCents\(cents, currencyOf\(country\), "USD"\)/, "expected a uniform per-market USD conversion");
  assert.match(code, /const usdCandidates: number\[\] = \[\]/, "expected the candidate list the minimum is taken over");
  assert.match(code, /points\.push\(\[c\.id, Math\.min\(\.\.\.usdCandidates\)\]\)/, "expected the actual cross-market minimum, not an average or a fixed market's price");
  // 2026-10-03: the day's points go to the USD day file (lib/price-history-store.ts),
  // not to a PriceHistory table.
  assert.match(code, /writeCardHistoryDay\(day, points\)/, "the day's GLOBAL points are written to the day file");
  assert.doesNotMatch(code, /dbHistory/, "price history is no longer written to the history database");
  // Live current prices are a SEPARATE, untouched code path — every market
  // still gets written to the Card table on every import.
  assert.match(code, /lowestPriceCentsCa:\s*nCa/, "CA's live current price must still update every import");
  assert.match(code, /lowestPriceCentsEu:\s*nEu/, "EU's live current price must still update every import");
});

// ── Every real price-history reader must resolve through historySource ──────
// (market-index.ts's computeRegionIndex is pinned in market-index-restore.test.ts
// already, alongside the chain-linking it was changed in the same pass as.)
// Since 2026-10-03 every reader takes its points from the day files
// (cardHistoryRows in lib/price-history-store.ts, which holds only the GLOBAL
// USD series), so what is pinned is: the read goes through the store, never
// the history database, and every price read is converted with historySource's
// `convert` for the caller's market.

const readsThroughStore = (file: string, label: string) => {
  const code = codeOnly(read(file));
  assert.match(code, /cardHistoryRows\(/, `${label}: reads the day files`);
  assert.doesNotMatch(code, /dbHistory\.priceHistory|FROM "PriceHistory"/, `${label}: must not read the retired PriceHistory table`);
  assert.match(code, /const \{ convert \} = historySource\(country\)/, `${label}: resolves the market's conversion once`);
  return code;
};

test("price-history.ts's own 3 readers all read the files and convert through historySource", () => {
  const code = readsThroughStore("src/lib/price-history.ts", "price-history.ts");
  assert.match(code, /cardHistoryRows\(\{ cardIds: \[cardId\], since: cutoff \}\)/, "computePriceHistory");
  assert.match(code, /cardHistoryRows\(\{ since: cutoff \}\)[\s\S]{0,600}latestRowDay/, "computePriceMovers");
  assert.match(code, /cardHistoryRows\(\{ since: cutoff \}\)[\s\S]{0,600}latestDay/, "computeRecentlyUpdated");
  // Every extracted price is converted at the point it's read, not left raw.
  const convertCalls = code.match(/convert\(r\.lowestPriceCents\)/g) ?? [];
  assert.ok(convertCalls.length >= 3, `expected all 3 readers to convert their rows, found ${convertCalls.length} call site(s)`);
});

test("premium.ts's portfolio history read resolves through historySource", () => {
  const code = readsThroughStore("src/lib/premium.ts", "premium.ts");
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /cardHistoryRows\(\{ cardIds, since: cutoff \}\)/);
  assert.match(code, /lowestPriceCents:\s*convert\(r\.lowestPriceCents\)/, "the rows must be converted before being handed back");
});

test("public-api.ts's bulk card summary resolves through historySource", () => {
  const code = readsThroughStore("src/lib/public-api.ts", "public-api.ts");
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /cardHistoryRows\(\{ since: cutoff \}\)/);
});

// screener.ts's undervalued baseline was pinned here until the Value Finder
// (and screener.ts with it) left the product on 2026-09-25.

test("rise-predictor.ts's GLOBAL scope reads the same shared series as every single-market scope", () => {
  // 2026-09-05: GLOBAL used to read every real per-country row and pick
  // whichever market had the deepest series per card (there was something to
  // pick between). Now there is exactly one series, period, so GLOBAL and a
  // single market read the identical points — see tests/retired-market-safety.test.ts
  // for what that simplification removed (the per-country cast/guard it no
  // longer needs). The store holds only that series (2026-10-03), so there is
  // no country filter left to get wrong: one scope-independent read of every
  // card from riseHistoryStart (tests/rising-cards.test.ts pins the rest).
  const code = codeOnly(read("src/lib/rise-predictor.ts"));
  assert.match(code, /const rows = cardHistoryRows\(\{ since: riseHistoryStart\(Date\.now\(\)\) \}\)/);
  assert.doesNotMatch(code, /dbHistory|FROM "PriceHistory"/);
});

test("weekly-promo.ts's pre-flight history check reads the shared series every market reads", () => {
  // It once queried the OPERATIONAL database (empty PriceHistory) and skipped
  // every Friday; then the history project. Now the day files, which hold the
  // one GLOBAL series every market's movers read, so one count covers them all.
  const code = codeOnly(read("scripts/weekly-promo.ts"));
  assert.match(code, /const historyRows = cardHistoryStats\(\)\.points/);
  assert.doesNotMatch(code, /dbHistory/);
});

test("market-records.ts's two passes both convert with the SAME function", () => {
  // The subtle failure mode here isn't a wrong currency — it's the peak/trough
  // DAY-MATCHING logic (pass 2's points are matched against pass 1's summary
  // by exact value equality). convert() is deterministic, so converting BOTH
  // passes' results with the SAME function preserves that equality; converting
  // with two different closures (or converting only one side) would silently
  // break every peak/trough day for a derived market.
  const code = codeOnly(read("src/lib/market-records.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(code, /const \{ convert \} = historySource\(country\)/);
  assert.match(code, /const agg = cardHistorySummaries\(\)/);
  assert.match(code, /cardHistoryRows\(\{ cardIds: ids \}\)/);
  assert.doesNotMatch(code, /dbHistory/);
  // Both extraction points use the one `convert` closure resolved above — not a
  // second historySource(...) call, which would still be correct but would
  // defeat the point of this test (proving it's the SAME function both times).
  const convertCalls = code.match(/convert\(/g) ?? [];
  assert.ok(convertCalls.length >= 3, `expected convert() applied at both pass-1 (peak/trough) and pass-2 (v) extraction points, found ${convertCalls.length} call(s)`);
  assert.doesNotMatch(code, /historySource\(country\)[\s\S]*historySource\(country\)/, "must resolve historySource once and reuse it, not re-derive a second (possibly-inconsistent) convert closure");
});
