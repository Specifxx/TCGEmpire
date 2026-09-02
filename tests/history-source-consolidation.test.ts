import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { historySource } from "../src/lib/price-history";
import { convertCents } from "../src/lib/fx";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-02: CA and EU stopped getting their own PriceHistory rows. Every card
// they'd track already has a real, currently-tracked twin — US for CA, UK for
// EU — so a full second weekly snapshot of the whole catalogue for each of them
// was pure duplication: CAD and EUR prices a currency conversion away from a
// market already being written, at the full storage cost of an independently-
// tracked one. historySource() (price-history.ts) is the single place that
// knows this; every real PriceHistory reader in the codebase goes through it.
//
// Live current prices (Card.lowestPriceCentsCa/Eu) are completely untouched —
// CA and EU still get their own real store/eBay scrape every import. Only the
// HISTORY archive (charts, movers, the Index, portfolio, records, the
// predictor, the public API) is deduplicated.
// ─────────────────────────────────────────────────────────────────────────────

test("historySource redirects CA to US and EU to UK, converting back to the requested currency", () => {
  const ca = historySource("CA");
  assert.equal(ca.source, "US");
  assert.equal(ca.convert(10_000), convertCents(10_000, "USD", "CAD"), "must use the same USD->CAD rate fx.ts uses everywhere else");

  const eu = historySource("EU");
  assert.equal(eu.source, "UK");
  assert.equal(eu.convert(10_000), convertCents(10_000, "GBP", "EUR"), "must use the same GBP->EUR rate fx.ts uses everywhere else");
});

test("historySource passes AU/US/UK/SG straight through, unconverted", () => {
  for (const country of ["AU", "US", "UK", "SG"] as const) {
    const { source, convert } = historySource(country);
    assert.equal(source, country, `${country} tracks its own history — must not redirect`);
    for (const cents of [0, 1, 12_345, 999_999]) {
      assert.equal(convert(cents), cents, `${country}'s convert() must be a true no-op`);
    }
  }
});

test("price-import.ts no longer writes CA or EU PriceHistory rows, but still writes their live current prices", () => {
  const code = codeOnly(read("src/lib/price-import.ts"));
  // The snapshot-write loop's 4 surviving pushes (AU/US/UK/SG only).
  assert.match(code, /rows\.push\(\{ cardId: c\.id, country: "AU", day, lowestPriceCents: au \}\)/);
  assert.match(code, /rows\.push\(\{ cardId: c\.id, country: "US", day, lowestPriceCents: us \}\)/);
  assert.match(code, /rows\.push\(\{ cardId: c\.id, country: "UK", day, lowestPriceCents: uk \}\)/);
  assert.match(code, /rows\.push\(\{ cardId: c\.id, country: "SG", day, lowestPriceCents: sg \}\)/);
  // No push for CA or EU survives ANYWHERE in the file — not just the snapshot
  // block, the whole file — since a resurrected line anywhere would silently
  // undo the storage saving this change exists for.
  assert.doesNotMatch(code, /rows\.push\(\{ cardId: c\.id, country: "CA"/, "CA must never be pushed into the snapshot batch");
  assert.doesNotMatch(code, /rows\.push\(\{ cardId: c\.id, country: "EU"/, "EU must never be pushed into the snapshot batch");
  // Live current prices are a SEPARATE, untouched code path — both CA and EU
  // still get written to the Card table on every import.
  assert.match(code, /lowestPriceCentsCa:\s*nCa/, "CA's live current price must still update every import");
  assert.match(code, /lowestPriceCentsEu:\s*nEu/, "EU's live current price must still update every import");
});

// ── Every real PriceHistory reader must resolve through historySource ────────
// (market-index.ts's computeRegionIndex is pinned in market-index-restore.test.ts
// already, alongside the chain-linking it was changed in the same pass as.)

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

test("rise-predictor.ts's single-market scope resolves through historySource, GLOBAL is left alone", () => {
  const code = codeOnly(read("src/lib/rise-predictor.ts"));
  assert.match(code, /import\s*\{[^}]*historySource[^}]*\}\s*from\s*"\.\/price-history"/);
  assert.match(
    code,
    /country:\s*scope === "GLOBAL" \? \{ in: KNOWN_COUNTRIES \} : historySource\(scope\)\.source/,
    "GLOBAL keeps reading every real per-country row (it already picks whichever market has the most points); only the single-scope path redirects"
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
