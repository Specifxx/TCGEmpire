import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPromoProduct, type TcgProduct } from "../src/lib/tcgplayer";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: "the box ev calc is severely wrong. the rare cards are
// severely overpriced". Root cause traced on live production: TCGplayer's
// "Riftbound Organized Play Promotional Cards" set sells event-exclusive metal
// reprints — e.g. a metal "Ahri, Nine-Tailed Fox" (Prize Wall / Best Of) — that
// carry the SAME collector number as the real booster-pack card ("255/298"),
// because physically they depict the same card. buildTcgplayerRows() matched
// products to cards by set+number alone, so the metal promo resolved to the
// exact same cardId as the real card — and since two products colliding on one
// key keeps whichever has the HIGHER market price (a rule built for the
// English-vs-Chinese-duplicate case, see the file's own header comment), the
// promo's four-figure metal-card price overwrote the real card's every time:
// Ahri, Nine-Tailed Fox (OGN 255/298) showed US$4,424.74 on /tools/box-ev
// against a real cheapest-store price of US$2.62; Teemo, Swift Scout (OGN
// 263/298) showed US$4,400.00 against a real US$0.34. Averaged into the
// "Rare" pool across a whole set, a handful of these is exactly what turns a
// calculator's rare-tier average "severely" wrong rather than a rounding blip.
// ─────────────────────────────────────────────────────────────────────────────

const mkProduct = (setName: string, productName = "Some Card"): TcgProduct => ({
  productId: 1,
  productName,
  productUrlName: "some-card",
  setUrlName: "some-set",
  productLineUrlName: "riftbound-league-of-legends-trading-card-game",
  setName,
  marketPrice: null,
  lowestPrice: null,
  foilOnly: false,
  sealed: false,
});

test("isPromoProduct flags TCGplayer's Organized Play Promotional Cards set", () => {
  assert.ok(isPromoProduct(mkProduct("Riftbound Organized Play Promotional Cards")));
  assert.ok(isPromoProduct(mkProduct("Organized Play Promotional Cards")));
  // Case-insensitive and tolerant of the exact spacing TCGplayer might use.
  assert.ok(isPromoProduct(mkProduct("riftbound organized  play promotional cards")));
});

test("isPromoProduct leaves every real set name alone", () => {
  for (const setName of ["Origins", "Spiritforged", "Unleashed", "Proving Grounds", "Vendetta", "Radiance"]) {
    assert.equal(isPromoProduct(mkProduct(setName)), false, `${setName} must not be flagged as a promo product`);
  }
});

test(
  "buildTcgplayerRows() never resolves a promo product via set+number — only an explicit externalId link",
  () => {
    const src = readCode("src/lib/tcgplayer.ts");
    const scAt = src.indexOf("const sc = isPromoProduct(p) ? null : setFromTotal(total);");
    assert.ok(
      scAt >= 0,
      "expected the set+number match to be gated behind isPromoProduct(p), same treatment as the set-less rune fallback a few lines below",
    );
  },
);

test("the promo-collision fix landed BEFORE the higher-price-wins collision rule, not after", () => {
  // Order matters: if isPromoProduct() were checked after `best.set(...)` already
  // ran, the promo's price would already have clobbered the real card's by the
  // time anyone looked at it.
  const src = readCode("src/lib/tcgplayer.ts");
  const scAt = src.indexOf("const sc = isPromoProduct(p)");
  const bestSetAt = src.indexOf("if (!prev || marketForCompare > prev.market) best.set(");
  assert.ok(scAt >= 0 && bestSetAt >= 0 && scAt < bestSetAt);
});

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly again, months later: "box ev calc feature is significantly
// wrong... need to use TCGPlayer market price so that we have at least 98% of
// cards populated". Different root cause from the incident above — this time
// coverage, not a price-inflation outlier. Traced on live production: run
// 33636059799 hit a transient 502 on page 10 of TCGplayer's paginated search
// (from=450) and fetchTcgplayerProducts()'s per-page catch just `break`d,
// silently returning the 450 products it had so far as if that were the whole
// catalogue. refreshTcgplayerPrices() had no way to tell "the catalogue is
// really this small" apart from "the fetch gave up early" — its only gate was
// `rows.length === 0` — so it happily deleteMany()'d a complete prior
// catalogue and replaced it with the 431 cards that fetch matched (down from
// 1,244 on a clean run two days earlier). /tools/box-ev reads ONLY this table,
// so every pool's "N/total priced" collapsed toward "— understated" with
// nothing in CI or the logs surfacing it: the very next run's own summary line
// even read "TCGplayer (US): 2,155 products, 0 unmatched" — actually the SUM
// of that same degraded 431-row fetch written across all 5 currency markets,
// mislabelled as if it were 2,155 distinct, fully-matched US products.
// ─────────────────────────────────────────────────────────────────────────────

test("a page that fails is retried before the fetch gives up on it", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  assert.ok(
    src.includes("async function fetchPageRetrying("),
    "expected a retry wrapper around fetchPage — a single transient 403/502 must not truncate the whole catalogue",
  );
  // Both product fetchers must go through the retrying wrapper, not the raw
  // one-shot fetchPage — including page 0, which used to have NO retry at all
  // (see run 33685886911: a bare 403 on page 0 killed the entire refresh).
  const productsAt = src.indexOf("export async function fetchTcgplayerProducts()");
  const sealedAt = src.indexOf("export async function fetchTcgplayerSealed()");
  assert.ok(productsAt >= 0 && sealedAt >= 0);
  const productsBody = src.slice(productsAt, sealedAt);
  const sealedBody = src.slice(sealedAt);
  for (const [name, body] of [["fetchTcgplayerProducts", productsBody], ["fetchTcgplayerSealed", sealedBody]] as const) {
    assert.ok(!/\bfetchPage\(/.test(body), `${name} must call fetchPageRetrying, not the raw fetchPage, for every page`);
    assert.ok(body.includes("fetchPageRetrying("), `${name} must call fetchPageRetrying`);
  }
});

test("refreshTcgplayerPrices refuses to replace existing rows with a much smaller set", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const fnAt = src.indexOf("export async function refreshTcgplayerPrices()");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt);
  const countAt = body.indexOf("prisma.retailerPrice.count(");
  const floorAt = body.indexOf("rows.length < existing * COVERAGE_DROP_FLOOR");
  const deleteAt = body.indexOf("prisma.retailerPrice.deleteMany(");
  assert.ok(countAt >= 0, "expected refreshTcgplayerPrices to check the EXISTING row count before writing");
  assert.ok(floorAt >= 0, "expected a coverage-drop comparison against the existing count");
  assert.ok(deleteAt >= 0);
  // Ordering matters exactly like the promo-collision fix above: the guard is
  // worthless if the destructive delete already ran by the time it's checked.
  assert.ok(countAt < floorAt && floorAt < deleteAt, "the coverage-drop guard must run BEFORE deleteMany, not after");
});

test("the TCGplayer (US) import summary reports the US market's own row count, not the 5-market sum", () => {
  // `written` sums rows across US/UK/SG/AU/CA, which all reuse ONE product
  // fetch — reporting that sum under a "TCGplayer (US)" label is exactly what
  // hid the degraded run above behind a healthy-looking "2,155 products"
  // instead of the real "431 matched in the US market".
  const src = readCode("src/lib/price-import.ts");
  assert.ok(src.includes("byCountry.US"), "expected the (US) summary line to read byCountry.US specifically");
});
