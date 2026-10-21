import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCard, autoRunes, copiesOf, deckToText, emptyDeck, listHash, makeShareCode, moveCard, normaliseShareCode,
  recommend, SHARE_CODE_RE, textToDeck, validateDeck, zoneCount, type BuilderCard,
} from "../src/lib/deck-builder";

// The visual deck builder's rules (2026-10-21). DECISIONS.md, "A visual deck builder".
const card = (id: string, name: string, type: string, domain: string | null, energyCost: number | null = 2, pop = 0): BuilderCard => ({
  id, slug: id, name, type, domain, energyCost, might: null, rarity: "Common", setCode: "OGN", collectorNumber: `${id}/298`,
  img: null, full: null, price: { US: 100 }, pop,
});
const legend = card("1", "Jinx, Loose Cannon", "Legend", "Fury", null);
const champ = card("2", "Jinx, Rebel", "Unit", "Fury", 3);
const other = card("3", "Annie, Fiery", "Unit", "Fury", 3);
const spell = card("4", "Get Excited", "Spell", "Fury", 1, 50);
const chaosUnit = card("5", "Chaos Thing", "Unit", "Chaos", 4);
const mindUnit = card("6", "Mind Thing", "Unit", "Mind", 5);
const furyRune = card("7", "Fury Rune", "Rune", "Fury", null);
const chaosRune = card("8", "Chaos Rune", "Rune", "Chaos", null);
const bfs = ["9", "10", "11", "12"].map((i) => card(i, `Battlefield ${i}`, "Battlefield", "Colorless", null));
const fillers = Array.from({ length: 14 }, (_, i) => card(`f${i}`, `Filler ${i}`, "Unit", i % 2 ? "Fury" : "Chaos", (i % 5) + 1));
const all = [legend, champ, other, spell, chaosUnit, mindUnit, furyRune, chaosRune, ...bfs, ...fillers];
const byId = new Map(all.map((c) => [c.id, c]));

function legalDeck() {
  let d = emptyDeck();
  const put = (c: BuilderCard, z: Parameters<typeof addCard>[2], n = 1) => {
    for (let i = 0; i < n; i++) {
      const r = addCard(d, c, z, byId);
      assert.equal(r.refused, undefined, `${c.name} -> ${z}: ${r.refused}`);
      d = r.deck;
    }
  };
  put(legend, "legend");
  put(champ, "champion");
  put(champ, "main", 2);
  for (const f of fillers.slice(0, 12)) put(f, "main", 3);
  put(spell, "main", 1);
  put(furyRune, "runes", 6);
  put(chaosRune, "runes", 6);
  for (const b of bfs.slice(0, 3)) put(b, "battlefields");
  return d;
}

test("a full 40/12/3 deck with Legend and matching Champion is legal", () => {
  const d = legalDeck();
  assert.equal(zoneCount(d, "main") + zoneCount(d, "champion"), 40);
  assert.deepEqual(validateDeck(d, byId).filter((i) => i.level === "error"), []);
});

test("the 3-copy limit covers main deck, Champion and side deck together", () => {
  let d = emptyDeck();
  d = addCard(d, champ, "champion", byId).deck;
  d = addCard(d, champ, "main", byId).deck;
  d = addCard(d, champ, "side", byId).deck;
  assert.equal(copiesOf(champ.name, d, byId), 3);
  assert.match(addCard(d, champ, "main", byId).refused ?? "", /3 copies/);
});

test("zones only take their card types, and Battlefields are unique", () => {
  const d = emptyDeck();
  assert.ok(addCard(d, spell, "runes", byId).refused);
  assert.ok(addCard(d, legend, "main", byId).refused);
  const one = addCard(d, bfs[0], "battlefields", byId).deck;
  assert.match(addCard(one, bfs[0], "battlefields", byId).refused ?? "", /once/);
});

test("the side deck holds 10, and moving a card keeps the limits", () => {
  let d = emptyDeck();
  for (const f of fillers.slice(0, 4)) for (let i = 0; i < 3; i++) d = addCard(d, f, "side", byId).deck;
  assert.equal(zoneCount(d, "side"), 10);
  const r = moveCard(d, fillers[0], "side", "main", byId);
  assert.equal(r.refused, undefined);
  assert.equal(zoneCount(r.deck, "side"), 9);
});

test("a Champion of another champion is flagged; more than two domains warns", () => {
  let d = emptyDeck();
  d = addCard(d, legend, "legend", byId).deck;
  d = addCard(d, other, "champion", byId).deck;
  d = addCard(d, chaosUnit, "main", byId).deck;
  d = addCard(d, mindUnit, "main", byId).deck;
  const issues = validateDeck(d, byId);
  assert.ok(issues.some((i) => i.level === "error" && /must be a Jinx unit/.test(i.text)));
  assert.ok(issues.some((i) => i.level === "warn" && /3 domains/.test(i.text)));
});

test("auto-fill splits 12 runes over the deck's two domains", () => {
  const d = autoRunes({ ...legalDeck(), runes: {} }, all, byId);
  assert.equal(zoneCount(d, "runes"), 12);
  assert.ok(Object.keys(d.runes).every((id) => ["7", "8"].includes(id)));
});

test("export and import round-trip, and a plain pasted list lands in the right zones", () => {
  const d = legalDeck();
  const back = textToDeck(deckToText(d, byId), all);
  assert.deepEqual(back.unmatched, []);
  assert.deepEqual(back.deck, d);
  const plain = textToDeck("1 Jinx, Loose Cannon\n3 Get Excited\n6 Fury Rune\n2 Nope Card", all);
  assert.equal(Object.keys(plain.deck.legend)[0], "1");
  assert.equal(plain.deck.main["4"], 3);
  assert.equal(plain.deck.runes["7"], 6);
  assert.deepEqual(plain.unmatched, ["Nope Card"]);
});

test("recommendations: Legends first, then the Legend's Champions, never past the copy limit", () => {
  assert.equal(recommend(emptyDeck(), all, byId)[0].card.type, "Legend");
  const withLegend = addCard(emptyDeck(), legend, "legend", byId).deck;
  assert.equal(recommend(withLegend, all, byId)[0].card.id, champ.id);
  const full = legalDeck();
  for (const r of recommend(full, all, byId)) assert.ok(copiesOf(r.card.name, full, byId) < 3);
});

test("share codes are six readable characters; the same list hashes the same", () => {
  for (let i = 0; i < 50; i++) assert.match(makeShareCode(), SHARE_CODE_RE);
  assert.doesNotMatch(makeShareCode(() => 0.999), /[01ILO]/);
  assert.equal(normaliseShareCode(" ab3-x9k7 "), null, "seven characters");
  assert.equal(normaliseShareCode("ab3x9k"), "AB3X9K");
  assert.equal(normaliseShareCode("O0O0O0"), null, "ambiguous characters are never issued");
  assert.equal(listHash("a\nb"), listHash("a\nb"));
  assert.notEqual(listHash("a\nb"), listHash("a\nc"));
});

test("import reads the common list shapes from other sites", () => {
  const r = textToDeck("Legend:\n1x Jinx, Loose Cannon\n\n- Get Excited x3\nAnnie, Fiery (2)\nx2 Chaos Thing", all);
  assert.deepEqual(r.unmatched, []);
  assert.equal(r.deck.legend["1"], 1);
  assert.equal(r.deck.main["4"], 3);
  assert.equal(r.deck.main["3"], 2);
  assert.equal(r.deck.main["5"], 2);
});
