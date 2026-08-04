import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import metaDecks from "../prisma/meta-decks.json";
import { normalizeSearch } from "../src/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Riftbound constructed deck rules, locked at source level.
//
// The July 2026 tournament rules update (effective 2026-07-24) raised the
// constructed side deck from 8 cards to 10, which makes a full tournament list
// 66 cards, not 64. That number is quoted in several places — a guide, the
// learn page glossary and FAQ, the deck-anatomy diagram and the /decks page —
// and they silently drift apart. These assertions are the tripwire.
//
// Source-level on purpose: scripts/validate-decks.ts does the same rules pass
// but its name-resolution half needs a database, so it can't gate `npm test`.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const MAIN_TOTAL = 56; // 40 main + 12 runes + 3 battlefields + 1 legend
const SIDE_MAX = 10;
const COPY_MAX = 3;

type DeckCard = { name: string; qty: number; section: string };
const decks = metaDecks.decks as { slug: string; legend: string; cards: DeckCard[] }[];

test("every stored decklist is a legal 56-card main deck", () => {
  for (const d of decks) {
    const main = d.cards.filter((c) => c.section !== "sideboard").reduce((n, c) => n + c.qty, 0) + 1;
    assert.equal(main, MAIN_TOTAL, `${d.slug}: main deck incl. legend is ${main}, expected ${MAIN_TOTAL}`);
  }
});

test("no side deck exceeds the 10-card cap", () => {
  for (const d of decks) {
    const side = d.cards.filter((c) => c.section === "sideboard").reduce((n, c) => n + c.qty, 0);
    assert.ok(side <= SIDE_MAX, `${d.slug}: side deck is ${side}, over the ${SIDE_MAX}-card cap`);
  }
});

test("the 3-copy limit holds across main deck and side deck combined", () => {
  for (const d of decks) {
    const totals = new Map<string, number>();
    for (const c of d.cards) {
      if (c.section === "rune") continue; // runes are exempt — decks run 7x Body Rune
      const key = normalizeSearch(c.name);
      totals.set(key, (totals.get(key) ?? 0) + c.qty);
    }
    for (const [key, total] of totals) {
      assert.ok(total <= COPY_MAX, `${d.slug}: "${key}" runs ${total} copies across main + side`);
    }
  }
});

test("side decks contain no runes, legends or battlefields", () => {
  for (const d of decks) {
    const legendKey = normalizeSearch(d.legend);
    for (const c of d.cards.filter((x) => x.section === "sideboard")) {
      assert.notEqual(normalizeSearch(c.name), legendKey, `${d.slug}: legend is in the side deck`);
      const elsewhere = d.cards.find(
        (x) => x.section !== "sideboard" && normalizeSearch(x.name) === normalizeSearch(c.name),
      );
      assert.ok(
        !elsewhere || (elsewhere.section !== "rune" && elsewhere.section !== "battlefield"),
        `${d.slug}: "${c.name}" is a ${elsewhere?.section} and can't be sideboarded`,
      );
    }
  }
});

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

test("the /decks page states the side-deck rules change", () => {
  const src = read("src/app/decks/page.tsx");
  assert.ok(src.includes("66 cards"), "/decks must state the 66-card total");
  assert.ok(src.includes("24 July 2026"), "/decks must date the rules change");
});
