import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEX_REGION,
  dexHomeHref,
  dexHref,
  dexLinkFor,
  dexOpen,
  dexSetSlug,
  dexTileFigures,
  parseDexIndex,
  storePriceCents,
  tcgplayerIdFromImage,
  type DexMarket,
} from "../src/lib/pokemon/dexcompare";
import { copyViolations } from "./helpers/pokemon-copy";

// DexCompare's browse index rows, as /api/browse/au served them on 2026-10-15
// (CompactCard: slug, name, type, setCode, img, price, inStock, listed, marketplace, median).
const AU = {
  v: 1,
  region: "au",
  checkedAt: "2026-10-15T01:20:00.000Z",
  rows: [
    ["delta-reign-booster-box", "Delta Reign Booster Box", "Booster Box", "me6", "https://tcgplayer-cdn.tcgplayer.com/product/712094_in_1000x1000.jpg", 33500, 8, 17, 0, 36000],
    ["surging-sparks-elite-trainer-box", "Surging Sparks Elite Trainer Box", "Elite Trainer Box", "sv8", "https://tcgplayer-cdn.tcgplayer.com/product/565630_in_1000x1000.jpg", null, 0, 5, 0, null],
    ["shopify-only-tin", "Some Tin", "Tin", "sv8", "~abc/products/tin.jpg", 2995, 3, 3, 0, null],
    ["champion-s-path-elite-trainer-box", "Champion's Path ETB", "Elite Trainer Box", "swsh35", "https://tcgplayer-cdn.tcgplayer.com/product/219005_in_1000x1000.jpg", 9900, 2, 4, 0, 10000],
    ["no-image-collection", "A collection", "Collection", "sv8", null, 1999, 1, 1, 0, null],
    ["delta-reign-duplicate", "Dup", "Booster Box", "me6", "https://tcgplayer-cdn.tcgplayer.com/product/712094_in_1000x1000.jpg", 1, 1, 1, 0, null],
    "not a row",
  ],
};

const au = (): DexMarket => parseDexIndex(AU, "AU");

test("the TCGplayer productId is read from a TCGplayer CDN image only", () => {
  assert.equal(tcgplayerIdFromImage("https://tcgplayer-cdn.tcgplayer.com/product/712094_in_1000x1000.jpg"), 712094);
  assert.equal(tcgplayerIdFromImage("https://tcgplayer-cdn.tcgplayer.com/product/565630_200w.jpg"), 565630);
  assert.equal(tcgplayerIdFromImage("~abc/products/tin.jpg"), null);
  assert.equal(tcgplayerIdFromImage(null), null);
});

test("parseDexIndex keys rows by TCGplayer id, first row wins, counts every in-stock product", () => {
  const m = au();
  assert.equal(m.market, "AU");
  assert.equal(m.checkedAt, AU.checkedAt);
  assert.deepEqual(m.byId["712094"], ["delta-reign-booster-box", 33500, 8, 17, 0]);
  assert.deepEqual(m.byId["565630"], ["surging-sparks-elite-trainer-box", null, 0, 5, 0]);
  assert.equal(Object.keys(m.byId).length, 3, "rows without a TCGplayer image are not joinable");
  assert.equal(m.inStockProducts, 5, "the in-stock count covers every row, joinable or not");
});

test("parseDexIndex refuses another version, another region, or an empty index", () => {
  assert.throws(() => parseDexIndex({ ...AU, v: 2 }, "AU"), /version/);
  assert.throws(() => parseDexIndex(AU, "US"), /region/);
  assert.throws(() => parseDexIndex({ ...AU, rows: [] }, "AU"), /no rows/);
  assert.throws(() => parseDexIndex({ ...AU, rows: [AU.rows[2]] }, "AU"), /TCGplayer id/);
  assert.throws(() => parseDexIndex(null, "AU"));
});

test("a joined product links its DexCompare page; an unjoined one its set, only when DexCompare has the set", () => {
  const m = au();
  const set = { slug: "delta-reign", name: "Delta Reign" };
  assert.deepEqual(dexLinkFor(m, { id: 712094, set }), {
    kind: "product",
    slug: "delta-reign-booster-box",
    cents: 33500,
    inStock: 8,
    listed: 17,
    marketplace: false,
    checkedAt: AU.checkedAt,
  });
  // A half box: not joined, so the set.
  assert.deepEqual(dexLinkFor(m, { id: 712095, set }), { kind: "set", setSlug: "delta-reign", setName: "Delta Reign" });
  // A set DexCompare has nothing of in this market: no link at all.
  assert.equal(dexLinkFor(m, { id: 1, set: { slug: "first-partner-collection-2026", name: "First Partner Collection 2026" } }), null);
  assert.equal(dexLinkFor(m, { id: 1, set: null }), null);
  assert.equal(dexLinkFor(null, { id: 712094, set }), null);
});

test("set slugs that differ between the two sites are mapped", () => {
  const m = au();
  assert.equal(dexSetSlug(m, "champions-path"), "champion-s-path");
  assert.equal(dexSetSlug(m, "surging-sparks"), "surging-sparks");
  assert.equal(dexSetSlug(m, "sword-shield-base-set"), null, "mapped, but DexCompare lists nothing of it in this fixture");
});

test("a set is linked only when DexCompare has a page for it, whatever its product slugs look like", () => {
  // DexCompare's US index names collection products from their titles: these exist, /us/sets/first-partner-collection-2026 does not.
  const m = parseDexIndex(
    {
      ...AU,
      rows: [["first-partner-collection-2026-series-1-booster-pack-2", "FPC", "Booster Pack", null, "https://tcgplayer-cdn.tcgplayer.com/product/700001_in_1000x1000.jpg", 499, 2, 3, 0, null]],
    },
    "AU",
  );
  assert.equal(dexSetSlug(m, "first-partner-collection-2026"), null);
});

test("a price is a store's only when a store has it and TCGplayer is not in DexCompare's figure", () => {
  assert.equal(storePriceCents({ cents: 2799, inStock: 3, marketplace: false }), 2799);
  assert.equal(storePriceCents({ cents: 2729, inStock: 5, marketplace: true }), null, "the US cheapest may be TCGplayer's");
  assert.equal(storePriceCents({ cents: 1700, inStock: 0, marketplace: true }), null);
  assert.equal(storePriceCents({ cents: null, inStock: 2, marketplace: false }), null);
});

test("the loader never passes an explicit cache option to fetch (it throws inside an ISR render's unstable_cache)", () => {
  const src = readFileSync("src/lib/pokemon/dexcompare-data.ts", "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /cache:\s*["']no-store["']/);
  assert.doesNotMatch(src, /\bcache:\s*["']/);
});

test("tile figures and the open rule follow DexCompare's own (a store in stock, or TCGplayer in the US)", () => {
  const m = au();
  assert.deepEqual(dexTileFigures(m, 712094), { cents: 33500, inStock: 8, listed: 17, marketplace: false });
  assert.equal(dexTileFigures(m, 1), null);
  assert.equal(dexOpen({ cents: 33500, inStock: 8, marketplace: false }), true);
  assert.equal(dexOpen({ cents: null, inStock: 0, marketplace: false }), false);
  assert.equal(dexOpen({ cents: 4999, inStock: 0, marketplace: true }), true);
});

test("links go to the visitor's market on DexCompare, tagged by surface", () => {
  assert.equal(
    dexHref("UK", { kind: "product", slug: "x-booster-box", cents: 1, inStock: 1, listed: 1, marketplace: false, checkedAt: null }, "product"),
    "https://www.dexcompare.app/uk/p/x-booster-box?utm_source=riftcompare&utm_medium=referral&utm_campaign=pkmn-product",
  );
  assert.equal(
    dexHref("EU", { kind: "set", setSlug: "surging-sparks", setName: "Surging Sparks" }, "quickview"),
    "https://www.dexcompare.app/eu/sets/surging-sparks?utm_source=riftcompare&utm_medium=referral&utm_campaign=pkmn-quickview",
  );
  assert.equal(dexHomeHref("SG", "subnav"), "https://www.dexcompare.app/sg?utm_source=riftcompare&utm_medium=referral&utm_campaign=pkmn-subnav");
  assert.deepEqual(Object.keys(DEX_REGION).sort(), ["AU", "CA", "EU", "SG", "UK", "US"]);
});

test("the DexCompare surfaces follow the section's copy rules", () => {
  for (const f of [
    "src/lib/pokemon/dexcompare.ts",
    "src/components/pokemon/DexStores.tsx",
    "src/components/pokemon/HomeStoresBand.tsx",
  ]) {
    assert.deepEqual(copyViolations(readFileSync(f, "utf8"), f), []);
  }
});

test("every DexCompare link is nofollow and opens in a new tab", () => {
  const src = readFileSync("src/components/pokemon/DexStores.tsx", "utf8");
  assert.match(src, /rel=\{DEX_REL\}/);
  assert.doesNotMatch(src, /rel="noopener"/);
});
