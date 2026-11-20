import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isTrackableSealedTitle } from "../src/lib/sealed-import";

// 2026-11-20: graded slabs were published as sealed product. Every title below is verbatim from
// data/public/sealed-listings.json that day: a PSA 9 Teemo at US$1,264.95 on the Origins Nexus Night Pack
// page, a PSA 10 Poro on the Secret Garden Box page, a PSA 10 Caitlyn on the Arcane Box Set page, and six
// CGC slabs from a Canadian store's sealed collection, each made into its own "sealed" page.
const SLABS = [
  "Teemo Scout Riftbound Origins Nexus Night Pack #197b PSA 9",
  "RIFTBOUND: LEAGUE OF LEGENDS SGN-SECRET GARDEN GIFT BOX ULTRASOFT PORO PSA 10",
  "2025 Riftbound: League Of Legends Origins #068a Caitlyn Arcane Box Set PSA 10",
  "Riftbound Slab Caitlyn 068a Arcane Box Set CGC Pristine 10 2025",
  "Riftbound Slab Jinx 202b Arcane Box Set CGC 10 Gem 2025",
  "Riftbound Slab Vi 036a Arcane Box Set CGC 9 Mint 2025",
];

test("a graded slab is never captured as sealed product", () => {
  for (const t of SLABS) assert.equal(isTrackableSealedTitle(t), false, t);
});

test("real sealed titles from the same pages are still captured", () => {
  for (const t of [
    "Riftbound League of Legends TCG Gift of the Rift Bundle 16 Booster Packs",
    "Riftbound TCG: Vendetta - Vault Bundle",
    "Riftbound: League of Legends TCG - Secret Garden Gift Box",
  ]) {
    assert.equal(isTrackableSealedTitle(t), true, t);
  }
});

test("the eBay sealed search drops graded listings, the language searches too", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/ebay.ts"), "utf8");
  const at = src.indexOf("export async function searchEbaySealed");
  assert.ok(at > 0);
  assert.match(src.slice(at), /\.filter\(\(it\) => !isGradedListing\(it\.title \?\? ""\)\)/);
});
