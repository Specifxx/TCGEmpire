import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pokemonEbayQuery, pokemonSetEbayQuery } from "../src/lib/pokemon/ebay-query";
import {
  bestEbayMatch,
  distinctiveTokens,
  mentionsOtherSet,
  parseBrowseItem,
  pickEbayWork,
  pokemonEbayBudget,
  rejectReason,
  type EbayItemLite,
  type MatchContext,
} from "../src/lib/pokemon/ebay-match";

// eBay for Pokémon: the search keywords, the listing matcher and the shared
// quota. A missed listing costs nothing (the page still offers a search); a
// wrong one puts a false cheapest price on the page — so the matcher is tested
// mostly for what it REFUSES.

test("queries say Pokemon exactly once and drop TCGplayer's variant notes", () => {
  assert.equal(pokemonEbayQuery("Phantasmal Flames Elite Trainer Box"), "Pokemon Phantasmal Flames Elite Trainer Box");
  assert.equal(
    pokemonEbayQuery("Phantasmal Flames Pokémon Center Elite Trainer Box (Exclusive)"),
    "Phantasmal Flames Pokemon Center Elite Trainer Box",
  );
  assert.equal(pokemonEbayQuery("151 Mini Tin [Gengar & Poliwag]"), "Pokemon 151 Mini Tin Gengar & Poliwag");
  assert.equal(pokemonEbayQuery("Eevee Evolutions Tin [Flareon V] (Live Code Card)"), "Pokemon Eevee Evolutions Tin Flareon V");
  assert.equal(pokemonEbayQuery("151: Zapdos ex Collection"), "Pokemon 151 Zapdos ex Collection");
  assert.equal(pokemonSetEbayQuery("Surging Sparks"), "Pokemon Surging Sparks sealed");
  for (const q of ["Phantasmal Flames ETB", "Pokemon 151 Booster Bundle", "Pokémon GO Elite Trainer Box"]) {
    assert.equal(pokemonEbayQuery(q).match(/pokemon/gi)?.length, 1, q);
  }
});

const SETS = ["Phantasmal Flames", "Mega Evolution", "Scarlet & Violet 151", "Scarlet & Violet Base Set", "Surging Sparks", "White Flare", "Black Bolt", "Pokémon GO"];
const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({
  productName: "Phantasmal Flames Elite Trainer Box",
  kind: "etb",
  setName: "Phantasmal Flames",
  setNames: SETS,
  refCents: 11800,
  floorCents: 1900,
  currency: "GBP",
  ...over,
});
const item = (title: string, priceCents = 10999, extra: Partial<EbayItemLite> = {}): EbayItemLite => ({
  title,
  priceCents,
  currency: "GBP",
  shippingCents: 399,
  url: "https://www.ebay.co.uk/itm/1",
  locationCountry: "GB",
  ...extra,
});

test("the matcher accepts the product, however sellers word it", () => {
  for (const t of [
    "Pokemon TCG Phantasmal Flames Elite Trainer Box ETB - New & Sealed",
    "Pokémon Mega Evolution Phantasmal Flames ETB Sealed",
    "POKEMON PHANTASMAL FLAMES ELITE TRAINER BOX",
  ]) {
    assert.equal(rejectReason(item(t), ctx()), null, t);
  }
});

test("the matcher refuses what is not one sealed unit of this product", () => {
  const cases: [string, string][] = [
    ["Pokemon Phantasmal Flames Elite Trainer Box JAPANESE", "language"],
    ["ポケモン Phantasmal Flames Elite Trainer Box Pokemon", "foreign"],
    ["Pokemon Phantasmal Flames ETB EMPTY BOX no packs", "empty"],
    ["Pokemon Phantasmal Flames ETB x2 sealed", "lot"],
    ["Pokemon Phantasmal Flames ETB Case of 10", "lot"],
    ["Pokemon Phantasmal Flames ETB dividers and sleeves only", "accessory"],
    ["Pokemon Phantasmal Flames Pokemon Center ETB", "kind"],
    ["Pokemon Phantasmal Flames Booster Bundle", "kind"],
    ["Pokemon Surging Sparks Elite Trainer Box", "product"],
    ["Pokemon Phantasmal Flames Surging Sparks ETB bundle deal", "other-set"],
    ["Phantasmal Flames Elite Trainer Box", "no-pokemon"],
    ["Pokemon Phantasmal Flames ETB PSA graded", "graded"],
  ];
  for (const [t, why] of cases) assert.equal(rejectReason(item(t), ctx()), why, t);
  assert.equal(rejectReason(item("Pokemon Phantasmal Flames ETB", 4000), ctx()), "floor", "under half of the market price");
  assert.equal(rejectReason(item("Pokemon Phantasmal Flames ETB", 10999, { currency: "USD" }), ctx()), "currency");
  assert.equal(rejectReason(item("Pokemon Phantasmal Flames ETB", 10999, { locationCountry: "CN" }), ctx()), "foreign");
});

test("a word in the product's own name is not junk, and the product's own set is not 'another set'", () => {
  const bundle = ctx({ productName: "151 Booster Bundle", kind: "booster-bundle", setName: "Scarlet & Violet 151", refCents: 7000 });
  assert.equal(rejectReason(item("Pokemon Scarlet & Violet 151 Booster Bundle Sealed", 6500), bundle), null);
  assert.equal(mentionsOtherSet("Pokemon Scarlet & Violet 151 Booster Bundle", "151 Booster Bundle", "Scarlet & Violet 151", SETS), false);
  assert.equal(mentionsOtherSet("Pokemon Mega Evolution Phantasmal Flames ETB", "Phantasmal Flames Elite Trainer Box", "Phantasmal Flames", SETS), false, "series names are not sets");
  assert.equal(mentionsOtherSet("Pokemon Black Bolt White Flare ETB", "Black Bolt Elite Trainer Box", "Black Bolt", SETS), true);
  // "binder" is junk in a title, unless the product itself is a binder collection.
  const binder = ctx({ productName: "Prismatic Evolutions Binder Collection", kind: "upc", setName: "Prismatic Evolutions", refCents: null });
  assert.notEqual(rejectReason(item("Pokemon Prismatic Evolutions Binder Collection Ultra Premium"), binder), "accessory");
});

test("a name is never reduced to no words: Pokémon GO keeps 'go'", () => {
  assert.deepEqual(distinctiveTokens("Pokémon GO Elite Trainer Box"), ["go"]);
  assert.deepEqual(distinctiveTokens("Phantasmal Flames Pokemon Center Elite Trainer Box (Exclusive)"), ["phantasmal", "flames"]);
  const go = ctx({ productName: "Pokémon GO Elite Trainer Box", setName: "Pokémon GO" });
  assert.equal(rejectReason(item("Pokemon GO Elite Trainer Box sealed"), go), null);
  assert.equal(rejectReason(item("Pokemon Surging Sparks Elite Trainer Box"), go), "product");
});

test("half booster boxes and full ones never stand in for each other", () => {
  const full = ctx({ productName: "Surging Sparks Booster Box", kind: "booster-box", setName: "Surging Sparks", refCents: 28000, floorCents: 4700 });
  const half = ctx({ productName: "Surging Sparks Half Booster Box", kind: "booster-box", setName: "Surging Sparks", refCents: 14000, floorCents: 4700 });
  assert.equal(rejectReason(item("Pokemon Surging Sparks Booster Box 36 packs", 26000), full), null);
  assert.equal(rejectReason(item("Pokemon Surging Sparks Half Booster Box 18 packs", 13000), full), "kind");
  assert.equal(rejectReason(item("Pokemon Surging Sparks Half Booster Box", 13000), half), null);
  assert.equal(rejectReason(item("Pokemon Surging Sparks Booster Box", 26000), half), "kind");
});

test("best match: cheapest by item + stated postage, gross low outliers pruned", () => {
  const items = [
    item("Pokemon Phantasmal Flames ETB", 9000, { shippingCents: 2500 }),
    item("Pokemon Phantasmal Flames ETB", 9900, { shippingCents: 0 }),
    item("Pokemon Phantasmal Flames ETB EMPTY", 2000),
    item("Pokemon Phantasmal Flames ETB", 10500),
  ];
  assert.equal(bestEbayMatch(items, ctx())?.priceCents, 9900, "£99 free postage beats £90 + £25");
  assert.equal(bestEbayMatch([item("Pokemon Surging Sparks ETB")], ctx()), null);
  // A thin result set with one implausibly cheap survivor of the floor:
  const outlier = [6000, 15000, 15500, 16000, 16500].map((p) => item("Pokemon Phantasmal Flames ETB", p, { shippingCents: 0 }));
  assert.equal(bestEbayMatch(outlier, ctx({ refCents: null, floorCents: 1900 }))?.priceCents, 15000);
});

test("Browse items are parsed defensively", () => {
  const ok = parseBrowseItem({
    title: "Pokemon ETB",
    price: { value: "109.99", currency: "GBP" },
    shippingOptions: [{ shippingCost: { value: "0.00" } }],
    itemWebUrl: "https://www.ebay.co.uk/itm/123",
    itemLocation: { country: "GB" },
  });
  assert.deepEqual(ok, {
    title: "Pokemon ETB",
    priceCents: 10999,
    currency: "GBP",
    shippingCents: 0,
    url: "https://www.ebay.co.uk/itm/123",
    locationCountry: "GB",
  });
  assert.equal(parseBrowseItem({ title: "x", price: { value: "0" } }), null);
  assert.equal(parseBrowseItem({ price: { value: "5" } }), null);
  assert.equal(parseBrowseItem({ title: "x", price: { value: "5", currency: "USD" } })?.shippingCents, null);
});

test("the eBay quota is Riftbound's first: a capped slice above a reserve, nothing when unknown", () => {
  assert.equal(pokemonEbayBudget(4200, 60, 2500), 60);
  assert.equal(pokemonEbayBudget(2530, 60, 2500), 30);
  assert.equal(pokemonEbayBudget(2400, 60, 2500), 0);
  assert.equal(pokemonEbayBudget(null, 60, 2500), 0, "an unreadable count spends nothing");
});

test("the rotation searches never-checked pairs first, then the stalest, newer sets breaking ties", () => {
  const work = pickEbayWork(
    [
      { productId: 1, market: "US", lastChecked: 1000, priority: 0 },
      { productId: 2, market: "US", lastChecked: null, priority: 5 },
      { productId: 3, market: "UK", lastChecked: 500, priority: 1 },
      { productId: 4, market: "UK", lastChecked: 500, priority: 0 },
      { productId: 5, market: "AU", lastChecked: null, priority: 1 },
    ],
    4,
  );
  assert.deepEqual(
    work.map((w) => w.productId),
    [5, 2, 4, 3],
  );
  assert.deepEqual(pickEbayWork([{ productId: 1, market: "US", lastChecked: null, priority: 0 }], 0), []);
});

test("eBay quota: Riftbound first — Pokémon searches late, a little, and never into Riftbound's next run", () => {
  // Owner, 2026-10-01: "prioritise our eBay quota for riftbound and only use
  // sparingly any remaining quota for pokemon".
  const src = readFileSync("src/lib/pokemon/import.ts", "utf8");
  const cap = Number(/export const POKEMON_EBAY_CAP = (\d+);/.exec(src)?.[1]);
  const reserve = Number(/export const POKEMON_EBAY_RESERVE = (\d+);/.exec(src)?.[1]);
  assert.ok(cap > 0 && cap <= 60, `cap ${cap}`);
  // One full Riftbound refresh (~1,400 calls) plus lib/ebay.ts's own 600 reserve.
  const riftboundReserve = Number(/EBAY_QUOTA_RESERVE \?\? (\d+)/.exec(readFileSync("src/lib/ebay.ts", "utf8"))?.[1]);
  assert.ok(reserve >= 1400 + riftboundReserve, `reserve ${reserve}`);

  const wf = readFileSync(".github/workflows/pokemon-import.yml", "utf8").replace(/^\s*#.*$/gm, "");
  const crons = [...wf.matchAll(/cron: "(\d+) (\d+) \* \* \*"/g)].map((m) => ({ cron: `${m[1]} ${m[2]} * * *`, minutes: Number(m[2]) * 60 + Number(m[1]) }));
  const ebayLine = /POKEMON_EBAY: \$\{\{(.*)\}\}/.exec(wf)?.[1] ?? "";
  const ebayCrons = crons.filter((c) => ebayLine.includes(`'${c.cron}'`));
  assert.equal(ebayCrons.length, 1, "exactly one scheduled run searches eBay");
  // ...and it comes after Riftbound's last refresh of the day (19:00 UTC, ~45 minutes).
  const rift = [...readFileSync(".github/workflows/refresh-prices.yml", "utf8").matchAll(/cron: "(\d+) (\d+) \* \* \*"/g)].map((m) => Number(m[2]) * 60 + Number(m[1]));
  assert.ok(ebayCrons[0].minutes >= Math.max(...rift) + 60, `eBay run at ${ebayCrons[0].cron}`);
  assert.match(ebayLine, /inputs\.with_ebay/, "a manual run searches eBay only when asked");
});
