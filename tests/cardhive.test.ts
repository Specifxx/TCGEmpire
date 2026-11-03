import test from "node:test";
import assert from "node:assert/strict";
import {
  cardsBySetNumber,
  galleryCodesByHash,
  hiveItemFromDoc,
  hiveProducts,
  matchHiveItem,
  riotImageHash,
  splitPublicCode,
  type HiveItem,
} from "../src/lib/cardhive";
import { RETAILERS } from "../src/lib/retailers";
import { offerCurrencyOk } from "../src/lib/offer-currency";
import type { CardLite } from "../src/lib/price-import";

// The Card Hive (thecardhive.co.uk), suggested 2026-10-30: a Firebase shop whose
// stock is the public Firestore `shop` list. Rows below are real documents as
// read on 2026-10-30, trimmed to the fields lib/cardhive.ts reads.
const CMS = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/";
const H = {
  sprite: "fcb3ea3e8f829b8dc845fbf49080552d635bb47b",
  bramble: "1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a",
  akali: "2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b",
  rune: "3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
  poppy: "4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d",
};
const img = (h: string) => `${CMS}${h}-744x1039.png?accountingTag=RB&w=400&auto=format&q=90`;

const CARDS: CardLite[] = [
  { id: "c-sprite", name: "Sprite Fountain", setCode: "UNL", collectorNumber: "078/219", rarity: "Uncommon", variant: null, isPromo: false },
  { id: "c-bramble", name: "Red Brambleback", setCode: "UNL", collectorNumber: "029/219", rarity: "Epic", variant: null, isPromo: false },
  { id: "c-bramble-a", name: "Red Brambleback", setCode: "UNL", collectorNumber: "029a/219", rarity: "Showcase", variant: "a", isPromo: false },
  { id: "c-akali-sp", name: "Akali, Brash", setCode: "RAD", collectorNumber: "SP2/005", rarity: "Showcase", variant: null, isPromo: false },
  { id: "c-akali", name: "Akali, Brash", setCode: "RAD", collectorNumber: "015/167", rarity: "Rare", variant: null, isPromo: false },
  { id: "c-akali-p", name: "Akali, Brash", setCode: "RAD", collectorNumber: "015/167", rarity: "Rare", variant: null, isPromo: true },
  { id: "c-rune", name: "Calm Rune", setCode: "RAD", collectorNumber: "R02A", rarity: "Showcase", variant: null, isPromo: false },
  { id: "c-poppy", name: "Poppy, Keeper of the Hammer", setCode: "UNL", collectorNumber: "237/219", rarity: "Showcase", variant: null, isPromo: false },
];

// The gallery's __NEXT_DATA__ shape (backfill-card-text.ts reads the same page).
const GALLERY = {
  props: {
    pageProps: {
      cards: [
        { id: "unl-078-219", name: "Sprite Fountain", publicCode: "UNL-078/219", set: { value: { id: "unl" } }, cardImage: { url: `${CMS}${H.sprite}-744x1039.png` } },
        { id: "unl-029a-219", name: "Red Brambleback", publicCode: "UNL-029a/219", set: { value: { id: "unl" } }, cardImage: { url: `${CMS}${H.bramble}-744x1039.png` } },
        { id: "rad-sp2-005", name: "Akali", subtitle: "Brash", publicCode: "RAD-SP2/005", set: { value: { id: "rad" } }, cardImage: { url: `${CMS}${H.akali}-744x1039.png` } },
        { id: "rad-r02a", name: "Calm Rune", publicCode: "RAD-R02a", set: { value: { id: "rad" } }, cardImage: { url: `${CMS}${H.rune}-744x1039.png` } },
        { id: "unl-237-219", name: "Poppy", subtitle: "Keeper of the Hammer", publicCode: "UNL-237/219", set: { value: { id: "unl" } }, cardImage: { url: `${CMS}${H.poppy}-744x1039.png` } },
      ],
    },
  },
};

const item = (o: Partial<HiveItem>): HiveItem => ({
  id: "x", name: "", category: "Single", game: "riftbound", condition: "NM", foil: false, price: 1, stock: 1, image: null, ...o,
});

test("The Card Hive is a UK store on its own platform, priced in GBP", () => {
  const s = RETAILERS.thecardhive;
  assert.ok(s);
  assert.equal(s.platform, "cardhive");
  assert.equal(s.country, "UK");
  assert.equal(s.base, "https://thecardhive.co.uk");
  assert.equal(offerCurrencyOk("thecardhive", "UK"), true);
});

test("a Firestore REST document reads into the fields the importer uses", () => {
  const doc = {
    name: "projects/cardhive-c9eed/databases/(default)/documents/shop/00nczWMHWaZRpvp49aWi",
    fields: {
      category: { stringValue: "Single" }, condition: { stringValue: "NM" }, game: { stringValue: "riftbound" },
      name: { stringValue: "Sprite Fountain" }, foil: { booleanValue: false }, price: { doubleValue: 4.5 },
      stock: { integerValue: "7" }, image: { stringValue: img(H.sprite) }, set_id: { stringValue: "UNL" },
      collector_number: { stringValue: "78" }, extraImages: { arrayValue: {} }, originalPrice: { nullValue: null },
    },
  };
  assert.deepEqual(hiveItemFromDoc(doc), {
    id: "00nczWMHWaZRpvp49aWi", name: "Sprite Fountain", category: "Single", game: "riftbound", condition: "NM",
    foil: false, price: 4.5, stock: 7, image: img(H.sprite),
  });
});

test("only Riot's own card pictures yield a hash", () => {
  assert.equal(riotImageHash(img(H.sprite)), H.sprite);
  // Two of its rows carry a malformed "?accountingTag=RB?w=400" query: still Riot's picture.
  assert.equal(riotImageHash(`${CMS}${H.sprite}-1039x744.png?accountingTag=RB?w=400&auto=format&q=90`), H.sprite);
  assert.equal(riotImageHash("https://firebasestorage.googleapis.com/v0/b/cardhive-c9eed.firebasestorage.app/o/merch%2FBooster%20Box%2Fx.webp"), null);
  assert.equal(riotImageHash(null), null);
});

test("gallery codes split into set and catalogue number", () => {
  assert.deepEqual(splitPublicCode("UNL-029a/219"), { set: "UNL", num: "029a/219" });
  assert.deepEqual(splitPublicCode("RAD-R02a"), { set: "RAD", num: "r02a" });
  assert.deepEqual(splitPublicCode("RAD-SP2/005"), { set: "RAD", num: "sp2/005" });
});

test("the picture decides the printing, not the shop's own number", () => {
  const codes = galleryCodesByHash(GALLERY);
  const idx = cardsBySetNumber(CARDS);
  // Real rows: the shop files the alt art under the base number (UNL 29), the
  // K/DA Special Art Akali as "RAD 2", the rune alt art as "r02".
  assert.equal(matchHiveItem(item({ name: "Red Brambleback (Alternate Art)", image: img(H.bramble) }), codes, idx)?.id, "c-bramble-a");
  assert.equal(matchHiveItem(item({ name: "Akali, Brash", image: img(H.akali) }), codes, idx)?.id, "c-akali-sp");
  assert.equal(matchHiveItem(item({ name: "Calm Rune", image: img(H.rune) }), codes, idx)?.id, "c-rune");
  // "Poppy - Keeper of the Hammer (Overnumbered)" against our "Poppy, Keeper of the Hammer".
  assert.equal(matchHiveItem(item({ name: "Poppy - Keeper of the Hammer (Overnumbered)", image: img(H.poppy) }), codes, idx)?.id, "c-poppy");
});

test("no match without a gallery picture, or when the names disagree", () => {
  const codes = galleryCodesByHash(GALLERY);
  const idx = cardsBySetNumber(CARDS);
  assert.equal(matchHiveItem(item({ name: "Shadowblade Lurker", image: img("9".repeat(40)) }), codes, idx), null);
  assert.equal(matchHiveItem(item({ name: "Sprite Fountain", image: null }), codes, idx), null);
  // Right picture, wrong card name: the shop's data is wrong somewhere, so skip.
  assert.equal(matchHiveItem(item({ name: "Red Brambleback", image: img(H.sprite) }), codes, idx), null);
});

test("a number shared by two printings is no key; promos never take the base number", () => {
  const idx = cardsBySetNumber([...CARDS, { ...CARDS[0], id: "c-sprite-dupe" }]);
  assert.equal(matchHiveItem(item({ name: "Sprite Fountain", image: img(H.sprite) }), galleryCodesByHash(GALLERY), idx), null);
  assert.deepEqual(cardsBySetNumber(CARDS).get("RAD|015/167")?.map((c) => c.id), ["c-akali"]);
});

test("one picture claimed by two gallery codes is dropped", () => {
  const twice = { cards: [...GALLERY.props.pageProps.cards, { id: "unl-078b-219", name: "Sprite Fountain", publicCode: "UNL-078b/219", set: { value: { id: "unl" } }, cardImage: { url: `${CMS}${H.sprite}-744x1039.png` } }] };
  assert.equal(galleryCodesByHash(twice).has(H.sprite), false);
});

test("singles become importer products with their printing decided; sealed is left out", () => {
  const items = [
    item({ id: "00nczWMHWaZRpvp49aWi", name: "Sprite Fountain", price: 4.5, stock: 7, image: img(H.sprite) }),
    item({ id: "oos", name: "Red Brambleback (Alternate Art)", price: 3.5, stock: 0, image: img(H.bramble) }),
    item({ id: "foil", name: "Sprite Fountain", foil: true, price: 0.944450600000001, image: img(H.sprite) }),
    item({ id: "nomatch", name: "Shadowblade Lurker", image: img("9".repeat(40)) }),
    item({ id: "box", name: "Radiance Booster Box", category: "Booster Box", condition: null, price: 120, stock: 7 }),
    item({ id: "free", name: "Sprite Fountain", price: 0, image: img(H.sprite) }),
  ];
  const ps = hiveProducts(items, galleryCodesByHash(GALLERY), CARDS, "https://thecardhive.co.uk");
  assert.deepEqual(ps.map((p) => p.handle), ["00nczWMHWaZRpvp49aWi", "oos", "foil", "nomatch"]);
  assert.deepEqual(ps[0], {
    title: "Sprite Fountain - UNL-078/219",
    handle: "00nczWMHWaZRpvp49aWi",
    url: "https://thecardhive.co.uk/shop?item=00nczWMHWaZRpvp49aWi",
    variants: [{ title: "Near Mint", price: "4.50", available: true }],
    cardId: "c-sprite",
  });
  assert.equal(ps[1].variants[0].available, false);
  assert.equal(ps[1].cardId, "c-bramble-a");
  assert.equal(ps[2].title, "Sprite Fountain - UNL-078/219 Foil");
  assert.equal(ps[2].variants[0].price, "0.94");
  assert.equal(ps[3].cardId, null, "unmatched rows are counted, never handed to the title matcher");
});
