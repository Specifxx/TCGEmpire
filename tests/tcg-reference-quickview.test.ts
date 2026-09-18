import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { tcgReferenceRows, type TcgRefRow } from "../src/lib/tcg-reference";

// THE TCGPLAYER REFERENCE PRICE IN THE CARD POPUP.
//
// Asked for directly: "add TCGplayer reference price to the actual cards pop ups".
// The full card page has carried this block for months; the QuickView modal —
// where most visitors actually compare prices, since it opens from every tile —
// showed no TCGplayer figure at all.
//
// THE CONSTRAINT THAT SHAPES THE WHOLE CHANGE is constants.ts's "THE RULE": a
// converted TCGplayer price is a reference value, never a comparison row.
// TCGplayer's AU/UK/SG/CA figures are its single USD market price run through an
// FX rate — nobody can buy from "TCGplayer Australia", the price excludes
// international postage and duty, and letting it into the list would undercut
// the real local stores the site exists to compare. So the tests below pin the
// SEPARATION as hard as they pin the feature.
//
// AND THE SELECTION RULE IS SHARED, NOT COPIED. It was wrong once already in
// CardMarketSection — a hand-listed `tcgplayer | tcgplayer_uk | tcgplayer_sg`
// that suppressed the block for UK and SG visitors even though their converted
// row is never rendered, so those markets saw no TCGplayer price anywhere. A
// second copy in the popup is how that recurs; lib/tcg-reference.ts is the one
// copy and both callers are pinned to it here.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Comments out, code in — line comments FIRST (see tests/card-type-seo.test.ts
// for the 58KB-swallowing reason), and the `[^:]` guard keeps "https://" intact.
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const QUICKVIEW = "src/components/QuickView.tsx";
const SECTION = "src/components/CardMarketSection.tsx";

const row = (over: Partial<TcgRefRow> = {}): TcgRefRow => ({
  retailer: "tcgplayer",
  country: "US",
  priceCents: 1234,
  isFoil: false,
  ...over,
});

// ── 1. Which markets get the block ─────────────────────────────────────────

test("every market with a converted row quotes the USD row instead of it", () => {
  // AU, UK, SG and CA each get a `tcgplayer_<market>` row written by the price
  // importer. Every one is in ALL_FALLBACK_RETAILERS, so the comparison strips
  // it and the reference block is purely additive. Verified against the live
  // /api/card response, which carries exactly these four plus the USD row.
  for (const country of ["AU", "UK", "SG", "CA"]) {
    const rows = [
      row(),
      row({ retailer: `tcgplayer_${country.toLowerCase()}`, country, priceCents: 9999 }),
    ];
    const ref = tcgReferenceRows(rows, country);
    assert.ok(ref, `${country} must get a reference block`);
    assert.equal(ref.std?.priceCents, 1234, `${country} must quote the USD row, not the converted one`);
  }
});

test("the EU has no TCGplayer row at all, and still gets the block", () => {
  // The EU's reference source is Cardmarket (CARDMARKET_EU_RETAILER), not a
  // converted TCGplayer row — the importer writes no `tcgplayer_eu`. So nothing
  // is suppressed and the USD row carries it, which is why the predicate asks
  // "is TCGplayer in this market's table?" rather than "does a fallback exist?".
  const rows = [row(), row({ retailer: "cardmarket_eu", country: "EU", priceCents: 8888 })];
  const ref = tcgReferenceRows(rows, "EU");
  assert.ok(ref);
  assert.equal(ref.std?.priceCents, 1234);
});

test("the US is suppressed — its TCGplayer row is already in the comparison table", () => {
  // Also the case that protects TcgMarketPrice's copy, which says "converted to
  // {cur} at an approximate rate": for a US visitor that sentence would read
  // "converted to USD", about a number that was never converted.
  assert.equal(tcgReferenceRows([row()], "US"), null);
  assert.equal(tcgReferenceRows([row(), row({ isFoil: true, priceCents: 5000 })], "US"), null);
});

test("a market whose TCGplayer row is genuinely buyable is suppressed too", () => {
  // The predicate asks "is it in the table?", not "is it the US?" — so a future
  // market where TCGplayer lists natively needs no code change here.
  const rows = [row(), row({ retailer: "tcgplayer_nz", country: "NZ", priceCents: 4242 })];
  // tcgplayer_nz is not in ALL_FALLBACK_RETAILERS, so it is a real row.
  assert.equal(tcgReferenceRows(rows, "NZ"), null);
});

// ── 2. No row, no block ────────────────────────────────────────────────────

test("no USD row means no block, which is also the intl-disabled case", () => {
  // With intl off the API hard-filters to one country, so the US row never
  // reaches the client. That must degrade to "no block", not to quoting a
  // converted row as if it were USD (TcgMarketPrice would convert it twice).
  assert.equal(tcgReferenceRows([row({ retailer: "tcgplayer_au", country: "AU" })], "AU"), null);
  assert.equal(tcgReferenceRows([], "AU"), null);
  assert.equal(tcgReferenceRows([row({ retailer: "somestore", country: "AU" })], "AU"), null);
});

test("a foil-only card still gets a block", () => {
  const ref = tcgReferenceRows([row({ isFoil: true, priceCents: 7700 })], "AU");
  assert.ok(ref);
  assert.equal(ref.std, null);
  assert.equal(ref.foil?.priceCents, 7700);
});

test("standard and foil are reported separately, never conflated", () => {
  const ref = tcgReferenceRows(
    [row({ priceCents: 500 }), row({ isFoil: true, priceCents: 2500 })],
    "AU",
  );
  assert.ok(ref);
  assert.equal(ref.std?.priceCents, 500);
  assert.equal(ref.foil?.priceCents, 2500);
});

// ── 3. The separation from the comparison list ─────────────────────────────

test("the popup still strips fallback retailers from its buyable list", () => {
  // The regression that would matter most: "show the TCGplayer price" quietly
  // becoming "let TCGplayer into the comparison", where it can undercut the
  // real AU/UK stores. This filter is the thing that must not move.
  const code = codeOnly(read(QUICKVIEW));
  assert.match(code, /\.filter\(\(p\) => !isFallbackRetailer\(p\.retailer\)\)/);
});

test("the reference block renders outside the price-comparison list", () => {
  const code = codeOnly(read(QUICKVIEW));
  const cmp = code.indexOf("Price comparison");
  const block = code.indexOf("<TcgMarketPrice");
  assert.ok(cmp > 0 && block > 0, "both surfaces must exist");
  assert.ok(block > cmp, "the reference must come after the comparison, not inside it");
  // Not inside the <ul> of rows: the rows map over `inStock`, which the filter
  // above has already emptied of fallback retailers.
  const list = code.slice(code.indexOf("inStock.slice(0, 6).map"), cmp + code.slice(cmp).indexOf("</ul>"));
  assert.doesNotMatch(list, /TcgMarketPrice/);
});

test("it carries its own affiliate disclosure rather than borrowing the list's", () => {
  const code = codeOnly(read(QUICKVIEW));
  const block = code.slice(code.indexOf("<TcgMarketPrice"), code.indexOf("<TcgMarketPrice") + 400);
  // `disclosure` defaults true in TcgMarketPrice; passing false here would be
  // the bug, because this block can render when the list above it is empty and
  // that list's disclosure is conditional on it being non-empty.
  assert.doesNotMatch(block, /disclosure=\{false\}/);
  assert.doesNotMatch(block, /disclosure=/, "leave the default on");
  const tcg = codeOnly(read("src/components/TcgMarketPrice.tsx"));
  assert.match(tcg, /disclosure = true/);
});

// ── 4. One copy of the rule ────────────────────────────────────────────────

test("both callers use the shared selector and neither re-implements it", () => {
  for (const f of [QUICKVIEW, SECTION]) {
    const code = codeOnly(read(f));
    assert.match(code, /tcgReferenceRows\(/, `${f} must call the shared selector`);
    // The hand-listed predicate that broke UK and SG must not reappear. Scoped
    // to the SUPPRESSION shape — `startsWith("tcgplayer")` on its own is also
    // how buyButtonLabel picks its wording, which is a legitimate other use.
    assert.doesNotMatch(
      code,
      /startsWith\("tcgplayer"\)[\s\S]{0,200}isFallbackRetailer/,
      `${f} must not re-implement the suppression predicate`,
    );
    assert.doesNotMatch(code, /"tcgplayer_uk"|"tcgplayer_sg"|"tcgplayer_au"|"tcgplayer_ca"/, `${f} must not hand-list market keys`);
  }
});

test("the popup quotes the USD row and wraps its own outbound link", () => {
  const code = codeOnly(read(QUICKVIEW));
  // The card page's MarketRow arrives pre-wrapped as buyHref; the popup holds a
  // raw url, so it must wrap it — an untagged TCGplayer link is lost commission.
  assert.match(code, /href: affiliateUrl\(src\.url, src\.retailer\)/);
  assert.match(codeOnly(read(SECTION)), /href: src\.buyHref/);
});

test("the shared selector reads the fallback list rather than naming markets", () => {
  const code = codeOnly(read("src/lib/tcg-reference.ts"));
  assert.match(code, /isFallbackRetailer/);
  // No market name may be hardcoded — that is what makes a new market safe.
  assert.doesNotMatch(code, /"AU"|"UK"|"SG"|"CA"|"EU"|"US"/);
});
