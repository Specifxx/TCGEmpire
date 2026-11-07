import { test } from "node:test";
import assert from "node:assert/strict";
import { wrongBoosterCaseQuantity } from "../src/lib/ebay";

// An eBay seller's feedback on MTG Compare (2026-11-07): a 120-pack sleeved case was shown as a six-box case's best price.
// Kept: real store and eBay titles of Riftbound Booster Cases on 2026-11-07. Refused: the same titles with another quantity.
test("a Booster Case listing of another quantity is not the six-box case", () => {
  for (const t of [
    "League Of Legends Riftbound Origins Booster Box Case - 6x Booster Boxes  Sealed",
    "Riftbound League of Legends TCG RADIANCE 6 BOX BOOSTER BOX CASE Factory Sealed",
    "Riftbound Radiance Booster Box Display SEALED CASE 6 cajas NUEVO EMBALAJE ORIGINAL | distribuidor✅",
    "Riftbound League of Legends TCG Unleashed Booster Display Case of 6",
    "Riftbound: League of Legends - Vendetta Booster Box Case(3)",
    "Riftbound: League of Legends TCG: Set 3 - Unleashed Booster Case – English",
  ]) assert.equal(wrongBoosterCaseQuantity(t), false, t);
  for (const t of [
    "Riftbound Origins Booster Box Case of 4",
    "Riftbound Spiritforged Booster Case x2 Factory Sealed",
    "Riftbound Origins Sealed Booster Case (Sleeved Boosters)",
    "Riftbound Origins Booster Case 120 Packs",
  ]) assert.equal(wrongBoosterCaseQuantity(t), true, t);
});
