import test from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, resolveCardId, type CardLite } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// "Charm - Origins #43": a set name with its collector number straight after
// it, no "/total" (The Nerd Merchant; 443 of its 731 singles matched nothing,
// 2026-10-16 store audit, DECISIONS.md "The store audit"). Checked against
// 15,107 live titles from 17 stores: the rule gains those 433 and changes
// nothing else. Its first, looser form (any "#n" in a title naming a set)
// priced sleeves and playmats as cards, which the cases below pin shut.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, name: string, setCode: string, collectorNumber: string): CardLite => ({
  id, name, setCode, collectorNumber, rarity: "Common", variant: null, isPromo: false,
});
const CARDS: CardLite[] = [
  c("charm-ogn", "Charm", "OGN", "043/298"),
  c("hextech-ray-ogn", "Hextech Ray", "OGN", "009/298"),
  c("brutalizer-sfd", "Brutalizer", "SFD", "042/221"),
  c("void-drone-sfd", "Void Drone", "SFD", "010/221"),
  c("brawl-rad", "Brawl", "RAD", "004/167"),
  c("banner-rad", "Banner of Conquest", "RAD", "002/167"),
  // Same name in two sets: only the set + number can tell them apart.
  c("twin-ogn", "Twin Card", "OGN", "100/298"),
  c("twin-sfd", "Twin Card", "SFD", "100/221"),
];
const idx = buildCardIndex(CARDS);
const resolve = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, idx);

test("'<name> - <set> #<n>' matches the printing it names", () => {
  assert.equal(resolve("Charm - Origins #43"), "charm-ogn");
  assert.equal(resolve("Hextech Ray (Foil) - Origins #9"), "hextech-ray-ogn");
  assert.equal(resolve("Brutalizer - Spiritforged #42"), "brutalizer-sfd");
  assert.equal(resolve("Void Drone - Spiritforged #10"), "void-drone-sfd");
  assert.equal(resolve("Twin Card - Spiritforged #100"), "twin-sfd", "the set beside the number decides a two-set name");
  assert.equal(resolve("Twin Card - Origins #100"), "twin-ogn");
});

test("a number that does not follow a set name, or an accessory, never prices a card", () => {
  assert.equal(resolve("Riftbound: League of Legends TCG - Radiance Art Sleeves #4 (100 Sleeves)"), null);
  assert.equal(resolve("Riftbound: League of Legends TCG - Radiance Playmat #2"), null);
  assert.equal(resolve("Riftbound League of Legends - Radiance - #4 Art Sleeves (100ct)"), null);
  assert.equal(resolve("Radiance Booster Pack #2"), null);
  assert.equal(resolve("Pokemon Astral Radiance #4"), null, "Pokémon's Astral Radiance is not ours");
  assert.equal(resolve("Qiyana Victorious - Riftbound Card #46X"), null, "a SKU suffix is not a collector number");
});
