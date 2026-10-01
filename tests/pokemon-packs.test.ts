import test from "node:test";
import assert from "node:assert/strict";
import { packCount, perPackCents } from "../src/lib/pokemon/packs";

// Booster packs per product (lib/pokemon/packs.ts): from the published contents
// list first, from the name only for the four shapes that define their count,
// and NOTHING when it cannot be known. Real contents lines, TCGCSV 2026-10-01.

test("counts come from the contents list, in every wording TCGplayer uses", () => {
  const cases: [string, string[], number][] = [
    ["Phantasmal Flames Elite Trainer Box", ["9 Pokémon TCG: Mega Evolution-Phantasmal Flames booster packs", "65 card sleeves"], 9],
    ["Delta Reign Pokémon Center Elite Trainer Box (Exclusive)", ["11 Pokémon booster packs", "Each booster pack contains 10 cards and 1 Basic Energy. Cards vary by pack."], 11],
    ["Costco Scarlet & Violet 151 Zapdos ex & Alakazam ex Bundle", ["(1) Foil promo card featuring Zapdos ex", "(4) Pokémon TCG: Scarlet & Violet—151 booster packs"], 4],
    ["Phantasmal Flames Booster Bundle", ["Six Mega Evolution - Phantasmal Flames booster packs"], 6],
    ["Chaos Rising Booster Box", ["Each Chaos Rising Booster Box contains 36 booster packs (contents vary by product)"], 36],
    ["Fusion Strike 3 Pack Hanger Box", ["Box includes 3 Sword & Shield - Fusion Strike booster packs!", "Each pack contains 10 random cards."], 3],
    ["Legends of Galar Tin + Galar Partners Tin 2-pack [Zamazenta V/Rillaboom V]", ["1 foil promo featuring Zamazenta V", "5 Pokémon TCG booster packs"], 5],
  ];
  for (const [name, contents, n] of cases) {
    assert.deepEqual(packCount({ name, kind: "collection", contents }), { count: n, from: "contents" }, name);
  }
});

test("a product with non-standard packs gets no count, never a misleading one", () => {
  // Celebrations ETB: ten 4-card packs plus five standard ones.
  assert.equal(
    packCount({
      name: "Celebrations Elite Trainer Box",
      kind: "etb",
      contents: ["10 Celebrations four-card booster packs", "Five additional Pokemon TCG booster packs"],
    }),
    null,
  );
  assert.equal(
    packCount({ name: "Holiday Calendar", kind: "collection", contents: ["6 Pokémon TCG: Sword & Shield Series booster packs", "6 Pokémon TCG 3-card fun packs"] }),
    null,
  );
  // A single three-card pack whose title files it as a booster bundle: never six packs.
  assert.equal(
    packCount({
      name: "Trick or Trade BOOster Bundle 2023 - Mini Booster Pack",
      kind: "booster-bundle",
      contents: ["3 Colorful cards from the Pokémon Trading Card Game"],
    }),
    null,
  );
  assert.deepEqual(
    packCount({ name: "Shrouded Fable Mini Tin [Zoroark]", kind: "tin", contents: ["2 Pokémon TCG: Scarlet & Violet—Shrouded Fable booster packs"] }),
    { count: 2, from: "contents" },
    "a mini TIN is not a mini pack",
  );
});

test("only four shapes are counted from the name", () => {
  assert.deepEqual(packCount({ name: "Phantasmal Flames Booster Pack", kind: "booster-pack", contents: [] }), { count: 1, from: "name" });
  assert.deepEqual(packCount({ name: "Destined Rivals 3 Pack Blister [Kangaskhan]", kind: "blister", contents: [] }), { count: 3, from: "name" });
  assert.deepEqual(packCount({ name: "Vivid Voltage Single Pack Blister [Grookey]", kind: "blister", contents: [] }), { count: 1, from: "name" });
  assert.deepEqual(packCount({ name: "Surging Sparks Booster Bundle", kind: "booster-bundle", contents: [] }), { count: 6, from: "name" });
  assert.deepEqual(packCount({ name: "Stellar Crown Booster Box", kind: "booster-box", contents: [], mainExpansion: true }), { count: 36, from: "name" });
  assert.deepEqual(packCount({ name: "Stellar Crown Half Booster Box", kind: "booster-box", contents: [], mainExpansion: true }), { count: 18, from: "name" });
  // Not a main expansion, an "Enhanced" box, a premium checklane blister, an ETB with no list: unknown.
  assert.equal(packCount({ name: "Ascended Heroes Booster Box", kind: "booster-box", contents: [], mainExpansion: false }), null);
  assert.equal(packCount({ name: "Journey Together Enhanced Booster Box", kind: "booster-box", contents: [], mainExpansion: true }), null);
  assert.equal(packCount({ name: "Vivid Voltage Premium Checklane Blister [Appletun]", kind: "blister", contents: [] }), null);
  assert.equal(packCount({ name: "Prismatic Evolutions Elite Trainer Box", kind: "etb", contents: [] }), null);
});

test("price per pack", () => {
  assert.equal(perPackCents(14349, 9), 1594);
  assert.equal(perPackCents(null, 9), null);
  assert.equal(perPackCents(14349, null), null);
  assert.equal(perPackCents(14349, 0), null);
});
