import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isTrackableSealedTitle, misfiledSetLess } from "../src/lib/sealed-import";

// 2026-11-21: single cards and sellers' lots of singles were published as sealed product. Every title is verbatim
// from data/public/sealed-listings.json (20 Nov snapshot): Proving Grounds rares at EUR 8.95-13 were the cheapest
// rows on the Origins Proving Grounds page in the UK and EU, foil singles from two stores each made their own
// "sealed" page, and eBay playsets sat in the Vendetta Bundle group at US$24.99.
const SINGLES = [
  "Annie, Dark Child - Proving Grounds (Rare) [OGS-017]",
  "Lux, Lady of Luminosity - Proving Grounds (Rare) [OGS-021]",
  "Master Yi, Wuju Bladesman - Proving Grounds (Rare) [OGS-019]",
  "Ahri, Nine-Tailed Fox - Riftbound x KDA Couture Collection Foil",
  "Packed Amphitheater - Riftbound x KDA Couture Collection Foil",
  "Ambessa, The Wolf (T1 Worlds Champion Player Bundle) - Riftbound Promotional Cards Foil",
  "Galio, Indefatigable (T1 Worlds Champion Signature Edition Bundle) - Riftbound Promotional Cards Foil",
  "Aspirant's Climb (Oversized) - Riftbound Worlds Bundle 2025 Foil",
  "Ahri, Nine-Tailed Fox (001) Foil - Riftbound x KDA: Couture Collection",
  "Ambessa, The Wolf (V.1 - Showcase) - T1 2025 Worlds Champion Collection (Showcase) [T1X-S001]",
  'Riftbound TCG - "Vendetta" Common & Uncommon Playset Bundle',
  "League of Legends TCG 2025 Riftbound Small Bundle Vendetta Rares B**",
];

test("a single card or a lot of singles is never captured as sealed product", () => {
  for (const t of SINGLES) assert.equal(isTrackableSealedTitle(t), false, t);
});

test("real sealed titles from the same snapshot are still captured", () => {
  for (const t of [
    "Vendetta - Showdown Decks: Zed vs Shen [Foil]",
    "Riftbound Vendetta Booster Box League of Legends TCG 24 Packs Display 14 Cards Each Foil Rares New Mechanics Champions Collectible Trading Card Game",
    "Riftbound: League of Legends TCG - Origins Proving Grounds",
    "Riftbound TCG: Vendetta - Vault Bundle",
    "[PREORDER] Riftbound - League of Legends TCG - Gift of the Rift Bundle - 2026-12-04",
    "Riftbound Gift of the Rift Bundle [2026-12]",
    "Riftbound x T1 2025 Worlds Champion Signature Edition",
  ]) {
    assert.equal(isTrackableSealedTitle(t), true, t);
  }
});

test("a Gift of the Rift row under any other group is misfiled; its own group and other products are not", () => {
  assert.equal(misfiledSetLess("Gift of the Rift Bundle", "VEN|Bundle"), true); // Cardmarket EU, EUR 167
  assert.equal(
    misfiledSetLess("Riftbound League of Legends TCG Gift of the Rift Bundle(PRE-ORDER DEC 2026)", "riftboundleagueoflegendstcggiftoftherift"),
    true,
  );
  assert.equal(misfiledSetLess("Riftbound Gift of the Rift Bundle", "giftoftheriftbundle"), false);
  assert.equal(misfiledSetLess("Riftbound Gift of the Rift Bundle Case", "riftboundgiftoftheriftbundlecase"), false);
  assert.equal(misfiledSetLess("Riftbound TCG: Vendetta - Vault Bundle", "VEN|Bundle"), false);
});

test("Cardmarket files a set-less product under its fixed group, not its expansion", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/cardmarket.ts"), "utf8");
  assert.match(src, /const setLess = setLessGroupKey\(p\.name\);/);
  assert.match(src, /const groupKey = setLess \?\? /);
});
