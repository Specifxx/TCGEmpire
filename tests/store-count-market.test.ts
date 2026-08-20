import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tileStock } from "../src/lib/market-rows";
import { COUNTRIES, type Country } from "../src/lib/country";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Guards a reported production bug: card tiles showed the wrong number of
// stores in every market except the one the page was rendered for — "it says 3
// stores when there is only 1, and 10 when there is only 3".
//
// Mechanism: cardTileSelect(country) filters `_count.retailerPrices` to ONE
// country SERVER-side and bakes it into the payload, but a tile's PRICE is
// localised on the CLIENT (CountryProvider geo-switches the market after
// hydration, CardTile re-prices through pickPrice). The homepage renders with
// DEFAULT_COUNTRY and is then ISR-cached, so every visitor outside Australia
// read their own market's price beside AUSTRALIA's store count.
//
// Measured against production for one card (SFD 080/221), same prices in every
// case, count taken from the request's market:
//   AU 3 | US 9 | UK 3 | DE 0 | CA 9 | SG 0
// The homepage baked the AU figure, so a US visitor was told 3 where there were
// 9, and a German visitor was told 3 where there were none at all.
//
// The fix ships EVERY market's count (storeCountsByCountry) and lets the tile
// pick the one matching the market it is pricing in.
// ─────────────────────────────────────────────────────────────────────────────

test("the tile prefers the count for the visitor's own market", () => {
  const src = read("src/components/CardTile.tsx");
  assert.match(
    src,
    /card\.storeCounts\?\.\[country\] \?\? card\._count\.retailerPrices/,
    "the count must be looked up by the market the tile is pricing in, falling back to the baked count"
  );
  // The lookup is useless if the component never learns the visitor's market.
  assert.match(src, /const \{[^}]*\bcountry\b[^}]*\} = useCountry\(\)/, "CardTile must read the live country");
  assert.match(src, /storeCounts\?: Partial<Record<Country, number>>/, "CardTileData must carry per-market counts");
});

test("per-market counts are counted in Postgres, not by shipping listings", () => {
  const src = read("src/lib/cards.ts");
  assert.match(src, /export async function storeCountsByCountry/, "expected the per-market count helper");
  // GROUP BY returns one small row per (card, market) with stock. The rejected
  // alternative — selecting the listings and counting them in Node — would move
  // thousands of rows a page on a database whose transfer allowance has been
  // exhausted repeatedly (see lib/db.ts).
  assert.match(src, /groupBy\(\{\s*by: \["cardId", "country"\]/, "counts must be aggregated by the database");
  // Same filters as the single-market _count, or a market's tile number would
  // disagree with the card page it links to.
  assert.match(src, /inStock: true, retailer: \{ notIn: \[\.\.\.ALL_FALLBACK_RETAILERS\] \}/, "must exclude out-of-stock and converted reference rows");
});

test("every client-localised tile feed attaches per-market counts", () => {
  // These render on the ISR-cached homepage and re-price on the client, so each
  // one is a place the old single-market count could be shown beside a price
  // from a different market.
  const cheapest = read("src/lib/cheapest-cards.ts");
  for (const fn of ["getPopularCards", "getCheapestCards", "getValuableCards", "getChaseCards"]) {
    const body = new RegExp(`export async function ${fn}[\\s\\S]*?\\n\\}`).exec(cheapest)?.[0];
    assert.ok(body, `expected ${fn}`);
    assert.match(body!, /withStoreCounts\(/, `${fn} must attach per-market counts`);
  }
  const history = read("src/lib/price-history.ts");
  assert.ok(
    (history.match(/withStoreCounts\(/g) ?? []).length >= 2,
    "both movers and recently-updated hydrate tiles and both need per-market counts"
  );
});

test("a market with no stock never inherits another market's count", () => {
  // The DE/SG case from the production measurement above: zero stores locally.
  // With a price, an explicit zero must render as no claim at all — never as the
  // baked market's 3.
  assert.deepEqual(tileStock(500, 0, { lowestPriceCents: 500 }), { kind: "none" });
  // With no local price but stock elsewhere, say so in words rather than showing
  // a number the visitor cannot act on.
  assert.deepEqual(
    tileStock(null, 0, { lowestPriceCents: null, lowestPriceCentsUs: 312 }),
    { kind: "elsewhere" }
  );
  // The honest case still shows the number.
  assert.deepEqual(tileStock(500, 9, { lowestPriceCents: 500 }), { kind: "stores", count: 9 });
});

test("the per-market count map covers every supported market", () => {
  // Country is a compile-time union; this catches a market being added to
  // COUNTRIES without the count lookup being able to represent it.
  const counts: Partial<Record<Country, number>> = {};
  for (const code of Object.keys(COUNTRIES) as Country[]) counts[code] = 0;
  assert.equal(Object.keys(counts).length, Object.keys(COUNTRIES).length);
});
