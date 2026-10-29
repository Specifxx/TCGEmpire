import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySealed, detectSet, fetchProducts, isTrackableSealedTitle, WHOLE_CATALOGUE } from "../src/lib/sealed-import";
import { sealedFloorCents } from "../src/lib/ebay";
import { RETAILERS } from "../src/lib/retailers";
import { SEALED_ONLY_SHOPIFY } from "../src/lib/sealed-stores";
import { offerCurrencyOk } from "../src/lib/offer-currency";

// L'Atelier TCG (Laval, QC; asked by email 2026-10-29) runs its own platform, not
// Shopify, but serves Shopify's feed format for its whole catalogue at
// /products.json (every game, CAD, a `url` linking its own product page). The
// fixture is a sample of that live feed as read on 2026-10-29: its 22 Riftbound
// products, then a few of its Magic and One Piece ones.
const FIXTURE = readFileSync(new URL("./fixtures/ateliertcg-products-2026-10-29.json", import.meta.url), "utf8");
const STRICT = /riftbound|league\s*of\s*legends/i;

test("L'Atelier TCG is a sealed-only CA store reading its whole catalogue strictly", () => {
  const s = SEALED_ONLY_SHOPIFY.find((x) => x.key === "ateliertcg");
  assert.ok(s, "registered in lib/sealed-stores.ts");
  assert.equal(s.base, "https://ateliertcg.com");
  assert.equal(s.country, "CA");
  assert.equal(s.currency, "CAD");
  assert.deepEqual(s.collections, [WHOLE_CATALOGUE]);
  assert.ok((s.maxPages ?? 0) * 250 >= 2500, "1,716 products on 2026-10-29, with headroom");
  assert.equal(s.strictTitles, true, "the catalogue holds every game");
  assert.ok(!RETAILERS.ateliertcg, "no Riftbound singles: in RETAILERS it would read as a broken store");
  assert.equal(offerCurrencyOk("ateliertcg", "CA"), true);
  // Its second storefront sells the same stock at the same prices (284 of 284 products): one stock, one store.
  assert.ok(!SEALED_ONLY_SHOPIFY.some((x) => x.base.includes("ccctcg")) && !Object.values(RETAILERS).some((r) => r.base.includes("ccctcg")));
});

test("the whole catalogue is one /products.json read, and no collection is discovered for it", async () => {
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\nDisallow: /*/cart\n", { status: 200 });
    asked.push(u.pathname);
    return new Response(FIXTURE, { status: 200 });
  }) as typeof fetch;
  const products = await fetchProducts("https://ateliertcg.com", WHOLE_CATALOGUE, "CA", 12).finally(() => {
    globalThis.fetch = realFetch;
  });
  assert.deepEqual(asked, ["/products.json"]);
  assert.equal(products.length, 28);
  const src = readFileSync(new URL("../src/lib/sealed-import.ts", import.meta.url), "utf8");
  assert.match(src, /\.includes\(WHOLE_CATALOGUE\) \? \{ riftbound: \[\], preorder: \[\] \} : await discoverCollections/);
});

test("its Riftbound sealed classifies; accessories, other games and the French display do not", () => {
  const { products } = JSON.parse(FIXTURE) as { products: { title: string }[] };
  const kept = products.filter((p) => STRICT.test(p.title) && isTrackableSealedTitle(p.title)).map((p) => [detectSet(p.title), classifySealed(p.title)].join("|"));
  assert.deepEqual(kept, [
    "VEN|Booster Box",
    "VEN|Bundle",
    "OGN|Booster Box",
    "SFD|Booster Box",
    "SFD|Champion Deck (Fiora) Display",
    "SFD|Champion Deck (Rumble) Display",
    "UNL|Booster Box",
    "UNL|Bundle",
    "RAD|Booster Box",
    "RAD|Bundle",
    "VEN|Showdown Decks",
  ]);
});

test("a 'Champion Deck Display' priced like one deck is refused by the display floor", () => {
  // "Riftbound League of Legends TCG Spiritforged Champion Deck Display: Fiora" at C$30.12 is one deck.
  assert.ok(3012 < sealedFloorCents("Champion Deck (Fiora) Display"));
  assert.ok(1767 < sealedFloorCents("Champion Deck (Rumble) Display"));
  assert.equal(sealedFloorCents("Champion Deck (Fiora) Display"), sealedFloorCents("Showdown Decks Display"));
  assert.ok(sealedFloorCents("Champion Deck (Fiora)") < 3012, "a single deck is not held to it");
});
