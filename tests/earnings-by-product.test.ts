import { test } from "node:test";
import assert from "node:assert/strict";
import type { ItemSale, TagDay } from "../src/lib/earnings/core";
import { trimCatalog } from "../src/lib/earnings/product-clicks";
import {
  clicksBySlug,
  looksLikeGame,
  productEarnings,
  productMatcher,
  retailerNetwork,
  setIndex,
  slugOfPath,
  type CatalogProduct,
  type SiteProductClicks,
} from "../src/lib/earnings/product-earnings";

// Earnings, sales and clicks by product and set for DexCompare and MTG Compare (owner, 2026-11-26).

const today = "2026-11-26";
const MTG: CatalogProduct[] = [
  { slug: "final-fantasy-play-booster-box", name: "Final Fantasy Play Booster Box", type: "Play Booster Box", setCode: "fin" },
  { slug: "final-fantasy-collector-booster-box", name: "Final Fantasy Collector Booster Box", type: "Collector Booster Box", setCode: "fin" },
  { slug: "final-fantasy-collector-booster-box-case", name: "Final Fantasy Collector Booster Box Case", type: "Collector Booster Box Case", setCode: "fin" },
  { slug: "final-fantasy-bundle", name: "Final Fantasy Bundle", type: "Bundle", setCode: "fin" },
  { slug: "edge-of-eternities-play-booster-box", name: "Edge of Eternities Play Booster Box", type: "Play Booster Box", setCode: "eoe" },
  { slug: "duskmourn-commander-deck-miracle-worker", name: "Duskmourn: House of Horror Commander Deck - Miracle Worker", type: "Commander Deck", setCode: "dsk" },
  { slug: "duskmourn-play-booster-box", name: "Duskmourn: House of Horror Play Booster Box", type: "Play Booster Box", setCode: "dsk" },
  { slug: "secret-lair-april-fools", name: "Secret Lair Drop: April Fools", type: "Secret Lair Drop", setCode: null },
];

test("a sale is matched to the one product whose every word it names; a tie or a near fit is no match", () => {
  const m = productMatcher("mtg", MTG);
  assert.equal(m.match("MTG Final Fantasy Play Booster Box Factory Sealed 30 Packs")?.slug, "final-fantasy-play-booster-box");
  assert.equal(m.match("Magic the Gathering FINAL FANTASY Collector Booster Box - English")?.slug, "final-fantasy-collector-booster-box");
  assert.equal(m.match("Final Fantasy Collector Booster Box Case (4 boxes)")?.slug, "final-fantasy-collector-booster-box-case", "the longer name wins");
  assert.equal(m.match("Duskmourn House of Horror Commander Deck Miracle Worker")?.slug, "duskmourn-commander-deck-miracle-worker");
  assert.equal(m.match("Final Fantasy Booster Box"), null, "play or collector is not said: no product names every word");
  assert.equal(m.match("Pokemon Prismatic Evolutions Elite Trainer Box"), null);
});

test("sets come from the catalogue's set codes, labelled by the shortest name; no code groups by product type", () => {
  const s = setIndex("mtg", MTG);
  assert.equal(s.get("final-fantasy-collector-booster-box-case")?.label, "Final Fantasy");
  assert.equal(s.get("final-fantasy-bundle")?.key, "code:fin");
  assert.equal(s.get("duskmourn-commander-deck-miracle-worker")?.label, "Duskmourn");
  assert.equal(s.get("secret-lair-april-fools")?.label, "No set · Secret Lair Drop");
});

test("click helpers: product page paths, retailer values to networks", () => {
  assert.equal(slugOfPath("/us/p/final-fantasy-bundle"), "final-fantasy-bundle");
  assert.equal(slugOfPath("/au/p/final-fantasy-bundle?x=1"), "final-fantasy-bundle");
  assert.equal(slugOfPath("/us/sealed"), null);
  assert.equal(slugOfPath("/"), null);
  assert.equal(retailerNetwork("TCGplayer"), "tcgplayer");
  assert.equal(retailerNetwork("eBay (ebay.com.au)"), "ebay");
  assert.equal(retailerNetwork("Amazon AU"), "amazon");
  assert.equal(retailerNetwork("Card Kingdom (US)"), null);
  const c = clicksBySlug({ "/us/p/a": 3, "/au/p/a": 2, "/us/sealed": 4 });
  assert.equal(c.slugs.get("a"), 5);
  assert.equal(c.offProduct, 4);
  assert.equal(c.total, 9);
  assert.equal(looksLikeGame("dex", "Pokémon TCG Surging Sparks Booster Box"), true);
  assert.equal(looksLikeGame("mtg", "Pokémon TCG Surging Sparks Booster Box"), false);
});

test("the catalogue is trimmed to slug, name, type and set code", () => {
  assert.deepEqual(trimCatalog([{ id: "x", slug: "a", name: "A Box", productType: "Box", setCode: null, imageUrl: "u" }, { slug: "", name: "no slug" }, null]), [{ slug: "a", name: "A Box", type: "Box" }]);
  assert.deepEqual(trimCatalog({ not: "a list" }), []);
});

const sale = (p: Partial<ItemSale>): ItemSale => ({ network: "ebay", day: "2026-11-20", tag: "mtg-us-product-table", name: "", qty: 1, saleCents: 0, cents: 0, currency: "AUD", orders: 1, ...p });
const tag = (p: Partial<TagDay>): TagDay => ({ day: "2026-11-20", tag: "", currency: "AUD", cents: 0, pendingCents: 0, sales: 1, ...p });
const clicks = (p: Partial<SiteProductClicks> = {}): SiteProductClicks => ({
  site: "mtg",
  status: "ok",
  fetchedAt: 0,
  from: "2026-10-28",
  to: today,
  byPath: { "/us/p/final-fantasy-play-booster-box": 10, "/au/p/final-fantasy-play-booster-box": 2, "/us/p/edge-of-eternities-play-booster-box": 5, "/us/sealed": 7 },
  byNetwork: {
    tcgplayer: { "/us/p/final-fantasy-play-booster-box": 6, "/us/sealed": 3 },
    ebay: { "/us/p/final-fantasy-play-booster-box": 4, "/us/p/edge-of-eternities-play-booster-box": 3 },
    amazon: { "/au/p/final-fantasy-play-booster-box": 2 },
  },
  retailers: { TCGplayer: 9, "eBay (ebay.com)": 7, "Amazon AU": 2 },
  byProduct: {},
  catalog: MTG,
  catalogStatus: "ok",
  ...p,
});

test("the view: this site's tagged sales by product and set, TCGplayer and eBay apart, with clicks and the gaps", () => {
  const items: ItemSale[] = [
    sale({ name: "MTG Final Fantasy Play Booster Box Sealed", cents: 500, saleCents: 25000 }),
    sale({ network: "tcgplayer", tag: "mtg-us-quickview-table", name: "Final Fantasy - Play Booster Box", cents: 800, saleCents: 20000, currency: "USD" }),
    sale({ name: "Final Fantasy Collector Booster Box", cents: 1200, day: "2026-11-25" }),
    sale({ name: "Some Magic Lot of 1000 Cards", cents: 100 }),
    sale({ tag: "dex-us-product-table", name: "Pokemon Surging Sparks Booster Box", cents: 999 }),
    sale({ tag: "", name: "Magic the Gathering Edge of Eternities Play Booster Box", cents: 300 }),
    sale({ name: "Final Fantasy Bundle", cents: 50, day: "2026-09-01" }),
    sale({ network: "amazon", tag: "", name: "Final Fantasy Bundle", cents: 70 }),
  ];
  const tags = {
    ebay: [tag({ tag: "mtg-us-product-table", cents: 2000, sales: 4 }), tag({ tag: "", cents: 900, sales: 3 }), tag({ tag: "dex-us-x", cents: 999 })],
    tcgplayer: [tag({ tag: "mtg-us-quickview-table", cents: 800, currency: "USD" })],
  };
  const v = productEarnings({ site: "mtg", items, tags, clicks: clicks(), range: "30d", today, display: "USD" });
  const ff = v.products.find((r) => r.slug === "final-fantasy-play-booster-box")!;
  assert.equal(ff.ebay.orders, 1);
  assert.equal(ff.tcgplayer.orders, 1);
  assert.equal(ff.tcgplayer.cents, 800);
  assert.equal(ff.tcgplayer.clicks, 6);
  assert.equal(ff.ebay.clicks, 4);
  assert.equal(ff.amazonClicks, 2);
  assert.equal(ff.allClicks, 12, "every region's page of the product");
  assert.equal(ff.set, "Final Fantasy");
  assert.ok(!v.products.some((r) => /surging/i.test(r.name)), "another site's sale is not here");
  assert.ok(!v.products.some((r) => r.slug === "final-fantasy-bundle" && r.ebay.orders), "a sale older than 30 days is not here");
  const lot = v.products.find((r) => r.name === "Some Magic Lot of 1000 Cards")!;
  assert.equal(lot.slug, null, "unmatched, listed under its own title");
  assert.equal(v.gaps.unmatchedOrders, 1);
  const fin = v.sets.find((s) => s.setKey === "code:fin")!;
  assert.equal(fin.ebay.orders, 2);
  assert.equal(fin.tcgplayer.orders, 1);
  assert.equal(v.sets[0].setKey, "code:fin", "sets by earnings");
  assert.equal(v.gaps.untagged.ebay.sales, 3);
  assert.equal(v.gaps.untagged.ebay.gameSales, 1, "the untagged Magic sale is a gap, never this site's");
  assert.equal(v.gaps.taggedSales.ebay, 4);
  assert.equal(v.gaps.itemOrders.ebay, 3);
  assert.equal(v.gaps.clicksOffProduct, 7);
  assert.deepEqual(v.gaps.netClicks.tcgplayer, { onProduct: 6, total: 9 });
  assert.equal(v.totals.amazonClicks, 2);
});

test("a per-network query Vercel refused leaves that network's clicks unknown, not zero; no clicks at all still shows sales", () => {
  const v = productEarnings({ site: "mtg", items: [sale({ name: "Final Fantasy Bundle", cents: 50 })], tags: { ebay: [], tcgplayer: [] }, clicks: clicks({ byNetwork: { tcgplayer: null, ebay: null, amazon: null } }), range: "30d", today, display: "AUD" });
  assert.equal(v.gaps.netClicks.ebay, null);
  assert.equal(v.products.find((r) => r.slug === "final-fantasy-play-booster-box")?.allClicks, 12);
  const none = productEarnings({ site: "mtg", items: [sale({ name: "Final Fantasy Bundle", cents: 50 })], tags: { ebay: [], tcgplayer: [] }, clicks: null, range: "30d", today, display: "AUD" });
  assert.equal(none.products.length, 1);
  assert.equal(none.products[0].slug, null, "without the catalogue a sale cannot be matched");
  assert.equal(none.gaps.clicksTotal, null);
});

test("DexCompare's buy_product clicks land on their product", () => {
  const dex: CatalogProduct[] = [{ slug: "surging-sparks-booster-box", name: "Surging Sparks Booster Box", type: "Booster Box", setCode: "sv8" }];
  const v = productEarnings({
    site: "dex",
    items: [sale({ tag: "dex-us-product-table", name: "Pokemon TCG Surging Sparks Booster Box 36 Packs", cents: 400 })],
    tags: { ebay: [], tcgplayer: [] },
    clicks: clicks({ site: "dex", catalog: dex, byPath: {}, byNetwork: { tcgplayer: {}, ebay: {}, amazon: {} }, byProduct: { "surging-sparks-booster-box": 9 } }),
    range: "30d",
    today,
    display: "AUD",
  });
  assert.equal(v.products.length, 1);
  assert.equal(v.products[0].productClicks, 9);
  assert.equal(v.products[0].ebay.orders, 1);
  assert.equal(v.products[0].set, "Surging Sparks");
});
