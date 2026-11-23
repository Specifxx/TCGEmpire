import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifySealed,
  isTrackableSealedTitle,
  misfiledShowdownDeck,
  sealedSetCode,
  showdownDeckSet,
  showdownDeckSlugRedirect,
} from "../src/lib/sealed-import";

// A SHOWDOWN PAIR NAMES ITS SET (2026-11-23, DECISIONS.md). Real titles from the 22 Nov sealed export: each sat on a
// title page of one to four stores, or on a set page the pair does not belong to.
const MOVES: [string, string][] = [
  ["RIFTBOUND SHOWDOWN DECK - EVELYNN VS SERAPHINE", "RAD|Showdown Decks"],
  ["Riftbound - Showdown deck - Evelynn Vs. Seraphine", "RAD|Showdown Decks"],
  ["Riftbound : Showdown Deck  - EVELYNN VS SERAPHINE", "RAD|Showdown Decks"],
  ["Riftbound - League of Legends TCG: Showdown Decks - Evelynn vs. Seraphine (LIMIT 1)", "RAD|Showdown Decks"],
  ["Riftbound: League of Legends TCG - Evelynn vs Seraphine Showdown Decks", "RAD|Showdown Decks"],
  ["Riftbound: League of Legends TCG - Evelynn vs Seraphine Showdown Deck", "RAD|Showdown Decks"],
  ["RIFTBOUND League of Legends TCG Zed Vs Shen Showdown Decks", "VEN|Showdown Decks"],
  ["Riftbound: League of Legends - Showdown Decks: Zed vs Shen", "VEN|Showdown Decks"],
  ["Riftbound - Showdown deck - Zed Vs. Shen", "VEN|Showdown Decks"],
  ["RIFTBOUND ZED VS SHEN SHOWDOWN DECK", "VEN|Showdown Decks"],
  ["Riftbound Vandetta Showdown Deck Zed VS Shen - League Of Legends", "VEN|Showdown Decks"],
  // A set word that is wrong for the pair: Unleashed never had a Showdown pair (Nerd Merchant, US).
  ["Unleashed - Showdown Decks - Zed vs Shen", "VEN|Showdown Decks"],
  // Titles that already named the set keep it.
  ["Riftbound League of Legends TCG - Radiance Showdown Decks Evelynn vs Seraphine", "RAD|Showdown Decks"],
  ["Vendetta - Showdown Decks: Zed vs Shen Display", "VEN|Showdown Decks Display"],
  // Alt F4's "Champion Deck: Evelynn Vs. Seraphine" types as the Showdown pair.
  ["Riftbound Champion Deck: Evelynn Vs. Seraphine", "RAD|Showdown Decks"],
];

test("a Showdown pair goes to its own set's Showdown page", () => {
  for (const [t, key] of MOVES) {
    const type = classifySealed(t);
    assert.equal(`${sealedSetCode(t, type)}|${type}`, key, t);
  }
  assert.equal(misfiledShowdownDeck("RIFTBOUND ZED VS SHEN SHOWDOWN DECK", null), true);
  assert.equal(misfiledShowdownDeck("Unleashed - Showdown Decks - Zed vs Shen", "UNL"), true);
  assert.equal(misfiledShowdownDeck("Riftbound Vendetta Showdown Deck Zed vs Shen", "VEN"), false);
});

test("no pair, half a pair, a case or another product type is never moved by the pair", () => {
  for (const t of [
    "Riftbound Showdown Deck", // Mystery MTG (US): names no pair, keeps its title page
    "Riftbound Showdown Deck - Zed",
    "Riftbound Showdown Decks Zed vs Shen Case of 6",
  ]) assert.equal(showdownDeckSet(t, classifySealed(t)), null, t);
  assert.equal(showdownDeckSet("Vendetta - Vault Bundle + Showdown Bundle", classifySealed("Vendetta - Vault Bundle + Showdown Bundle")), null);
  assert.equal(showdownDeckSet("Evelynn vs Seraphine", "Booster Box"), null);
  // A Champion Deck still goes by its champion, and the Gift of the Rift bundle stays set-less.
  assert.equal(sealedSetCode("Riftbound: Champion Deck – Jinx", classifySealed("Riftbound: Champion Deck – Jinx")), "OGN");
  assert.equal(sealedSetCode("Riftbound Gift of the Rift Bundle", classifySealed("Riftbound Gift of the Rift Bundle")), null);
});

test("an old Showdown title page 301s to its pair's page, or /sealed when the slug names no pair", () => {
  for (const [slug, to] of [
    ["riftboundshowdowndeckevelynnvsseraphine", "/sealed/rad-showdown-decks"],
    ["riftboundleagueoflegendstcgevelynnvssera", "/sealed/rad-showdown-decks"], // cut at 40 letters
    ["riftboundleagueoflegendstcgzedvsshenshow", "/sealed/ven-showdown-decks"],
    ["riftboundleagueoflegendsshowdowndeckszed", "/sealed/ven-showdown-decks"],
    ["riftboundshowdowndeckzedvsshen", "/sealed/ven-showdown-decks"],
    ["riftboundzedvsshenshowdowndeck", "/sealed/ven-showdown-decks"],
    ["riftboundvandettashowdowndeckzedvsshenle", "/sealed/ven-showdown-decks"],
    ["riftboundleagueoflegendstcgshowdowndecks", "/sealed"], // cut before the pair
    ["unl-showdown-decks", "/sealed"],
  ]) assert.equal(showdownDeckSlugRedirect(slug), to, slug);
  for (const slug of ["riftboundchampiondeckjinx", "riftboundshowdowndeckcaseof6", "ogn-booster-box"]) {
    assert.equal(showdownDeckSlugRedirect(slug), null, slug);
  }
});

test("Funko POP! vinyls are never a Riftbound sealed product", () => {
  for (const t of [
    "Arcane: League of Legends (TV) Bundle - 5 POP! Vinyls", // Ozzie, A$104.95
    "League of Legends Bundle 2 - 4 POP! Vinyls",
    "Funko Pop Riftbound Jinx Bundle",
  ]) assert.equal(isTrackableSealedTitle(t), false, t);
  assert.equal(isTrackableSealedTitle("Riftbound: League of Legends TCG - Radiance Booster Box"), true);
});

test("the sealed page tries the Showdown redirect before a 404", () => {
  const page = readFileSync("src/app/sealed/[slug]/page.tsx", "utf8");
  assert.match(page, /showdownDeckSlugRedirect\(params\.slug\)[\s\S]*permanentRedirect[\s\S]*notFound\(\)/);
});
