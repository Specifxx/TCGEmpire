import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Riftbound constructed deck rules, locked at source level.
//
// The July 2026 tournament rules update (effective 2026-07-24) raised the
// constructed side deck from 8 cards to 10, which makes a full tournament list
// 66 cards, not 64. That number is quoted in several places — a guide, the
// learn page glossary and FAQ, and the deck-anatomy diagram — and they silently
// drift apart. These assertions are the tripwire.
//
// This file used to also validate prisma/meta-decks.json (56-card mains, 10-card
// sides, the 3-copy rule, a redirect for every rotated-out slug). That dataset
// and every page built on it were removed on 2026-09-12 (DECISIONS.md, "Meta
// decks: removed"); the three tests below are the ones that guard surfaces
// which stayed.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── Published copy must quote the post-2026-07-24 numbers ────────────────────

test("the deck-building guide quotes a 10-card side deck and a 66-card list", () => {
  const src = read("src/lib/articles.ts");
  const guide = src.slice(src.indexOf('slug: "how-a-riftbound-deck-is-built"'));
  assert.ok(guide.includes("**66 cards**"), "guide must state the 66-card total");
  assert.ok(guide.includes("Side deck (up to 10)"), "guide must state the 10-card side deck");
  assert.ok(
    !/\*\*64 cards\*\*|Sideboard \(up to 8\)/.test(guide),
    "guide still quotes the pre-2026-07-24 sideboard size",
  );
});

test("the learn page glossary and FAQ quote the 10-card side deck", () => {
  const src = read("src/app/learn/page.tsx");
  assert.ok(src.includes("Up to 10 extra cards"), "glossary must state 10");
  assert.ok(src.includes("side deck of up to 10 cards"), "FAQ must state 10");
  assert.ok(!src.includes("up to 8 cards"), "learn page still quotes an 8-card sideboard");
});

test("the deck-anatomy diagram totals 66 cards", () => {
  const src = read("src/components/learn/DeckAnatomy.tsx");
  // TOTAL is summed from each part's `n`, so the side-deck n IS the published total.
  const ns = [...src.matchAll(/^\s*n: (\d+),$/gm)].map((m) => Number(m[1]));
  assert.equal(
    ns.reduce((a, b) => a + b, 0),
    66,
    "deck-anatomy parts must sum to a 66-card tournament list",
  );
});
