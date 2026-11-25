import test from "node:test";
import assert from "node:assert/strict";
import { classifySealed, severalChampionDeckRedirect, championDeckSet } from "../src/lib/sealed-import";
import { sealedSlug } from "../src/lib/sealed-slug";

// A BRACKET NAMING SEVERAL CHAMPIONS IS NOT ONE DECK (2026-11-25). Real titles from the 24 Nov sealed export.
test("all four Legacy champions in one bracket is the four-deck set", () => {
  assert.equal(classifySealed("Riftbound TCG: Legacy Champion Deck (Tryndamere, Ashe, Lux, Garen)"), "Champion Deck Set (4)"); // universetcg EU, EUR 100
  assert.equal(sealedSlug("LGC|Champion Deck Set (4)"), "lgc-champion-deck-set-4");
});

test("a bracket of several champions as a choice, or only some, is never one champion's deck", () => {
  assert.equal(classifySealed("Riftbound Legacy Champion Deck (Tryndamere / Ashe / Lux / Garen)"), "Champion Deck");
  assert.equal(classifySealed("Riftbound Legacy Champion Deck (Ashe or Lux)"), "Champion Deck");
  assert.equal(classifySealed("Riftbound Legacy Champion Deck (Ashe, Lux)"), "Champion Deck");
});

test("one champion in a bracket keeps its deck", () => {
  assert.equal(classifySealed("Riftbound Origins Champion Deck (Viktor)"), "Champion Deck (Viktor)");
  assert.equal(classifySealed("Riftbound Legacy Champion Deck (Pre Order)"), "Champion Deck");
});

test("Trydamere is Tryndamere misspelt (zatugames UK)", () => {
  const t = "Riftbound League of Legends - Legacy Champion Deck - Trydamere";
  assert.equal(classifySealed(t), "Champion Deck (Tryndamere)");
  assert.equal(championDeckSet("Riftbound Champion Deck - Trydamere", "Champion Deck (Tryndamere)"), "LGC");
});

test("the old several-champion page 301s to the set, and nothing else moves", () => {
  assert.equal(severalChampionDeckRedirect(sealedSlug("LGC|Champion Deck (Tryndamere, Ashe, Lux, Garen)")), "lgc-champion-deck-set-4");
  assert.equal(severalChampionDeckRedirect("ogn-champion-deck-jinx-vi"), "ogn-champion-deck");
  assert.equal(severalChampionDeckRedirect("lgc-champion-deck-ashe"), null);
  assert.equal(severalChampionDeckRedirect("lgc-champion-deck-set-4"), null);
  assert.equal(severalChampionDeckRedirect("lgc-champion-deck"), null);
  assert.equal(severalChampionDeckRedirect("xyz-champion-deck-ashe-lux"), null);
});
