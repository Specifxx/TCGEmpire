import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySealed, sealedSetCode, championDeckSet, championDeckSlugRedirect, misfiledChampionDeck } from "../src/lib/sealed-import";

// A CHAMPION DECK'S CHAMPION NAMES ITS SET (2026-11-22, DECISIONS.md). Real store titles from the 22 Nov sealed export:
// none names a set, so each sat on a title page of one or two stores instead of its set's deck page.
const MOVES: [string, string][] = [
  ["Riftbound League of Legends Trading Card Game: Jinx Champion Deck", "OGN|Champion Deck (Jinx)"], // US
  ["Riftbound League of Legends Trading Card Game: Lee Sin Champion Deck", "OGN|Champion Deck (Lee Sin)"], // US
  ["Riftbound TCG- League of Legends - Champion Deck - (VI)", "UNL|Champion Deck (Vi)"], // US
  ["Riftbound: Champion Deck – Viktor", "OGN|Champion Deck (Viktor)"],
  ["RIFTBOUND CHAMPION DECK FIORA (LIMIT 1)", "SFD|Champion Deck (Fiora)"],
  ["RIFTBOUND CHAMPION DECK VEX", "UNL|Champion Deck (Vex)"],
  ["Riftbound - Champion deck - Rumble", "SFD|Champion Deck (Rumble)"],
  ["RIFTBOUND : LEAGUE OF LEGENDS - RIFTBOUND RUMBLE CHAMPION DECK", "SFD|Champion Deck (Rumble)"],
  ["Champion Deck Lee Sin Riftbound: League of Legends", "OGN|Champion Deck (Lee Sin)"],
  ["Riftbound Origin LeeSin champion deck", "OGN|Champion Deck (Lee Sin)"],
  ["Riftbound: League of Legends TCG - Set One: Origin's Champion Deck: Lee Sin", "OGN|Champion Deck (Lee Sin)"],
  ["Viktor Champion Deck – Riftbound: League of Legends TCG", "OGN|Champion Deck (Viktor)"],
  ["Riftbound League of Legends - Champion Deck (Jinx)", "OGN|Champion Deck (Jinx)"],
];

test("a one-champion deck with no set word goes to its set's deck page", () => {
  for (const [t, key] of MOVES) {
    const type = classifySealed(t);
    assert.equal(`${sealedSetCode(t, type)}|${type}`, key, t);
    assert.equal(misfiledChampionDeck(t, null), true, t);
  }
});

test("two champions, a case, a lot, no champion or a stated set keep what they had", () => {
  for (const t of [
    "Riftbound: League of Legends TCG – Champion Deck - Jinx & Vi",
    "Riftbound League of Legends Champion Deck 4x Lee Sin Sealed Case",
    "Riftbound Champion Deck Brick - No Pack",
    "League of Legends Riftbound TCG: Champion Deck V1",
    "Riftbound: Champion Deck (Set 1)",
  ]) assert.equal(championDeckSet(t, classifySealed(t)), null, t);
  // The set word still wins: Legacy's Ashe is LGC by its title, and an Origins title keeps OGN.
  assert.equal(sealedSetCode("Riftbound Legacy Champion Deck Ashe English (PRESALE)", "Champion Deck (Ashe)"), "LGC");
  assert.equal(sealedSetCode("Riftbound Origins Champion Deck Victor", classifySealed("Riftbound Origins Champion Deck Victor")), "OGN");
  // Not a Champion Deck type: a Trial Deck or a Showdown pair is never moved by its champion.
  assert.equal(sealedSetCode("Jinx Trial Deck", classifySealed("Jinx Trial Deck")), null);
  // A Gift of the Rift bundle stays set-less.
  assert.equal(sealedSetCode("Riftbound Gift of the Rift Bundle", classifySealed("Riftbound Gift of the Rift Bundle")), null);
  // A row already in a set's group is never misfiled.
  assert.equal(misfiledChampionDeck("Riftbound: Champion Deck – Jinx", "OGN"), false);
});

test("an old title page of a one-champion deck 301s to its set's deck page; a cut or unclear slug does not", () => {
  for (const [slug, to] of [
    ["riftboundchampiondeckjinx", "ogn-champion-deck-jinx"],
    ["riftboundchampiondeckvi", "unl-champion-deck-vi"],
    ["riftboundchampiondeckviktor", "ogn-champion-deck-viktor"],
    ["riftboundchampiondeckfioralimit1", "sfd-champion-deck-fiora"],
    ["riftboundoriginleesinchampiondeck", "ogn-champion-deck-lee-sin"],
    ["championdeckleesinriftboundleagueoflegen", "ogn-champion-deck-lee-sin"],
    ["jinxchampiondeckriftboundleagueoflegends", "ogn-champion-deck-jinx"],
    ["riftboundtcgrumblechampiondeck", "sfd-champion-deck-rumble"],
  ]) assert.equal(championDeckSlugRedirect(slug), to, slug);
  for (const slug of [
    "riftboundleagueoflegendschampiondecklees", // cut before the whole name
    "riftboundleagueoflegendschampiondeck4xle", // a case
    "riftboundchampiondeckbricknopack",
    "riftboundchampiondeckset1",
    "ogn-champion-deck-jinx", // the page itself
  ]) assert.equal(championDeckSlugRedirect(slug), null, slug);
});

test("the sealed page tries the champion redirect before a 404", () => {
  const page = readFileSync("src/app/sealed/[slug]/page.tsx", "utf8");
  assert.match(page, /championDeckSlugRedirect\(params\.slug\)[\s\S]*permanentRedirect[\s\S]*notFound\(\)/);
});
