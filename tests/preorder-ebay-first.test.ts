import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { orderPreorderRows, PreorderPriceTable } from "../src/components/PreorderPriceTable";
import type { SealedGroup } from "../src/lib/sealed-import";

(globalThis as { React?: typeof React }).React = React;

// ── eBay first (owner, 2026-10-15) ──────────────────────────────────────────

const NOW = Date.parse("2026-10-15T12:00:00Z");
const fresh = new Date(NOW - 2 * 3600_000).toISOString();
const stale = new Date(NOW - 5 * 24 * 3600_000).toISOString();
const L = (retailer: string, priceCents: number, inStock = true, lastSeen = fresh) => ({
  retailer,
  retailerName: retailer,
  priceCents,
  inStock,
  lastSeen,
  url: `https://example.com/${retailer}`,
});

test("open eBay rows lead, cheapest eBay first; stores keep price-and-stock order", () => {
  const order = orderPreorderRows(
    [L("storeB", 14000), L("ebay_us", 19000), L("storeA", 13000), L("ebay_us2", 17000), L("soldstore", 12000, false)],
    NOW,
  ).map((r) => r.retailer);
  assert.deepEqual(order, ["ebay_us2", "ebay_us", "storeA", "storeB", "soldstore"]);
});

test("a stale or sold-out eBay row is NOT pinned — no greyed 'Unknown' at the top", () => {
  const order = orderPreorderRows([L("storeA", 13000), L("ebay_us", 9000, true, stale), L("ebay_uk", 8000, false)], NOW).map(
    (r) => r.retailer,
  );
  assert.deepEqual(order, ["storeA", "ebay_us", "ebay_uk"], "unknown and sold-out eBay rows stay where rankOffers puts them");
});

test("rendered: eBay leads, labelled on the row; the headline is still the cheapest open offer", () => {
  const group = {
    groupKey: "RAD|Booster Box",
    name: "Radiance Booster Box",
    productType: "Booster Box",
    setCode: "RAD",
    lowestPriceCents: 13000,
    listings: [L("storeA", 13000), L("ebay_us", 19000), L("ebay_uk", 20000, true, stale)],
  } as unknown as SealedGroup;
  const html = renderToStaticMarkup(createElement(PreorderPriceTable, { groups: [group], country: "US", currency: "USD", now: NOW }));
  const stores = [...html.matchAll(/<li data-stock="(\w+)"[\s\S]*?<\/li>/g)].map(
    (m) => m[0].match(/truncate text-sm[^"]*">([^<]+)</)?.[1],
  );
  assert.deepEqual(stores, ["ebay_us", "storeA", "ebay_uk"]);
  assert.match(html, /cheapest open · storeA/, "pinning eBay never moves the headline price");
  const ebayRow = html.match(/<li data-stock="open"[\s\S]*?ebay_us[\s\S]*?<\/li>/)?.[0] ?? "";
  assert.match(ebayRow, />\+46%</, "the dearer eBay row still says how much dearer");
  // The pin is labelled WHERE IT HAPPENS (review finding, 2026-10-15): on the row.
  assert.match(ebayRow, /data-shown-first[^>]*>Shown first</);
  assert.equal((html.match(/data-shown-first/g) ?? []).length, 1, "only the pinned row — not a store, not the stale eBay row");
  // The table's own top line says how it is ordered.
  // Stores taking orders, cheapest first, THEN the unconfirmed and sold-out ones
  // — "every store cheapest first" was inexact (final review, 2026-10-15).
  assert.match(html, /in each, open eBay listings first \(paid links\), then stores\s+taking pre-orders cheapest first, then unconfirmed and sold-out ones/);
});

test("the row says what it IS; 'eBay may have a lower price' is on the SEARCH, where it is true", () => {
  // Review finding (2026-10-15): the stored eBay row is already the cheapest valid
  // listing the importer found (searchEbaySealed sorts by delivered cost and keeps
  // the best), so "eBay may have a lower price than this listing" on it would have
  // been false. A SEARCH also reaches auctions and listings posted since our last
  // check, so the owner's line is true there.
  const group = {
    groupKey: "RAD|Booster Box",
    name: "Radiance Booster Box",
    productType: "Booster Box",
    setCode: "RAD",
    lowestPriceCents: 13000,
    listings: [L("storeA", 13000), L("ebay_us", 19000)],
  } as unknown as SealedGroup;
  const html = renderToStaticMarkup(createElement(PreorderPriceTable, { groups: [group], country: "US", currency: "USD", now: NOW }));
  const ul = html.slice(0, html.indexOf("</ul>"));
  const search = html.slice(html.indexOf("data-ebay-search"));
  assert.match(ul, /data-ebay-note[^>]*>eBay listing at our last check — eBay prices change often</);
  assert.doesNotMatch(html, /lower price than this listing/);
  assert.doesNotMatch(ul, /may have a lower price/, "never on a specific listing");
  assert.match(search, /data-ebay-lower[^>]*>eBay may have a lower price — listings change between our checks</);
  assert.doesNotMatch(html, /cheaper on eBay|eBay is cheaper|best price on eBay/i);
});


test("a price tie between an eBay row and a store does NOT hand the headline to eBay", () => {
  // Final review (2026-10-15): headlineOffer keeps the first of equal prices, so
  // reading it from the PINNED list made eBay win every tie. It reads the
  // unpinned ranking, so ties resolve exactly as they did before the pin.
  const group = {
    groupKey: "RAD|Booster Box",
    name: "Radiance Booster Box",
    productType: "Booster Box",
    setCode: "RAD",
    lowestPriceCents: 13000,
    listings: [L("storeA", 13000), L("ebay_us", 13000)],
  } as unknown as SealedGroup;
  const html = renderToStaticMarkup(createElement(PreorderPriceTable, { groups: [group], country: "US", currency: "USD", now: NOW }));
  assert.match(html, /cheapest open · storeA/);
  const stores = [...html.matchAll(/<li data-stock="(\w+)"[\s\S]*?<\/li>/g)].map((m) => m[0].match(/truncate text-sm[^"]*">([^<]+)</)?.[1]);
  assert.deepEqual(stores, ["ebay_us", "storeA"], "…while the eBay row is still drawn first");
});
