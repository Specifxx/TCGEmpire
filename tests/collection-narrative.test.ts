import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCollectionNarrative,
  collectionWordCount,
  type CollectionInput,
  type CollectionMember,
} from "../src/lib/content/collection-narrative";

const members = (n: number, from = 200, step = 150): CollectionMember[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Card ${i + 1}`,
    priceCents: from + i * step,
    setCode: "OGN",
    rarity: "Rare",
  }));

const input = (over: Partial<CollectionInput> = {}): CollectionInput => ({
  kind: "champion",
  label: "Jinx",
  currency: "USD",
  place: "the US",
  members: members(14),
  setCodes: ["OGN", "VEN"],
  siteMedianCents: 600,
  ...over,
});

const text = (c: CollectionInput) => buildCollectionNarrative(c).join("\n");

test("a healthy collection clears the 150-word target", () => {
  for (const kind of ["champion", "type", "rarity", "printing", "domain", "set", "keyword"] as const) {
    const words = collectionWordCount(buildCollectionNarrative(input({ kind, label: "Fury" })));
    assert.ok(words >= 150, `${kind}: expected >= 150 words, got ${words}`);
  }
});

test("each kind gets its own buyer advice, not one shared paragraph", () => {
  const kinds = ["champion", "type", "rarity", "printing", "domain", "set", "keyword"] as const;
  const finals = kinds.map((kind) => buildCollectionNarrative(input({ kind })).at(-1));
  assert.equal(new Set(finals).size, kinds.length, "two kinds produced the same closing paragraph");
});

test("an empty collection says so instead of padding", () => {
  const t = text(input({ members: [] }));
  assert.match(t, /no .* in the database yet/);
  assert.ok(collectionWordCount([t]) < 60);
});

test("an unpriced collection never quotes a range", () => {
  const t = text(input({ members: members(9).map((m) => ({ ...m, priceCents: null })) }));
  assert.match(t, /none currently has a live listing/);
  assert.doesNotMatch(t, /Prices run from/);
  assert.doesNotMatch(t, /median of/);
});

test("concentrated value is called out; even value is described differently", () => {
  const concentrated = text(
    input({ members: [...members(19, 100, 0), { name: "Chase", priceCents: 40000, setCode: "OGN" }] }),
  );
  const even = text(input({ members: members(20, 1000, 5) }));
  assert.match(concentrated, /value is heavily concentrated|whole budget/i);
  assert.match(even, /spread unusually evenly/);
});

test("the site-median comparison only fires on a real difference", () => {
  const dear = text(input({ members: members(12, 5000, 200), siteMedianCents: 600 }));
  const same = text(input({ members: members(12, 600, 0), siteMedianCents: 600 }));
  assert.match(dear, /above the market/);
  assert.doesNotMatch(same, /(above|below) the market/);
});

test("named members come from the data, cheapest and dearest both", () => {
  const t = text(input({ members: [
    { name: "Alpha", priceCents: 100 },
    { name: "Beta", priceCents: 5000 },
    { name: "Gamma", priceCents: 2500 },
    { name: "Delta", priceCents: 900 },
  ] }));
  assert.match(t, /Beta at/);
  assert.match(t, /Alpha is the cheapest way in/);
});

test("a partially-priced collection explains the gap honestly", () => {
  const t = text(input({
    members: [...members(6), ...Array.from({ length: 4 }, (_, i) => ({ name: `Unpriced ${i}`, priceCents: null }))],
  }));
  assert.match(t, /6 of which have a live price/);
  assert.match(t, /not currently stocked/);
});

test("no branch leaks NaN, undefined or null", () => {
  const permutations: Partial<CollectionInput>[] = [
    {},
    { members: [] },
    { members: members(1) },
    { members: members(3) },
    { members: members(2).map((m) => ({ ...m, priceCents: null })) },
    { siteMedianCents: null },
    { siteMedianCents: 0 },
    { setCodes: [] },
    { setCodes: ["OGN"] },
    { members: members(30, 0, 0) },
  ];
  for (const kind of ["champion", "type", "rarity", "printing", "domain", "set", "keyword"] as const) {
    for (const over of permutations) {
      const t = text(input({ kind, ...over }));
      for (const bad of ["NaN", "undefined", "null", "Infinity"]) {
        assert.ok(!t.includes(bad), `${kind}/${JSON.stringify(over)}: "${bad}" leaked into: ${t.slice(0, 160)}`);
      }
    }
  }
});

test("every paragraph is a complete sentence", () => {
  for (const p of buildCollectionNarrative(input())) {
    assert.match(p, /^[A-Z0-9]/, `does not start with a capital: ${p}`);
    assert.match(p, /[.!?]$/, `does not end with punctuation: ${p}`);
  }
});
