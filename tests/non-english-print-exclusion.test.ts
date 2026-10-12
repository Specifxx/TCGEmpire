import test from "node:test";
import assert from "node:assert/strict";
import { isForeignLanguageTitle } from "../src/lib/scrape-http";
import { isTrackableSealedTitle } from "../src/lib/sealed-import";

// 2026-10-12, a member's message: "especially in Canada now with the French
// versions having released ... a lot of booster boxes are going to show as $150
// but that's due to French versions becoming available, meanwhile the English
// versions will still be closer to $300." Every title below was a live listing
// in the 9 October public data snapshot, grouped with the English product.

const FRENCH = [
  "Riftbound - Spiritforged - Booster Box - French",
  "[FRENCH] Riftbound - League of Legends TCG: Unleashed - Booster Box",
  "RIFTBOUND - Origins - BOOSTER BOX [French/Français]",
  "Riftbound TCG: Origins Lee Sin Champion Deck - FR",
  "Vendetta Booster Box (French)",
  "[FRENCH] Origines - Riftbound - Booster Box",
  "Riftbound - Déchainés - Vault - FR",
  "Riftbound: League of Legends TCG : Case scellée de 6 Displays Set 3 : Dechainement",
  "Riftbound TCG : Origins VF Proving grounds  Premiers pas",
  "RIFTBOUND LEAGUE OF LEGENDS TCG UNLEASHED BOOSTER DISPLAY (French)(Local Pickup Only)",
];

const SPANISH_TITLED_CJK = [
  "Caja de Sobres de Origins Jumbo Booster Box 12 (Chino)",
  "RIFTBOUND – SPIRITFORGED BOOSTER BOX (SLIM BOX) – CHINO",
  "[Sellado de fábrica] RIFTBOUND, coreano, 1 x Origins Champion Deck Jinx",
];

// English listings, including the ways European and Québécois stores say so.
const ENGLISH = [
  "Riftbound: League of Legends TCG - Radiance Booster Display - EN (Vorbestellung)",
  "BOOSTER BOX Radiance (24 sobres) –  RIFTBOUND  – INGLES",
  "Riftbound League of Legends - Radiance Booster Display (englisch)",
  "RIFTBOUND LEAGUE OF LEGENDS TCG RADIANCE BOOSTER DISPLAY  ***PREORDER***",
  "Riftbound: League of Legends - Radiance Booster Box (Pre-Order)",
  "Riftbound - Radiance - Pre-Rift - 16.10.2026",
  "League of Legends: Riftbound TCG - Radiance - Booster Display (MAX 6 PER CUSTOMER)",
];

test("French-print and Spanish-titled CJK listings are non-English", () => {
  for (const t of [...FRENCH, ...SPANISH_TITLED_CJK]) assert.ok(isForeignLanguageTitle(t), t);
});

test("English listings are not", () => {
  for (const t of ENGLISH) assert.ok(!isForeignLanguageTitle(t), t);
});

test("a French booster box is not tracked as sealed; the English one is", () => {
  assert.ok(!isTrackableSealedTitle("Riftbound - Spiritforged - Booster Box - French"));
  assert.ok(isTrackableSealedTitle("Riftbound - Spiritforged - Booster Box"));
});
