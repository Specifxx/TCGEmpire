import test from "node:test";
import assert from "node:assert/strict";
import { classifyPokemonSealed, kindOrder, PK_KINDS } from "../src/lib/pokemon/kinds";
import {
  assignSlugs,
  buildCatalog,
  displayName,
  groupRole,
  parseContents,
  plausibleLow,
  seriesForDate,
  slugify,
  type TcgcsvProduct,
} from "../src/lib/pokemon/catalog";

// The Pokémon catalogue rules (lib/pokemon/kinds.ts, lib/pokemon/catalog.ts),
// pinned against real TCGplayer titles as TCGCSV served them on 2026-10-01.

test("product kinds: the specific shape wins, real titles", () => {
  const cases: [string, string | null][] = [
    ["Phantasmal Flames Pokemon Center Elite Trainer Box (Exclusive)", "pc-etb"],
    ["Phantasmal Flames Elite Trainer Box", "etb"],
    ["Phantasmal Flames Booster Box", "booster-box"],
    ["Delta Reign Half Booster Box", "booster-box"],
    ["Phantasmal Flames Booster Bundle", "booster-bundle"],
    ["151 Ultra-Premium Collection", "upc"],
    ["Prismatic Evolutions Super-Premium Collection", "spc"],
    ["Blooming Waters Premium Collection", "premium-collection"],
    ["Phantasmal Flames Build & Battle Box", "build-battle"],
    ["151 Mini Tin [Gengar & Poliwag]", "tin"],
    ["Eevee Evolutions Tin [Flareon V] (Live Code Card)", "tin"],
    ["Phantasmal Flames Premium Checklane Blister [Hydrapple]", "blister"],
    ["Phantasmal Flames 3 Pack Blister [Sneasel]", "blister"],
    ["Phantasmal Flames Booster Pack", "booster-pack"],
    ["Phantasmal Flames Sleeved Booster Pack", "booster-pack"],
    ["League Battle Deck [Gardevoir ex]", "deck"],
    ["Greninja ex Battle Deck & 2 Booster Bundle", "deck"],
    ["151 Poster Collection", "collection"],
    ["30th Celebration Greninja ex Box", "collection"],
    // Out of scope by design.
    ["Phantasmal Flames Booster Box Case", null],
    ["Phantasmal Flames Build & Battle Box Display", null],
    ["Pokemon Stacking Tins [Set of 3]", null],
    ["Phantasmal Flames Booster Pack Art Bundle [Set of 4]", null],
    ["Stellar Crown Sleeved Booster Master Carton", null],
    ["Trainer Battle Deck - Brock of Pewter City Gym (JP Pokemon Center Exclusive)", null],
  ];
  for (const [name, kind] of cases) assert.equal(classifyPokemonSealed(name), kind, name);
});

test("kinds are ordered boxes first and every kind explains itself in one sentence", () => {
  assert.ok(kindOrder("booster-box") < kindOrder("etb"));
  assert.ok(kindOrder("etb") < kindOrder("booster-pack"));
  for (const k of PK_KINDS) {
    assert.ok(k.about.length > 30 && k.about.length < 220, k.id);
    assert.doesNotMatch(k.about, /invest|worth|will rise|value goes up|profit/i, `${k.id}: no value talk`);
  }
});

test("groups: expansions, setless specials and the misc group are in scope; promos and pre-2020 are not", () => {
  assert.deepEqual(groupRole({ name: "ME02: Phantasmal Flames", publishedOn: "2025-11-14" }), {
    role: "set",
    series: "Mega Evolution",
    name: "Phantasmal Flames",
    main: true,
  });
  assert.deepEqual(groupRole({ name: "SV: Scarlet & Violet 151", publishedOn: "2023-09-22" }), {
    role: "set",
    series: "Scarlet & Violet",
    name: "Scarlet & Violet 151",
    main: false,
  });
  assert.equal((groupRole({ name: "SWSH07: Evolving Skies", publishedOn: "2021-08-27" }) as { series: string }).series, "Sword & Shield");
  assert.equal((groupRole({ name: "Celebrations", publishedOn: "2021-10-08" }) as { role: string }).role, "set");
  assert.deepEqual(groupRole({ name: "Miscellaneous Cards & Products", publishedOn: "2026-09-30" }), { role: "misc" });
  assert.deepEqual(groupRole({ name: "Trick or Trade BOOster Bundle 2024", publishedOn: "2024-08-30" }), { role: "setless" });
  assert.equal(groupRole({ name: "SV: Scarlet & Violet Promo Cards", publishedOn: "2023-03-31" }), null);
  assert.equal(groupRole({ name: "SWSH12: Silver Tempest Trainer Gallery", publishedOn: "2022-11-11" }), null);
  assert.equal(groupRole({ name: "SVE: Scarlet & Violet Energies", publishedOn: "2023-03-31" }), null);
  assert.equal(groupRole({ name: "SM - Cosmic Eclipse", publishedOn: "2019-11-01" }), null);
  assert.equal(groupRole({ name: "POP Series 5", publishedOn: "2026-09-30" }), null);
  assert.equal(seriesForDate("2019-12-31"), null);
  assert.equal(seriesForDate("2025-09-26"), "Mega Evolution");
});

test("names and slugs: Pokémon spelled right on screen, plain in URLs", () => {
  assert.equal(displayName("Phantasmal Flames Pokemon Center Elite Trainer Box"), "Phantasmal Flames Pokémon Center Elite Trainer Box");
  assert.equal(slugify("Scarlet & Violet 151"), "scarlet-violet-151");
  assert.equal(slugify("Champion's Path"), "champions-path");
  assert.equal(slugify("Phantasmal Flames Pokémon Center Elite Trainer Box (Exclusive)"), "phantasmal-flames-pokemon-center-elite-trainer-box-exclusive");
});

test("slugs are stable once written and unique by TCGplayer id", () => {
  const existing = new Map([[5, "elite-trainer-box"]]);
  const out = assignSlugs(
    [
      { id: 9, slugBase: "elite-trainer-box" },
      { id: 5, slugBase: "renamed-on-tcgplayer" },
      { id: 7, slugBase: "booster-box" },
    ],
    existing,
  );
  assert.equal(out.get(5), "elite-trainer-box", "an existing product keeps its slug");
  assert.equal(out.get(9), "elite-trainer-box-9", "a newcomer never takes a slug in use");
  assert.equal(out.get(7), "booster-box");
});

test("contents: the bullet list, never the marketing paragraph", () => {
  const etb =
    "Ignite a Burning Spirit of Battle!<br><br>\r\nSearing blue flames rip across a dark battlefield!<br><br>\r\nThe Elite Trainer Box includes:<br>\r\n\r\n• 9 booster packs<br>\r\n• 1 full-art foil promo card featuring Charcadet<br>\r\n• 65 card sleeves";
  assert.deepEqual(parseContents(etb), ["9 booster packs", "1 full-art foil promo card featuring Charcadet", "65 card sleeves"]);
  assert.deepEqual(parseContents("Ignite!\r\n<br><br>Includes six Mega Evolution - Phantasmal Flames booster packs."), [
    "Six Mega Evolution - Phantasmal Flames booster packs",
  ]);
  assert.deepEqual(parseContents("Just a story about Pokémon."), []);
  assert.deepEqual(parseContents(null), []);
});

test("a TCGplayer low under 30% of its own market price is dropped as implausible", () => {
  assert.equal(plausibleLow(14349, 15213), 14349);
  assert.equal(plausibleLow(2000, 15213), null);
  assert.equal(plausibleLow(2000, null), 2000);
  assert.equal(plausibleLow(null, 15213), null);
});

test("buildCatalog: sealed only, in-scope kinds, prices joined, a set per expansion", () => {
  const sealed = (id: number, name: string, extra: Partial<TcgcsvProduct> = {}): TcgcsvProduct => ({
    productId: id,
    name,
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`,
    groupId: 24448,
    url: `https://www.tcgplayer.com/product/${id}`,
    presaleInfo: { isPresale: false, releasedOn: "2025-11-14T00:00:00" },
    extendedData: [{ name: "UPC", value: "0196214124813" }],
    ...extra,
  });
  const card: TcgcsvProduct = {
    ...sealed(1, "Mega Charizard X ex"),
    extendedData: [
      { name: "Number", value: "013/094" },
      { name: "Rarity", value: "Double Rare" },
    ],
  };
  const build = buildCatalog(
    [{ groupId: 24448, name: "ME02: Phantasmal Flames", abbreviation: "PFL", publishedOn: "2025-11-14T00:00:00" }],
    new Map([[24448, [card, sealed(654136, "Phantasmal Flames Elite Trainer Box"), sealed(654170, "Phantasmal Flames Elite Trainer Box Case")]]]),
    new Map([
      [
        24448,
        [
          { productId: 654136, lowPrice: 143.49, marketPrice: 152.13, subTypeName: "Normal" },
          { productId: 654170, lowPrice: 1526, marketPrice: 1461.69, subTypeName: "Normal" },
        ],
      ],
    ]),
  );
  assert.deepEqual(
    build.sets.map((s) => [s.slug, s.name, s.code, s.series]),
    [["phantasmal-flames", "Phantasmal Flames", "PFL", "Mega Evolution"]],
  );
  assert.deepEqual(build.products.map((p) => p.id), [654136], "the single card and the case are not in the catalogue");
  const etb = build.products[0];
  assert.equal(etb.kind, "etb");
  assert.equal(etb.imageUrl, "https://tcgplayer-cdn.tcgplayer.com/product/654136_in_1000x1000.jpg");
  assert.equal(etb.upc, "0196214124813");
  assert.deepEqual(build.prices, [{ productId: 654136, lowCents: 14349, marketCents: 15213 }]);
  assert.equal(build.skipped["out-of-scope kind"], 1);
});
