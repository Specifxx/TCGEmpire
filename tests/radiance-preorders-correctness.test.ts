import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  offerStock,
  headlineOffer,
  openStoreCount,
  rankOffers,
  offerStockLabel,
  OFFER_STALE_H,
} from "../src/lib/sealed-offers";
import { STORE_ROWS_MAX_AGE_H } from "../src/lib/retailers";
import { canonicalSealedRow, dedupeStoreListings, classifySealed, type SealedGroup } from "../src/lib/sealed-import";
import { PreorderPriceTable, preorderTableGroups, pricedPreorderGroups } from "../src/components/PreorderPriceTable";

// /radiance-preorders data correctness, 2026-09-24 — DECISIONS.md, "Sold-out
// pre-orders ranked as the cheapest". The US Radiance Booster Box headline was
// Many Realms at US$119.99, a box its own page said was sold out.

// tsx compiles the component's JSX with the classic runtime (React.createElement),
// which Next's own compiler never needs; give it the global it expects.
(globalThis as { React?: typeof React }).React = React;

const NOW = Date.parse("2026-09-24T14:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

type Listing = SealedGroup["listings"][number];
const L = (retailer: string, priceCents: number, inStock: boolean, ageH = 2): Listing => ({
  retailer,
  retailerName: retailer,
  priceCents,
  url: `https://${retailer}.example/p`,
  inStock,
  lastSeen: hoursAgo(ageH),
});

function group(groupKey: string, name: string, listings: Listing[]): SealedGroup {
  const open = listings.filter((l) => offerStock(l, NOW) === "open");
  return {
    groupKey,
    name,
    productType: groupKey.split("|")[1],
    setCode: "RAD",
    imageUrl: null,
    lowestPriceCents: open.length ? Math.min(...open.map((l) => l.priceCents)) : null,
    storeCount: new Set(open.map((l) => l.retailer)).size,
    msrpCents: null,
    atMsrp: false,
    overMsrpPct: null,
    firstSeenAt: null,
    listings,
  };
}

// The US Booster Box as stored on 2026-09-24 (scripts/diagnose-sealed.ts), plus
// the Game Nerdz and Miniature Market pages as read by the new product-page path.
const BOX = [
  L("manyrealms", 11999, false),
  L("gamenerdz", 12997, true),
  L("miniaturemarket", 13999, false),
  L("wulfgaming", 14999, false),
  L("ebay_us", 19000, true, 20),
  L("punkouter", 19999, true),
  L("tcgplayer", 22658, true),
];

// ── 1a: stock state ─────────────────────────────────────────────────────────

test("1a: three states — open, sold out, and unknown once a row is past the store-row age limit", () => {
  assert.equal(offerStock(L("a", 100, true), NOW), "open");
  assert.equal(offerStock(L("a", 100, false), NOW), "soldout");
  assert.equal(offerStock(L("a", 100, true, OFFER_STALE_H + 1), NOW), "unknown");
  assert.equal(offerStock(L("a", 100, false, OFFER_STALE_H + 1), NOW), "unknown");
  assert.equal(OFFER_STALE_H, STORE_ROWS_MAX_AGE_H, "the same staleness threshold the singles importer expires rows at");
  assert.equal(offerStockLabel("open", true), "Pre-order open");
  assert.equal(offerStockLabel("open", false), "In stock");
  assert.equal(offerStockLabel("soldout", true), "Sold out");
  assert.equal(offerStockLabel("unknown", true), "Unknown");
});

test("1a: a sold-out or stale offer is never the headline, and never counts as taking pre-orders", () => {
  assert.equal(headlineOffer(BOX, NOW)?.retailer, "gamenerdz");
  assert.equal(openStoreCount(BOX, NOW), 4);
  // Cheapest row overall is stale — still not the headline.
  assert.equal(headlineOffer([L("old", 50, true, 200), L("new", 90, true)], NOW)?.retailer, "new");
  assert.equal(headlineOffer([L("x", 50, false)], NOW), null);
  // Sold out sinks below every open and unknown offer, whatever its price.
  const ranked = rankOffers([L("so", 1, false), L("unk", 2, true, 200), L("op", 3, true)], NOW);
  assert.deepEqual(ranked.map((l) => l.retailer), ["op", "unk", "so"]);
});

test("1a acceptance: the rendered US Booster Box row", () => {
  const html = renderToStaticMarkup(
    createElement(PreorderPriceTable, {
      groups: [group("RAD|Booster Box", "Radiance Booster Box", BOX)],
      country: "US",
      currency: "USD",
      now: NOW,
    }),
  );
  // Headline is an in-stock store, not Many Realms.
  assert.match(html, /data-headline[^>]*>US\$129\.97</);
  assert.match(html, /cheapest open · gamenerdz/);
  assert.match(html, /4 stores taking pre-orders/);
  // Many Realms is listed, badged Sold out, and sorted below every open offer.
  const rows = [...html.matchAll(/<li data-stock="(\w+)"[\s\S]*?<\/li>/g)].map((m) => ({
    state: m[1],
    store: m[0].match(/truncate text-sm[^"]*">([^<]+)</)?.[1],
  }));
  assert.deepEqual(
    rows.map((r) => `${r.store}:${r.state}`),
    [
      "gamenerdz:open",
      "ebay_us:open",
      "punkouter:open",
      "tcgplayer:open",
      "manyrealms:soldout",
      "miniaturemarket:soldout",
      "wulfgaming:soldout",
    ],
  );
  const manyRealms = html.match(/<li data-stock="soldout"[\s\S]*?manyrealms[\s\S]*?<\/li>/)?.[0] ?? "";
  assert.match(manyRealms, />Sold out</);
  assert.match(manyRealms, /opacity-60/, "greyed out");
  assert.doesNotMatch(manyRealms, /btn-/, "no buy-button emphasis on a sold-out offer");
  assert.match(manyRealms, /<time dateTime="2026-09-24T12:00:00\.000Z"/, "per-offer checked stamp");
});

// ── 1d: one Vault row ───────────────────────────────────────────────────────

test("1d: a legacy 'Vault' row joins the Vault Bundle group, and a store in both appears once", () => {
  const legacy = canonicalSealedRow({ groupKey: "RAD|Vault", productType: "Vault", setCode: "RAD" });
  assert.deepEqual(legacy, { groupKey: "RAD|Bundle", productType: "Bundle", setCode: "RAD" });
  const bundle = { groupKey: "RAD|Bundle", productType: "Bundle", setCode: "RAD" };
  assert.equal(canonicalSealedRow(bundle), bundle, "current rows pass through untouched");
  // The classifier itself already agrees, so a re-scraped row lands there too.
  assert.equal(classifySealed("Riftbound League of Legends - Radiance - Vault"), "Bundle");
  assert.equal(classifySealed("Radiance - Vault Bundle"), "Bundle");
  assert.equal(classifySealed("Radiance - Vault Bundle Case"), "Bundle Case");

  // eBay US carried the same listing in "RAD|Vault" and "RAD|Bundle".
  const merged = dedupeStoreListings(
    [L("ebay_us", 4578, true), L("manyrealms", 3499, false), L("ebay_us", 4578, true), L("punkouter", 3999, false)],
    NOW,
  );
  assert.deepEqual(merged.map((l) => l.retailer), ["manyrealms", "punkouter", "ebay_us"]);
  // When a store is in both, the orderable listing wins over a cheaper sold-out one.
  const pick = dedupeStoreListings([L("s", 100, false), L("s", 200, true)], NOW);
  assert.deepEqual(pick.map((l) => [l.priceCents, l.inStock]), [[200, true]]);
});

// ── 1e: products sorted by cheapest AVAILABLE offer ─────────────────────────

test("1e: products sort by their cheapest open offer; a product with none goes last", () => {
  const vault = group("RAD|Bundle", "Radiance Vault Bundle", [L("manyrealms", 3499, false), L("ebay_us", 4578, true)]);
  const decks = group("RAD|Showdown Decks", "Radiance Showdown Decks", [L("fab", 2499, false), L("tcg", 9861, true)]);
  const pack = group("RAD|Booster Pack", "Radiance Booster Pack", [L("punkouter", 699, false)]);
  const box = group("RAD|Booster Box", "Radiance Booster Box", BOX);
  const order = preorderTableGroups([box, pack, decks, vault]).map((g) => g.groupKey);
  // Vault's cheapest LISTING (US$34.99) is sold out, so it ranks at US$45.78.
  assert.deepEqual(order, ["RAD|Bundle", "RAD|Showdown Decks", "RAD|Booster Box", "RAD|Booster Pack"]);
  // Structured data / CTAs only get products with an open offer.
  assert.deepEqual(pricedPreorderGroups([pack, box]).map((g) => g.groupKey), ["RAD|Booster Box"]);
});
