import test from "node:test";
import assert from "node:assert/strict";

import metaDecks from "../prisma/meta-decks.json";
import type { MetaDeckSeed, ResolvedDeck, ResolvedCard } from "../src/lib/meta-decks";
import {
  metaStaples,
  domainPresence,
  domainPairings,
  energyCurve,
  avgEnergyCost,
  deckProvenance,
  hubCostSummary,
  stapleMovers,
  tierCounts,
} from "../src/lib/deck-hub-stats";

// ─────────────────────────────────────────────────────────────────────────────
// /decks hub statistics — the derived numbers the metagame board publishes.
//
// Everything in lib/deck-hub-stats.ts is arithmetic over the real seed list
// plus resolver output, and every failure mode is silent: a staple counted per
// LINE instead of per DECK inflates "played in N decks" into fiction; a curve
// that includes runes describes a deck nobody registered; an unparseable
// attribution line silently drops a deck from the provenance band. These run
// against the REAL prisma/meta-decks.json (no DB), so a data edit that breaks
// a derivation fails here before it publishes.
// ─────────────────────────────────────────────────────────────────────────────

const SEEDS = metaDecks.decks as MetaDeckSeed[];

// ── Staples ──────────────────────────────────────────────────────────────────

test("metaStaples counts a deck once however many lines/copies it runs", () => {
  const staples = metaStaples(SEEDS);
  for (const s of staples) {
    assert.ok(s.deckCount >= 2, `${s.name}: below the minDecks floor`);
    assert.equal(s.decks.length, s.deckCount, `${s.name}: decks list must match deckCount`);
    const slugs = s.decks.map((d) => d.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${s.name}: a deck may only be counted once`);
    assert.ok(s.totalCopies >= s.deckCount, `${s.name}: totalCopies can't undercut one copy per deck`);
    assert.ok(s.typicalQty >= 1 && s.typicalQty <= 3, `${s.name}: typicalQty ${s.typicalQty} outside 1..3`);
  }
});

test("metaStaples never lists runes, battlefields or side-deck cards", () => {
  const staples = metaStaples(SEEDS);
  // Cards that appear ONLY outside the main-deck core sections must be absent.
  const coreNames = new Set(
    SEEDS.flatMap((d) =>
      d.cards.filter((c) => ["champion", "unit", "gear", "spell"].includes(c.section)).map((c) => c.name)
    )
  );
  for (const s of staples) {
    assert.ok(coreNames.has(s.name), `${s.name}: staple not present in any main-deck core section`);
    assert.ok(!["rune", "battlefield", "sideboard"].includes(s.section), `${s.name}: forbidden section ${s.section}`);
  }
});

test("the field genuinely shares staples — the module has something to show", () => {
  // Not an implementation detail: the /decks staples band renders these. If a
  // data edit ever leaves fewer than 5 shared cards, the band collapses and
  // this points at why.
  assert.ok(metaStaples(SEEDS).length >= 5, "fewer than 5 cross-deck staples in the seed data");
});

// ── Domains ──────────────────────────────────────────────────────────────────

test("domainPresence tallies every deck's registered pairing exactly once", () => {
  const rows = domainPresence(SEEDS);
  const totalMemberships = SEEDS.reduce((n, d) => n + d.domains.length, 0);
  assert.equal(
    rows.reduce((n, r) => n + r.deckCount, 0),
    totalMemberships,
    "sum of per-domain deck counts must equal total domain memberships"
  );
  for (const r of rows) {
    assert.equal(r.decks.length, r.deckCount);
    assert.ok(r.fieldPct >= 0 && r.fieldPct <= 100);
  }
  // Most-played first.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].deckCount >= rows[i].deckCount, "rows must be ordered most-played first");
  }
});

test("domainPairings covers the whole field with no double counting", () => {
  const pairings = domainPairings(SEEDS);
  assert.equal(
    pairings.reduce((n, p) => n + p.count, 0),
    SEEDS.length,
    "every deck belongs to exactly one pairing"
  );
});

// ── Curve (fixture resolved decks — the resolver needs a DB) ─────────────────

function makeItem(section: string, qty: number, energyCost: number | null): ResolvedCard {
  return {
    qty,
    inputName: "Fixture Card",
    section,
    card: {
      id: "x",
      slug: null,
      name: "Fixture Card",
      nameNormalized: "fixturecard",
      setCode: "OGN",
      collectorNumber: "001/298",
      domain: "Fury",
      type: "Unit",
      rarity: "Common",
      energyCost,
      imageThumbUrl: null,
      imageUrl: null,
      lowestPriceCents: null,
    },
    unitPriceCents: null,
    lineCents: 0,
  };
}

function makeDeck(items: ResolvedCard[], overrides: Partial<ResolvedDeck> = {}): ResolvedDeck {
  return {
    slug: "fixture",
    name: "Fixture Deck",
    legend: "Fixture Legend",
    tier: "1",
    archetype: "Tempo",
    domains: ["Fury", "Calm"],
    description: "fixture",
    cards: [],
    legendCard: null,
    legendPriceCents: null,
    items,
    totalCards: 56,
    totalCents: 0,
    priceableCards: 0,
    pricedCards: 0,
    sideboardCards: 0,
    sideboardCents: 0,
    imageUrl: null,
    ...overrides,
  };
}

test("energyCurve counts copies, folds 6+ and excludes non-core sections", () => {
  const deck = makeDeck([
    makeItem("unit", 3, 2),
    makeItem("spell", 2, 2),
    makeItem("gear", 1, 8), // folds into 6+
    makeItem("rune", 12, 1), // excluded
    makeItem("battlefield", 3, 1), // excluded
    makeItem("sideboard", 10, 1), // excluded
    makeItem("unit", 2, null), // unknown cost
  ]);
  const { buckets, known, unknown } = energyCurve(deck);
  assert.equal(known, 6);
  assert.equal(unknown, 2);
  assert.equal(buckets.find((b) => b.label === "2")?.count, 5);
  assert.equal(buckets.find((b) => b.label === "6+")?.count, 1);
  assert.equal(buckets.reduce((n, b) => n + b.count, 0), known);
});

test("avgEnergyCost refuses to average a mostly-unknown deck", () => {
  const known = makeDeck([makeItem("unit", 30, 2), makeItem("spell", 10, 4)]);
  assert.equal(avgEnergyCost(known), 2.5);
  // 12 known of 40 — under the two-thirds floor, so no figure is published.
  const murky = makeDeck([makeItem("unit", 12, 2), makeItem("unit", 28, null)]);
  assert.equal(avgEnergyCost(murky), null);
  assert.equal(avgEnergyCost(makeDeck([])), null);
});

// ── Provenance ───────────────────────────────────────────────────────────────

test("every seeded attribution line parses into player · placement · event", () => {
  // If a future data edit writes a `source` this can't parse, that deck silently
  // vanishes from the /decks results band — this is the tripwire that says so.
  const withSource = SEEDS.filter((d) => d.source);
  const parsed = deckProvenance(SEEDS);
  assert.equal(parsed.length, withSource.length, "an attribution line stopped parsing");
  for (const p of parsed) {
    assert.ok(p.player.length > 0);
    assert.match(p.placement, /^\d+(st|nd|rd|th)$/);
    assert.ok(p.event.length > 3);
  }
  // Ordered by finishing position.
  for (let i = 1; i < parsed.length; i++) {
    assert.ok(parseInt(parsed[i - 1].placement) <= parseInt(parsed[i].placement));
  }
});

// ── Cost summary ─────────────────────────────────────────────────────────────

test("hubCostSummary only publishes verdict-approved costs", () => {
  const good = makeDeck([], { slug: "good", tier: "1", totalCents: 20000, pricedCards: 40, priceableCards: 44, winRatePct: 52 });
  const cheapGood = makeDeck([], { slug: "cheap", tier: "3", totalCents: 9000, pricedCards: 44, priceableCards: 44, winRatePct: 63 });
  const lowCoverage = makeDeck([], { slug: "sparse", tier: "1", totalCents: 500, pricedCards: 4, priceableCards: 44 });
  const unpriced = makeDeck([], { slug: "none", tier: "2", totalCents: 0, pricedCards: 0, priceableCards: 44 });
  const s = hubCostSummary([good, cheapGood, lowCoverage, unpriced]);
  assert.equal(s.costed.length, 2, "low-coverage and unpriced decks must not publish a cost");
  assert.equal(s.cheapest?.deck.slug, "cheap");
  assert.equal(s.dearest?.deck.slug, "good");
  assert.equal(s.avgCents, 14500);
  assert.equal(s.cheapestTopTier?.deck.slug, "good", "tier filter must skip the cheaper tier-3 list");
  assert.equal(s.bestBudget?.deck.slug, "cheap", "best budget = cheapest publishable list converting at 50%+");
});

test("hubCostSummary on an unpriced field publishes nothing", () => {
  const s = hubCostSummary([makeDeck([], { totalCents: 0, pricedCards: 0, priceableCards: 44 })]);
  assert.equal(s.costed.length, 0);
  assert.equal(s.avgCents, null);
  assert.equal(s.cheapest, null);
  assert.equal(s.bestBudget, null);
});

// ── Staple movers ────────────────────────────────────────────────────────────

test("stapleMovers only surfaces cards the field actually plays", () => {
  const first = SEEDS[0];
  const playedName = first.cards.find((c) => c.section === "unit" || c.section === "spell")!.name;
  const movers = [
    { card: { name: playedName }, nowCents: 1200, pct: 12.5 },
    { card: { name: "Card Nobody Plays" }, nowCents: 900, pct: 80 },
    { card: { name: playedName.toUpperCase() }, nowCents: 1200, pct: -3 }, // dupe, loose-matched
  ];
  const out = stapleMovers(SEEDS, movers);
  assert.equal(out.length, 1, "unplayed cards and duplicate names must be dropped");
  assert.equal(out[0].mover.pct, 12.5, "first occurrence wins the dedupe");
  assert.ok(out[0].decks.some((d) => d.slug === first.slug));
});

test("stapleMovers orders by absolute move and honours the limit", () => {
  const names = SEEDS[0].cards.filter((c) => c.section !== "rune" && c.section !== "battlefield" && c.section !== "sideboard").map((c) => c.name);
  const movers = names.slice(0, 4).map((name, i) => ({ card: { name }, nowCents: 1000, pct: [5, -40, 15, -1][i] }));
  const out = stapleMovers(SEEDS, movers, 3);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((o) => o.mover.pct), [-40, 15, 5]);
});

// ── Tier tallies ─────────────────────────────────────────────────────────────

test("tierCounts covers every deck exactly once", () => {
  const counts = tierCounts(SEEDS);
  assert.equal(counts.reduce((n, t) => n + t.count, 0), SEEDS.length);
});
