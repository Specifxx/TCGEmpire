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
