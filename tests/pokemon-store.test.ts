import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Pokémon section's data as committed files (lib/pokemon/store.ts,
// DECISIONS.md "The Pokémon section returns, served from files in the
// repository", 2026-11-01): the import writes data/pokemon, the loaders read
// it back. TCGCSV is stubbed with real-shaped rows; nothing leaves the machine.

const dir = mkdtempSync(join(tmpdir(), "pokemon-store-"));
process.env.POKEMON_DATA_DIR = dir;
process.env.POKEMON_EBAY = "0";
process.env.POKEMON_CARDMARKET = "0";

const GROUPS = [{ groupId: 24380, name: "ME02: Phantasmal Flames", abbreviation: "ME02", publishedOn: "2025-11-14T00:00:00" }];
const product = (productId: number, name: string, extra: Partial<Record<string, unknown>> = {}) => ({
  productId,
  name,
  imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
  groupId: 24380,
  url: `https://www.tcgplayer.com/product/${productId}`,
  presaleInfo: { isPresale: false, releasedOn: "2025-11-14T00:00:00" },
  extendedData: [],
  ...extra,
});
let PRODUCTS = [
  product(1001, "Phantasmal Flames Booster Box"),
  product(1002, "Phantasmal Flames Elite Trainer Box"),
  product(1003, "Phantasmal Flames Booster Bundle"),
];
let PRICES = [
  { productId: 1001, lowPrice: 189.99, marketPrice: 199.5, subTypeName: "Normal" },
  { productId: 1002, lowPrice: 54.99, marketPrice: 57.25, subTypeName: "Normal" },
  { productId: 1003, lowPrice: 29.99, marketPrice: 31, subTypeName: "Normal" },
];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL) => {
  const url = String(input);
  const body = url.endsWith("/groups")
    ? { results: GROUPS }
    : url.endsWith("/products")
      ? { results: PRODUCTS }
      : url.endsWith("/prices")
        ? { results: PRICES }
        : null;
  if (!body) return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

test.after(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("the import writes the catalogue, offers and a history day, and the loaders read them", async () => {
  const { importPokemon } = await import("../src/lib/pokemon/import");
  const { getPokemonCatalog, getPokemonProduct, clearPokemonMemo } = await import("../src/lib/pokemon/data");
  const { pokemonDataPresent, readPokemonData, pokemonHistoryDays } = await import("../src/lib/pokemon/store");

  assert.equal(pokemonDataPresent(), false, "no files before the first import");
  const summary = await importPokemon();
  assert.equal(summary.catalog.products, 3, JSON.stringify(summary));
  assert.equal(pokemonDataPresent(), true);

  const data = readPokemonData();
  assert.equal(data.sets.length, 1);
  assert.equal(data.products.length, 3);
  assert.equal(data.offers.filter((o) => o.source === "tcgplayer").length, 3);
  assert.equal(data.offers.filter((o) => o.source === "tcgplayer_market").length, 3);
  assert.equal(data.lastRun?.ok, true);
  assert.equal(pokemonHistoryDays().length, 1);

  // One JSON row per line, so a day's git diff is the rows that changed.
  const raw = readFileSync(join(dir, "products.json"), "utf8");
  assert.equal(raw.trim().split("\n").length, 3 + 2);

  clearPokemonMemo();
  const us = await getPokemonCatalog("US");
  assert.equal(us.tiles.length, 3);
  const box = us.tiles.find((t) => t.id === 1001);
  assert.ok(box);
  assert.equal(box.kind, "booster-box");
  assert.equal(us.sets.length, 1);
  assert.ok(us.pricesAsOf);

  const detail = await getPokemonProduct(box.slug);
  assert.ok(detail);
  assert.equal(detail.set?.name, "Phantasmal Flames");
  assert.equal(detail.history.length, 1);
  assert.equal(detail.history[0].cents, 19950);
  assert.equal(detail.siblings.length, 2);
  assert.equal(await getPokemonProduct("no-such-product"), null);
});

test("a second run keeps slugs and firstSeenAt, deactivates a product gone from its group, and keeps one point a day", async () => {
  const { importPokemon } = await import("../src/lib/pokemon/import");
  const { readPokemonData, pokemonHistoryDays } = await import("../src/lib/pokemon/store");
  const before = readPokemonData();
  PRODUCTS = PRODUCTS.filter((p) => p.productId !== 1003);
  PRICES = PRICES.filter((p) => p.productId !== 1003);
  await importPokemon();
  const after = readPokemonData();
  for (const p of before.products) {
    const q = after.products.find((x) => x.id === p.id);
    assert.equal(q?.slug, p.slug);
    assert.equal(q?.firstSeenAt, p.firstSeenAt);
  }
  assert.equal(after.products.find((p) => p.id === 1003)?.active, false);
  // Its last prices are kept (the row is inactive, so no page shows it).
  assert.equal(pokemonHistoryDays().length, 1);
});

test("a run whose TCGCSV read fails writes nothing and changes nothing", async () => {
  const { importPokemon } = await import("../src/lib/pokemon/import");
  const before = readdirSync(dir).map((f) => [f, f.endsWith(".json") && f !== "last-run.json" ? readFileSync(join(dir, f), "utf8") : ""]);
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
  try {
    const summary = await importPokemon();
    assert.equal(summary.catalog.products, 0);
  } finally {
    globalThis.fetch = saved;
  }
  const after = readdirSync(dir).map((f) => [f, f.endsWith(".json") && f !== "last-run.json" ? readFileSync(join(dir, f), "utf8") : ""]);
  assert.deepEqual(after, before);
});
