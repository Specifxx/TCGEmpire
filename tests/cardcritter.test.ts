import test from "node:test";
import assert from "node:assert/strict";
import { critterLastPage, critterProducts, parseCritterList } from "../src/lib/cardcritter";
import { RETAILERS } from "../src/lib/retailers";
import { offerCurrencyOk } from "../src/lib/offer-currency";
import type { CardLite } from "../src/lib/price-import";

// Card Critter (cardcritter.com.au), probed 2026-11-16: /riftbound/cards list
// markup, three real entries (attributes trimmed), plus an out-of-stock one.
const entry = (slug: string, alt: string, badge: string, name: string, set: string, num: string, rar: string, price: string) =>
  `<a href="/riftbound/cards/${slug}"><div><img alt="${alt}" src="…"/>${badge}</div><p>${name}</p><p>${set}<!-- --> · <!-- -->${num}<!-- --> · ${rar}</p><p>${price}</p></a>`;
const IN = "<span>In stock</span>";
const HTML =
  entry("amateur-demolitionist", "Amateur Demolitionist (Radiance 001/167)", IN, "Amateur Demolitionist", "Radiance", "001/167", "Common", "<span>$0.11</span>") +
  entry("kayn-unleashed", "Kayn, Unleashed (Radiance 182/167)", IN, "Kayn, Unleashed", "Radiance", "182/167", "Showcase", "<span>$81.95</span>") +
  entry("ghost-card", "Ghost (Radiance 009/167)", "", "Ghost", "Radiance", "009/167", "Rare", "<span>—</span>") +
  entry("mystery-set", "Mystery (Nowhere 001/010)", IN, "Mystery", "Nowhere", "001/010", "Common", "<span>$1.00</span>") +
  `<a aria-label="Next page" href="/riftbound/cards?page=2#cards">2</a><a href="/riftbound/cards?page=24#cards">24</a>`;

const CARDS: CardLite[] = [
  { id: "c-amateur", name: "Amateur Demolitionist", setCode: "RAD", collectorNumber: "001/167", rarity: "Common", variant: null, isPromo: false },
  { id: "c-kayn", name: "Kayn, Unleashed", setCode: "RAD", collectorNumber: "182/167", rarity: "Showcase", variant: null, isPromo: false },
  { id: "c-ghost", name: "Ghost", setCode: "RAD", collectorNumber: "009/167", rarity: "Rare", variant: null, isPromo: false },
];

test("list entries parse name, set, number, rarity, price and stock", () => {
  const items = parseCritterList(HTML);
  assert.equal(items.length, 4);
  assert.deepEqual(items[1], { slug: "kayn-unleashed", name: "Kayn, Unleashed", set: "Radiance", number: "182/167", rarity: "Showcase", priceAud: 81.95, inStock: true });
  assert.equal(items[2].inStock, false);
  assert.ok(Number.isNaN(items[2].priceAud));
});

test("the last page comes from the pagination links", () => {
  assert.equal(critterLastPage(HTML), 24);
  assert.equal(critterLastPage("<p>no pages</p>"), 1);
});

test("only in-stock, priced entries become products, matched by set + number + name", () => {
  const ps = critterProducts(parseCritterList(HTML), CARDS, "https://cardcritter.com.au");
  const byHandle = Object.fromEntries(ps.map((p) => [p.handle, p]));
  assert.equal(byHandle["amateur-demolitionist"].cardId, "c-amateur");
  assert.equal(byHandle["kayn-unleashed"].cardId, "c-kayn");
  assert.equal(byHandle["kayn-unleashed"].variants[0].price, "81.95");
  assert.equal(byHandle["kayn-unleashed"].url, "https://cardcritter.com.au/riftbound/cards/kayn-unleashed");
  assert.equal(byHandle["ghost-card"], undefined, "no badge and no price: not a listing");
  assert.equal(byHandle["mystery-set"].cardId, null, "an unknown set is unmatched, never guessed");
});

test("a name that disagrees with the printing is unmatched", () => {
  const items = parseCritterList(entry("x", "x", IN, "Someone Else", "Radiance", "001/167", "Common", "<span>$0.50</span>"));
  assert.equal(critterProducts(items, CARDS, "https://cardcritter.com.au")[0].cardId, null);
});

test("the retailer entry is an AU store charging AUD", () => {
  const s = RETAILERS.cardcritter;
  assert.equal(s.platform, "cardcritter");
  assert.equal(s.country, "AU");
  assert.ok(offerCurrencyOk("cardcritter", "AU"));
});
