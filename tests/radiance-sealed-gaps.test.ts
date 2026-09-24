import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySealed, collectionKind, isTrackableSealedTitle, typeLabel } from "../src/lib/sealed-import";
import { cheapestEnglishSealed, type TcgProduct, type TcgListing } from "../src/lib/tcgplayer";

// Radiance pre-order coverage gaps found 2026-09-24 by probing every tracked
// store's own search against what /radiance-preorders showed. DECISIONS.md,
// "Radiance pre-orders: the stores we were not reading".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("pre-order collections are read — generic ones and set-named ones, never whole inventories", () => {
  for (const h of ["preorders", "pre-orders", "pre-order", "tcg-pre-orders", "all-preorders", "pre-order-products", "pre-order-2", "radiance", "radiance-pre-order", "arcane-league-of-legends"]) {
    assert.equal(collectionKind(h), "preorder", h);
  }
  for (const h of ["riftbound-singles", "riftbound-sealed-products"]) assert.equal(collectionKind(h), "riftbound", h);
  // The first, unanchored rule matched all of these; each is a whole inventory,
  // another game's pre-orders, or another game's "Radiance".
  for (const h of ["all-non-pre-order-in-stock", "yugioh-no-preorder", "non-preorder-products", "pokemon-pre-orders", "magic-the-gathering-new-releases-and-preorders", "astral-radiance-singles", "blooming-radiance-hbp01-boxes-and-packs", "starter-deck-08-flash-of-radiance", "logo.png"]) {
    assert.equal(collectionKind(h), null, h);
  }
});

test("what a mixed pre-order collection yields must name Riftbound outright", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /const STRICT_RIFTBOUND = \/riftbound\|league\\s\*of\\s\*legends\/i;/);
  assert.match(src, /if \(strict && !STRICT_RIFTBOUND\.test\(title\)\) continue;/);
  // An empty or failed pre-order read must never license the store's delete-and-replace.
  assert.match(src, /if \(products\.length && !strict\) scraped = true;/);
});

test("the Vault Bundle is one product, whatever the store calls it", () => {
  for (const t of ["Riftbound Radiance Vault", "Riftbound: Radiance Set 5 Vault Bundle Pre-Order", "Riftbound: League of Legends - Radiance Vault (Pre-Order)", "Riftbound Radiance Bundle"]) {
    assert.equal(classifySealed(t), "Bundle", t);
  }
  assert.equal(typeLabel("RAD", "Bundle"), "Vault Bundle", "Radiance's only bundle is labelled for what it is");
  assert.equal(typeLabel("OGN", "Bundle"), "Bundle", "other sets keep the generic label");
  // A case of them is a different product at ~45x the price.
  assert.equal(classifySealed("Radiance - Vault Bundle Case"), "Bundle Case");
  assert.equal(typeLabel("RAD", "Bundle Case"), "Vault Bundle Case");
  const ebay = read("src/lib/ebay.ts");
  assert.match(ebay, /Bundle: \/bundle\|gift\|\\bvault\\b\/i,/, "eBay's Bundle filter must accept 'Radiance Vault' titles");
  assert.match(ebay, /"Bundle Case": 10000,/);
  assert.match(read("src/lib/sealed-import.ts"), /const query = g\.name\.replace\(\/\\bVault Bundle\$\/, "Vault"\);/);
});

test("a head-to-head 'Champion Deck: A vs B' is the Showdown Decks; a single champion is not", () => {
  assert.equal(classifySealed("Radiance - Riftbound - Champion Deck: Evelynn Vs. Seraphine"), "Showdown Decks");
  assert.equal(classifySealed("Riftbound Champion Deck (Viktor)"), "Champion Deck (Viktor)");
  assert.equal(classifySealed("Vendetta - Showdown Decks: Zed vs Shen Display"), "Showdown Decks Display");
});

test("a Pre-Rift listing for a dated session is an event seat, not a product", () => {
  for (const t of ["Riftbound - Radiance - Pre-Rift - Tuesday Oct 20th - 6:30 PM", "Riftbound Radiance Pre-Rift Sunday 1pm"]) {
    assert.ok(!isTrackableSealedTitle(t), t);
  }
  assert.ok(isTrackableSealedTitle("Riftbound Radiance Pre-Rift Kit"));
  assert.ok(isTrackableSealedTitle("Riftbound: Radiance Pre-Rift Event Kit"));
});

test("TCGplayer sealed is priced at its cheapest English listing, with market as the fallback", () => {
  const p = (listings: Partial<TcgListing>[], marketPrice?: number) =>
    ({ productId: 1, productName: "Radiance - Booster Display", marketPrice, listings }) as unknown as TcgProduct;
  assert.equal(cheapestEnglishSealed(p([{ price: 238.62, quantity: 4, languageId: 1 }, { price: 226.61, quantity: 2, languageId: 1 }]))?.price, 226.61);
  assert.equal(cheapestEnglishSealed(p([{ price: 100, quantity: 1, languageId: 7 }])), null, "non-English is skipped");
  assert.equal(cheapestEnglishSealed(p([{ price: 100, quantity: 0, languageId: 1 }])), null, "sold-out is skipped");
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /const price = listing\?\.price \?\? market;/);
  assert.match(src, /priceCents: Math\.round\(price \* 100\),/);
});
