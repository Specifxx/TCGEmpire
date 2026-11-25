import { test } from "node:test";
import assert from "node:assert/strict";
import { wrongSealedEbayProduct } from "../src/lib/ebay";
import { classifySealed } from "../src/lib/sealed-import";

// Real eBay titles from the 21 Nov 2026 sealed export, each filed under the group the search asked for while being
// another product (DECISIONS.md, 2026-11-22). Kept: real eBay and store titles of the same types from that export.
test("an eBay listing of another product is refused for the group searched", () => {
  const refused: [string, string][] = [
    ["Riftbound League of Legends TCG Set 1 Origins Jinx Champion Deck", "Champion Deck (Lee Sin)"],
    ["Riftbound League of Legends TCG Set 1 Origins Jinx Champion Deck", "Champion Deck (Leesin)"],
    ["BRICK ONLY Riftbound: League of Legends TCG Origins: Champion Deck (Viktor)", "Champion Deck (Viktor)"],
    ["BRICK ONLY Riftbound: League of Legends TCG Origins: Champion Deck (Viktor)", "Champion Deck"],
    ["Riftbound: Radiance - Nexus Night Kit - 47 Sealed  Packs 1 Open pack", "Nexus Night Pack"],
    ["Riftbound League of legends Unleashed Nexus Night Packs bundle of 10", "Nexus Night Pack"],
    ["Riftbound League of legends Unleashed Nexus Night Packs bundle of 10", "Bundle"],
    ["Riftbound TCG 5x Origins Nexus Night Promo Packs SEALED League of Legends Promo", "Nexus Night Pack"],
    ["Set of 2 Riftbound League of Legends Spiritforged Starter Decks SEALED & IN HAND", "Starter Set"],
    ["Riftbound Starter Set 1000 cartas ES colección paquete Origins Spirit 1 Booster etc.", "Starter Set"],
    ["RIFTBOUND LEAGUE OF LEGENDS OGN-ORIGINS ARCANE BOX SET JINX - REBEL PCG 9.5", "Box Set"],
    // 22 Nov export: one champion's deck on a set's generic Champion Deck page, a booster box on OGN|Box Set.
    ["Riftbound League of Legends TCG Set 1 Origins Jinx Champion Deck", "Champion Deck"],
    ["Lee Sin Champion Deck Origins Riftbound League Of Legends", "Champion Deck"],
    ["Riftbound TCG: Unleashed Champion Deck (Vi) SEALED DECK", "Champion Deck"],
    ["Riftbound League of Legends TCG - Legacy Champion Deck - Ashe (Presell) English", "Champion Deck"],
    ["Riftbound - League of Legends TCG - Vendetta - Champion Deck Display: Zed vs.", "Champion Deck"],
    ["Riftbound League of Legends Set One Origins Booster Box ENG Wave 1", "Box Set"],
    ["Riftbound Origins League of Legends Trading Card Game Set 1 Booster Display Box", "Box Set"],
  ];
  for (const [t, type] of refused) assert.notEqual(wrongSealedEbayProduct(t, type), null, `${type}: ${t}`);
  const kept: [string, string][] = [
    ["Riftbound League of Legends TCG Set 1 Origins Jinx Champion Deck", "Champion Deck (Jinx)"],
    ["Riftbound: League of Legends TCG - Set 01 - Origins - Champion Deck - Lee Sin", "Champion Deck (Lee Sin)"],
    ["Riftbound: League of Legends TCG - Set 01 - Origins - Champion Deck - Lee Sin", "Champion Deck (Set 1)"],
    ["Riftbound Origin Jinx champion deck", "Champion Deck (Jinx)"],
    ["Riftbound League of Legends Arcane Box Set Six Foil Champion Legend Cards Card Game", "Box Set"],
    ["Riftbound: League of Legends Arcane Box Set", "Box Set"],
    ["Riftbound Spiritforged Booster Pack (14 cards)", "Booster Pack"],
    ["Riftbound Unleashed Bundle - 10 Booster Packs", "Bundle"],
    ["Riftbound Origins Booster Box 36 Packs Factory Sealed", "Booster Box"],
    ["Riftbound Origins Nexus Night Promo Pack x1 Sealed", "Nexus Night Pack"],
    ["Riftbound Origins Champion Deck", "Champion Deck"],
    ["League of Legends Riftbound TCG: Origins - Champion Decks", "Champion Deck"],
    ["Riftbound Spiritforged Champion Deck Sealed Display Set - Fiona and Rumble", "Champion Deck Display"],
    ["Riftbound: League of Legends TCG Arcane Box Set Sealed English New", "Box Set"],
    ["Arcane Box Set - Origins: Promos", "Box Set"],
  ];
  for (const [t, type] of kept) assert.equal(wrongSealedEbayProduct(t, type), null, `${type}: ${t}`);
});

test("classifySealed still names the champion from the shared list", () => {
  assert.equal(classifySealed("Riftbound Origin Jinx champion deck"), "Champion Deck (Jinx)");
  assert.equal(classifySealed("Riftbound Legacy Champion Deck Ashe English (PRESALE)"), "Champion Deck (Ashe)");
});
