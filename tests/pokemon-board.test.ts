import test from "node:test";
import assert from "node:assert/strict";
import { allBoards, buildBoard, tileFigures } from "../src/lib/pokemon/board";
import { cmFigures, cmKey, matchCardmarket, cardmarketPokemonUrl } from "../src/lib/pokemon/cardmarket-match";
import { filterTiles, isFiltered, pageOf, parseBrowse, sortTiles, toDisplay } from "../src/lib/pokemon/browse";
import { pokemonFaq, sourceList } from "../src/lib/pokemon/copy";
import { convertCents } from "../src/lib/fx";
import type { PkOfferRow, PkTile } from "../src/lib/pokemon/types";

// What each market shows for one Pokémon product (lib/pokemon/board.ts), the
// Cardmarket matcher, the grid's filter/sort rules and the section's copy.

const NOW = Date.parse("2026-10-01T12:00:00Z");
const fresh = new Date(NOW - 3 * 3600_000).toISOString();
const stale = new Date(NOW - 80 * 3600_000).toISOString();
const row = (over: Partial<PkOfferRow>): PkOfferRow => ({
  market: "US",
  source: "tcgplayer",
  priceCents: 14349,
  currency: "USD",
  shippingCents: null,
  url: "https://www.tcgplayer.com/product/654136/x",
  title: null,
  inStock: true,
  checkedAt: fresh,
  ...over,
});
const ROWS: PkOfferRow[] = [
  row({}),
  row({ source: "tcgplayer_market", priceCents: 15213 }),
  row({ source: "ebay", priceCents: 13999, shippingCents: 0, url: "https://www.ebay.com/itm/1", title: "Pokemon PFL ETB" }),
  row({ market: "UK", source: "ebay", priceCents: 11999, currency: "GBP", shippingCents: null, url: "https://www.ebay.co.uk/itm/2" }),
  row({ market: "EU", source: "cardmarket", priceCents: 12900, currency: "EUR", url: cardmarketPokemonUrl(846744) }),
  row({ market: "EU", source: "cardmarket_trend", priceCents: 13450, currency: "EUR", url: cardmarketPokemonUrl(846744) }),
];
const OPTS = { page: "/pokemon/sealed/phantasmal-flames-elite-trainer-box", surface: "product", now: NOW };

test("US: TCGplayer and eBay ranked by item price, eBay in its price position, market price as a reference", () => {
  const b = buildBoard("Phantasmal Flames Elite Trainer Box", ROWS, "US", OPTS);
  assert.deepEqual(
    b.listings.map((l) => [l.source, l.priceCents]),
    [
      ["ebay", 13999],
      ["tcgplayer", 14349],
    ],
  );
  assert.equal(b.headline?.source, "ebay");
  assert.deepEqual(b.references.map((r) => [r.source, r.priceCents, r.converted]), [["tcgplayer_market", 15213, false]]);
  assert.match(b.listings[1].href, /^https:\/\/partner\.tcgplayer\.com\/.*sharedid=pkmn_tcgplayer-pokemon/, "TCGplayer through Impact, tagged pkmn");
  assert.match(b.listings[0].href, /customid=rc-us-pkmn_ebay-pokemon-product/, "eBay through EPN, tagged pkmn");
  assert.match(b.ebaySearch.href, /ebay\.com\/sch\/i\.html\?_nkw=Pokemon\+Phantasmal\+Flames\+Elite\+Trainer\+Box/);
  assert.match(b.ebaySearch.href, /customid=rc-us-pkmn-product-search/);
});

test("UK: its own eBay row, TCGplayer only as a converted reference, Cardmarket trend converted too", () => {
  const b = buildBoard("Phantasmal Flames Elite Trainer Box", ROWS, "UK", OPTS);
  assert.deepEqual(b.listings.map((l) => l.source), ["ebay"], "no US TCGplayer listing inside the UK comparison");
  assert.equal(b.listings[0].label, "eBay UK");
  assert.equal(b.currency, "GBP");
  const ref = b.references.find((r) => r.source === "tcgplayer_market");
  assert.equal(ref?.converted, true);
  assert.equal(ref?.priceCents, convertCents(15213, "USD", "GBP"));
  assert.equal(b.references.find((r) => r.source === "cardmarket_trend")?.converted, true);
  assert.match(b.ebaySearch.href, /ebay\.co\.uk/);
});

test("EU: Cardmarket in the comparison, its trend as a native reference; AU/CA/SG get no Cardmarket figure", () => {
  const eu = buildBoard("Phantasmal Flames Elite Trainer Box", ROWS, "EU", OPTS);
  assert.deepEqual(eu.listings.map((l) => [l.source, l.basis]), [["cardmarket", "Lowest listing, any language"]]);
  assert.deepEqual(eu.references.map((r) => [r.source, r.converted]), [
    ["tcgplayer_market", true],
    ["cardmarket_trend", false],
  ]);
  for (const m of ["AU", "CA", "SG"] as const) {
    const b = buildBoard("Phantasmal Flames Elite Trainer Box", ROWS, m, OPTS);
    assert.deepEqual(b.listings, [], m);
    assert.equal(b.headline, null, m);
    assert.deepEqual(b.references.map((r) => r.source), ["tcgplayer_market"], m);
  }
  assert.deepEqual(Object.keys(allBoards("x", ROWS, OPTS)).sort(), ["AU", "CA", "EU", "SG", "UK", "US"]);
});

test("a row past 72h is unknown, never the headline; a currency that is not the market's is refused", () => {
  const rows = [row({ priceCents: 9000, checkedAt: stale }), row({ source: "ebay", priceCents: 12000, url: "https://www.ebay.com/itm/9" }), row({ market: "UK", source: "ebay", currency: "USD" })];
  const us = buildBoard("x", rows, "US", OPTS);
  assert.equal(us.headline?.priceCents, 12000, "the stale cheaper row does not set the price");
  assert.equal(us.listings[us.listings.length - 1].priceCents, 9000, "unknown rows rank after open ones");
  assert.deepEqual(buildBoard("x", rows, "UK", OPTS).listings, []);
  assert.deepEqual(tileFigures(rows, "US", NOW), { lowCents: 12000, lowSource: "ebay", refCents: null, openCount: 1 });
});

test("Cardmarket: same product, different wording; ambiguous claims are dropped", () => {
  const ours = [
    { id: 1, name: "Phantasmal Flames Premium Checklane Blister [Blaziken]", kind: "blister" as const },
    { id: 2, name: "Phantasmal Flames Elite Trainer Box", kind: "etb" as const },
    { id: 3, name: "Phantasmal Flames Pokémon Center Elite Trainer Box (Exclusive)", kind: "pc-etb" as const },
    { id: 4, name: "Phantasmal Flames Booster Pack", kind: "booster-pack" as const },
    { id: 5, name: "Phantasmal Flames Sleeved Booster Pack", kind: "booster-pack" as const },
    { id: 6, name: "Delta Reign Half Booster Box", kind: "booster-box" as const },
    { id: 7, name: "Phantasmal Flames Single Pack Blister [Cottonee]", kind: "blister" as const },
  ];
  const theirs = [
    { idProduct: 101, name: "Phantasmal Flames: Blaziken Premium Checklane Blister", idExpansion: 6299 },
    { idProduct: 102, name: "Phantasmal Flames Elite Trainer Box", idExpansion: 6299 },
    { idProduct: 103, name: "Phantasmal Flames Pokémon Center Elite Trainer Box", idExpansion: 6299 },
    { idProduct: 104, name: "Phantasmal Flames Booster", idExpansion: 6299 },
    { idProduct: 105, name: "Phantasmal Flames Sleeved Booster", idExpansion: 6299 },
    { idProduct: 106, name: "Delta Reign Booster Box (18 Boosters)", idExpansion: 6400 },
    { idProduct: 107, name: "Phantasmal Flames: Cottonee 1-Pack Blister", idExpansion: 6299 },
    { idProduct: 108, name: "Phantasmal Flames 10 Elite Trainer Box Case", idExpansion: 6299 },
  ];
  assert.deepEqual(
    [...matchCardmarket(ours, theirs)].sort((a, b) => a[0] - b[0]),
    [
      [1, 101],
      [2, 102],
      [3, 103],
      [4, 104],
      [5, 105],
      [6, 106],
      [7, 107],
    ],
  );
  // Two of ours claiming one of theirs: neither gets it.
  const dup = matchCardmarket(
    [
      { id: 1, name: "Phantasmal Flames Elite Trainer Box", kind: "etb" },
      { id: 2, name: "Phantasmal Flames Elite Trainer Box", kind: "etb" },
    ],
    [{ idProduct: 102, name: "Phantasmal Flames Elite Trainer Box", idExpansion: 6299 }],
  );
  assert.equal(dup.size, 0);
  assert.equal(cmKey("Prismatic Evolutions: Vaporeon Mini Tin").kind, "tin");
  assert.deepEqual(cmFigures({ idProduct: 1, low: 10, trend: 100 }), { lowCents: null, trendCents: 10000 }, "an implausible low is dropped");
  assert.equal(cardmarketPokemonUrl(846744), "https://www.cardmarket.com/en/Pokemon/Products?idProduct=846744");
});

const tile = (over: Partial<PkTile>): PkTile => ({
  id: 1,
  slug: "x",
  name: "Phantasmal Flames Elite Trainer Box",
  kind: "etb",
  setSlug: "phantasmal-flames",
  setName: "Phantasmal Flames",
  series: "Mega Evolution",
  imageUrl: null,
  releasedOn: "2025-11-14",
  presale: false,
  lowCents: 14349,
  lowSource: "tcgplayer",
  refCents: 15213,
  openCount: 1,
  firstSeenAt: "2026-10-01T00:00:00Z",
  packCount: null,
  packCountFrom: null,
  perPackCents: null,
  ...over,
});

test("browse: parsing, filtering, featured order, paging and the UK euro display", () => {
  const q = parseBrowse({ q: " pfl etb ", type: "etb,nonsense", set: "phantasmal-flames", min: "100", instock: "1", sort: "bogus", page: "0" });
  assert.deepEqual(q, { q: "pfl etb", kinds: ["etb"], sets: ["phantasmal-flames"], minCents: 10000, maxCents: null, inStock: true, sort: "", page: 1 });
  assert.equal(isFiltered(parseBrowse({})), false);

  const tiles = [
    tile({ id: 1 }),
    tile({ id: 2, name: "Phantasmal Flames Booster Pack", kind: "booster-pack", lowCents: 899 }),
    tile({ id: 3, name: "Surging Sparks Booster Box", kind: "booster-box", setSlug: "surging-sparks", setName: "Surging Sparks", releasedOn: "2024-11-08", lowCents: null }),
    tile({ id: 4, name: "Paldea Collection [Fuecoco]", kind: "collection", setSlug: null, setName: null, releasedOn: "2023-01-06", lowCents: 20000 }),
  ];
  assert.deepEqual(filterTiles(tiles, parseBrowse({ q: "phantasmal pack" })).map((t) => t.id), [2]);
  assert.deepEqual(filterTiles(tiles, parseBrowse({ set: "other" })).map((t) => t.id), [4]);
  assert.deepEqual(filterTiles(tiles, parseBrowse({ instock: "1" })).map((t) => t.id), [1, 2, 4]);
  assert.deepEqual(sortTiles(tiles, "").map((t) => t.id), [1, 2, 3, 4], "newest release, boxes before packs");
  assert.deepEqual(sortTiles(tiles, "price_asc").map((t) => t.id), [2, 1, 4, 3], "unpriced last");
  assert.deepEqual(sortTiles(tiles, "price_desc").map((t) => t.id).at(-1), 3, "unpriced last both ways");
  assert.deepEqual(pageOf([1, 2, 3, 4, 5], 9, 2), { items: [5], page: 3, pages: 3 });
  const eur = toDisplay([tile({ lowCents: 10000, refCents: 20000 })], true)[0];
  assert.equal(eur.lowCents, convertCents(10000, "GBP", "EUR"));
});

test("copy names only the sources that exist, and makes no claim the site's rules forbid", () => {
  assert.equal(sourceList(["tcgplayer", "tcgplayer_market"]), "TCGplayer", "no eBay rows, so no eBay");
  assert.equal(sourceList(["tcgplayer", "cardmarket", "ebay"]), "TCGplayer, Cardmarket and eBay");
  const withCm = pokemonFaq(["tcgplayer", "cardmarket", "ebay"]).map((f) => `${f.q} ${f.a}`).join(" ");
  const without = pokemonFaq(["tcgplayer"]).map((f) => `${f.q} ${f.a}`).join(" ");
  assert.match(withCm, /Cardmarket/);
  assert.doesNotMatch(without, /Cardmarket/);
  assert.doesNotMatch(without, /checked in rotation/, "no eBay-tracking claim without eBay rows");
  for (const text of [withCm, without]) {
    assert.doesNotMatch(text, /(riftcompare|\bour\b|\bwe\b)[^.\n]{0,60}\b(real[- ]time|updated hourly|live lookups?)\b/i);
    assert.doesNotMatch(text, /(sold listings|completed sales)/i);
    assert.doesNotMatch(text, /\b(rank|sort)\w*\b[^.\n]{0,60}\b(delivered|total cost|shipping included)/i);
    assert.doesNotMatch(text, /money.?back|buyer protection|invest|will rise/i);
  }
});
