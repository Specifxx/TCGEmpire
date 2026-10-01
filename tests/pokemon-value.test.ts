import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PER_PACK_KINDS,
  RECENT_SETS,
  asOfLabel,
  cheapestByKind,
  figuresAsOf,
  formatPerPack,
  isHalfBox,
  median,
  perPackRanking,
  pokemonUtm,
  recentReleasedSets,
  typicalPackCount,
} from "../src/lib/pokemon/value";
import { INDEX_STAGE1_KINDS, productPassesIndexGate } from "../src/lib/pokemon/index-gate";
import { DESCRIPTION_MAX, TITLE_MAX, pokemonAlternates, pokemonItemList, pokemonMeta, productIsIndexed } from "../src/lib/pokemon/seo";
import type { PkCatalog, PkProductDetail, PkTile } from "../src/lib/pokemon/types";

// The shared figures every Pokémon surface quotes (lib/pokemon/value.ts), the
// stage-1 index gate and the metadata builders, pinned against a trimmed real
// US catalogue (tests/fixtures/pokemon-catalog-us.json: the ten newest sets,
// the setless UPC/SPCs and twenty other setless products, read from the local
// import on 2026-10-01).

const catalog = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const product = JSON.parse(readFileSync("tests/fixtures/pokemon-product-etb.json", "utf8")) as PkProductDetail;
const TODAY = "2026-10-01";

test("fixtures: the catalogue and product fixtures have the shapes the builders rely on", () => {
  assert.equal(catalog.market, "US");
  assert.equal(catalog.sets.length, 10);
  assert.ok(catalog.tiles.some((t) => t.presale), "a pre-order set is in the window");
  assert.ok(catalog.tiles.some((t) => !t.setSlug && (t.kind === "upc" || t.kind === "spc")), "setless UPC/SPC present");
  assert.ok(catalog.tiles.every((t) => "packCountFrom" in t), "tiles carry packCountFrom");
  assert.ok(product.contents.length > 0 && product.packCount != null);
  assert.ok(product.offers.some((o) => o.market === "US" && o.source === "tcgplayer" && o.inStock));
});

test("perPackRanking: released, listed, counted; lowest per pack first; kinds and limit", () => {
  const all = perPackRanking(catalog.tiles);
  assert.ok(all.length > 20);
  for (const t of all) {
    assert.equal(t.presale, false);
    assert.notEqual(t.lowCents, null);
    assert.notEqual(t.perPackCents, null);
  }
  for (let i = 1; i < all.length; i++) assert.ok((all[i - 1].perPackCents as number) <= (all[i].perPackCents as number));
  const boxes = perPackRanking(catalog.tiles, { kinds: ["booster-box"], limit: 3 });
  assert.equal(boxes.length, 3);
  assert.ok(boxes.every((t) => t.kind === "booster-box"));
  assert.deepEqual(perPackRanking(catalog.tiles, { limit: 0 }), []);
  assert.deepEqual(PER_PACK_KINDS, ["booster-box", "etb", "pc-etb", "booster-bundle"]);
});

test("cheapestByKind: open listings only, half boxes never stand for a box, pre-orders opt-in", () => {
  const set = catalog.tiles.filter((t) => t.setSlug === "perfect-order");
  const c = cheapestByKind(set);
  assert.ok(c["booster-box"], "Perfect Order has a listed booster box");
  assert.equal(isHalfBox(c["booster-box"] as PkTile), false);
  for (const t of Object.values(c)) {
    assert.notEqual(t?.lowCents, null);
    assert.equal(t?.presale, false);
  }
  const delta = catalog.tiles.filter((t) => t.setSlug === "delta-reign");
  assert.deepEqual(cheapestByKind(delta), {}, "a pre-order set has nothing released");
  const withPre = cheapestByKind(delta, { includePresale: true });
  assert.ok(Object.values(withPre).every((t) => t?.presale));
  assert.ok(isHalfBox({ kind: "booster-box", name: "Perfect Order Half Booster Boxes" }));
  assert.ok(!isHalfBox({ kind: "etb", name: "Half Booster Box" }));
});

test("recentReleasedSets: on or before today, newest first, RECENT_SETS by default", () => {
  const r = recentReleasedSets(catalog, TODAY);
  assert.equal(RECENT_SETS, 6);
  assert.equal(r.length, 6);
  assert.ok(!r.some((s) => s.slug === "delta-reign"), "a set TCGplayer lists for November is not released");
  assert.equal(r[0].slug, "30th-celebration");
  for (let i = 1; i < r.length; i++) assert.ok((r[i - 1].releasedOn as string) >= (r[i].releasedOn as string));
  assert.equal(recentReleasedSets(catalog, new Date("2026-10-01T12:00:00Z"), 2).length, 2);
  assert.deepEqual(recentReleasedSets({ sets: [] }, TODAY), []);
});

test("typicalPackCount: the mode, its source, and null on a tie", () => {
  const slugs = recentReleasedSets(catalog, TODAY).map((s) => s.slug);
  const box = typicalPackCount(catalog.tiles, ["booster-box"], slugs);
  assert.equal(box?.count, 36);
  const tie = [
    { kind: "etb", name: "A ETB", packCount: 9, packCountFrom: "contents", setSlug: "a" },
    { kind: "etb", name: "B ETB", packCount: 11, packCountFrom: "contents", setSlug: "a" },
  ] as unknown as PkTile[];
  assert.equal(typicalPackCount(tie, ["etb"], null), null);
  const mixed = [
    { kind: "booster-box", name: "A Booster Box", packCount: 36, packCountFrom: "contents", setSlug: "a" },
    { kind: "booster-box", name: "B Booster Box", packCount: 36, packCountFrom: "name", setSlug: "b" },
    { kind: "booster-box", name: "B Half Booster Box", packCount: 18, packCountFrom: "name", setSlug: "b" },
    { kind: "booster-box", name: "C Enhanced Booster Box", packCount: 40, packCountFrom: "contents", setSlug: "c" },
  ] as unknown as PkTile[];
  assert.deepEqual(typicalPackCount(mixed, ["booster-box"], null), { count: 36, from: "both", matching: 2, counted: 3 }, "the half box is not counted");
  assert.equal(typicalPackCount(mixed, ["booster-box"], ["zzz"]), null);
});

test("median, asOfLabel, formatPerPack", () => {
  assert.equal(median([]), null);
  assert.equal(median([null, undefined, NaN]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(asOfLabel("2026-10-01T12:42:49.851Z"), "as of 1 Oct 2026");
  assert.equal(asOfLabel(null), null);
  assert.equal(formatPerPack(410, "USD"), "US$4.10 a pack");
  assert.equal(formatPerPack(399, "GBP"), "£3.99 a pack");
});

test("pokemonUtm: absolute, query before the anchor, appends to an existing query", () => {
  const u = { source: "discord-bot", medium: "bot", campaign: "pkmn-sealed" } as const;
  assert.equal(
    pokemonUtm("/pokemon/price-per-pack#booster-box", u),
    "https://riftcompare.com/pokemon/price-per-pack?utm_source=discord-bot&utm_medium=bot&utm_campaign=pkmn-sealed#booster-box",
  );
  assert.equal(
    pokemonUtm("/pokemon/sealed?type=tin", u),
    "https://riftcompare.com/pokemon/sealed?type=tin&utm_source=discord-bot&utm_medium=bot&utm_campaign=pkmn-sealed",
  );
});

test("index gate: the four hub kinds with a known pack count, nothing else", () => {
  assert.deepEqual([...INDEX_STAGE1_KINDS], ["booster-box", "etb", "pc-etb", "booster-bundle"]);
  assert.equal(productPassesIndexGate({ kind: "etb", packCount: 9 }), true);
  assert.equal(productPassesIndexGate({ kind: "etb", packCount: null }), false);
  assert.equal(productPassesIndexGate({ kind: "upc", packCount: 16 }), false);
  assert.equal(productPassesIndexGate({ kind: "tin", packCount: 3 }), false);
  const src = readFileSync("src/lib/pokemon/index-gate.ts", "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/^\s*import\b/m.test(src), "index-gate.ts imports nothing (it sits on the Riftbound importers' load path)");
  const prev = process.env.POKEMON_INDEX_PRODUCTS;
  try {
    delete process.env.POKEMON_INDEX_PRODUCTS;
    assert.equal(productIsIndexed({ kind: "etb", packCount: 9 }), false, "off by default");
    process.env.POKEMON_INDEX_PRODUCTS = "1";
    assert.equal(productIsIndexed({ kind: "etb", packCount: 9 }), true);
    assert.equal(productIsIndexed({ kind: "tin", packCount: 3 }), false);
  } finally {
    if (prev === undefined) delete process.env.POKEMON_INDEX_PRODUCTS;
    else process.env.POKEMON_INDEX_PRODUCTS = prev;
  }
});

test("pokemonMeta: absolute title, no feed alternates, and the two share-image modes", () => {
  assert.equal(TITLE_MAX, 60);
  assert.equal(DESCRIPTION_MAX, 155);
  const section = pokemonMeta({ title: "T", description: "D", path: "/pokemon/sets", ogImage: "section" });
  assert.deepEqual(section.title, { absolute: "T" });
  assert.deepEqual(section.alternates, { canonical: "/pokemon/sets", languages: { "x-default": "https://riftcompare.com/pokemon/sets" } });
  const og = section.openGraph as Record<string, unknown>;
  assert.equal((og.images as { url: string }[])[0].url, "https://riftcompare.com/pokemon/opengraph-image");
  assert.equal(og.url, "https://riftcompare.com/pokemon/sets");
  assert.ok(!("robots" in section));
  const colocated = pokemonMeta({ title: "T", description: "D", path: "/pokemon", ogImage: "colocated", robots: { index: false, follow: true } });
  assert.ok(!Object.prototype.hasOwnProperty.call(colocated.openGraph, "images"), "no images key at all, so the route's own file wins");
  assert.ok(!Object.prototype.hasOwnProperty.call(colocated.twitter, "images"));
  assert.deepEqual(colocated.robots, { index: false, follow: true });
  const art = pokemonMeta({ title: "T", description: "D", path: "/pokemon/blog/x", ogImage: "section", ogType: "article", publishedTime: "2026-10-01" });
  assert.equal((art.openGraph as Record<string, unknown>).type, "article");
  assert.equal((art.openGraph as Record<string, unknown>).publishedTime, "2026-10-01");
  assert.deepEqual(pokemonAlternates("/pokemon")?.languages, { "x-default": "https://riftcompare.com/pokemon" });
  const list = pokemonItemList("Sets", [{ name: "A", path: "/pokemon/sets/a" }]);
  assert.equal(list["@type"], "ItemList");
  assert.equal(list.itemListElement[0].url, "https://riftcompare.com/pokemon/sets/a");
});

test("figuresAsOf: the oldest listing quoted, else the newest reference", () => {
  assert.equal(figuresAsOf(["2026-10-01T12:00:00Z", "2026-09-29T08:00:00Z"], ["2026-10-01T13:00:00Z"]), "2026-09-29T08:00:00Z");
  assert.equal(figuresAsOf([], ["2026-09-30T00:00:00Z", "2026-10-01T13:00:00Z"]), "2026-10-01T13:00:00Z");
  assert.equal(figuresAsOf([], []), null);
});

test("pokemonDiscordAppId: an ID or nothing, one check for the page, the hub link and the sitemap", async () => {
  const { pokemonDiscordAppId } = await import("../src/lib/pokemon/flag");
  const prev = process.env.POKEMON_DISCORD_APP_ID;
  try {
    for (const [v, want] of [["123456789012345678", "123456789012345678"], [" 123456789012345678 ", "123456789012345678"], ['"123456789012345678"', null], ["Application ID: 1234", null], ["", null]] as const) {
      process.env.POKEMON_DISCORD_APP_ID = v;
      assert.equal(pokemonDiscordAppId(), want, v);
    }
  } finally {
    if (prev === undefined) delete process.env.POKEMON_DISCORD_APP_ID;
    else process.env.POKEMON_DISCORD_APP_ID = prev;
  }
  for (const f of ["src/app/pokemon/page.tsx", "src/lib/pokemon/sitemap.ts", "src/app/pokemon/discord/page.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /process\.env\.POKEMON_DISCORD_APP_ID/, `${f} reads the ID only through pokemonDiscordAppId`);
  }
});

test("isPokemonSlug: every real slug passes, anything else costs no read", async () => {
  const { isPokemonSlug } = await import("../src/lib/pokemon/format");
  const names = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
  for (const t of names.tiles) assert.ok(isPokemonSlug(t.slug), t.slug);
  for (const s of names.sets) assert.ok(isPokemonSlug(s.slug), s.slug);
  for (const bad of ["", "A", "a--b", "-a", "a b", "a/b", "x".repeat(121), "%E2%9C%93"]) assert.equal(isPokemonSlug(bad), false, bad);
});
