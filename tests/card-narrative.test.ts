import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCardNarrative,
  narrativeWordCount,
  type NarrativeInput,
  type NarrativeMarket,
} from "../src/lib/content/card-narrative";

const market = (over: Partial<NarrativeMarket> = {}): NarrativeMarket => ({
  country: "US",
  place: "the US",
  currency: "USD",
  lowestCents: 1200,
  lowestDeliveredCents: 1500,
  secondCents: 1400,
  storeCount: 4,
  listingCount: 7,
  cheapestNonFoilCents: 1200,
  cheapestFoilCents: 2600,
  cheapestNearMintCents: 1200,
  cheapestPlayedCents: 950,
  ...over,
});

const days = (n: number, from = 1000, drift = 0): { t: number; v: number }[] =>
  Array.from({ length: n }, (_, i) => ({
    // Fixed epoch so the tests are deterministic.
    t: 1_760_000_000_000 + i * 86_400_000,
    v: Math.round(from * (1 + drift * i)),
  }));

const card = (over: Partial<NarrativeInput> = {}): NarrativeInput => ({
  name: "Jinx",
  displayName: "Jinx, Loose Cannon",
  setName: "Origins",
  setCode: "OGN",
  collectorNumber: "251",
  rarity: "Rare",
  type: "Unit",
  domain: "Fury",
  variant: null,
  isPromo: false,
  energyCost: 4,
  might: 5,
  power: null,
  isSignature: false,
  isOvernumbered: false,
  isCrystalRose: false,
  baseline: market(),
  markets: [market(), market({ country: "AU", place: "Australia", currency: "AUD", lowestCents: 1800, lowestDeliveredCents: 2200 })],
  history: { points: days(120, 1000, 0.001) },
  printings: [],
  decks: [],
  setContext: { pricedInSet: 200, cheaperThan: 150, setMedianCents: 600 },
  ...over,
});

const text = (c: NarrativeInput) => buildCardNarrative(c).join("\n");

// ── the whole point: 200+ words of the card's OWN observations ───────────────

test("a fully-priced card clears the 200-word target", () => {
  const words = narrativeWordCount(buildCardNarrative(card()));
  assert.ok(words >= 200, `expected >= 200 unique editorial words, got ${words}`);
});

// The floor matters as much as the target: a card with a price but nothing else
// to say must still be worth landing on, and must get there without filler.
test("the sparsest priced card still says something substantial", () => {
  const words = narrativeWordCount(
    buildCardNarrative(
      card({
        markets: [market()],
        history: { points: [] },
        printings: [],
        decks: [],
        setContext: null,
        baseline: market({
          cheapestFoilCents: null,
          cheapestNonFoilCents: null,
          cheapestNearMintCents: null,
          cheapestPlayedCents: null,
        }),
      }),
    ),
  );
  assert.ok(words >= 80, `expected >= 80 words even with almost no data, got ${words}`);
});

test("a played copy that saves real money is called out", () => {
  const t = text(card({ baseline: market({ cheapestNearMintCents: 1200, cheapestPlayedCents: 700 }) }));
  assert.match(t, /played copy is the value play/);
});

test("no condition advice when only one condition is stocked", () => {
  const t = text(card({ baseline: market({ cheapestPlayedCents: null, cheapestFoilCents: null }) }));
  assert.doesNotMatch(t, /played copy/);
  assert.doesNotMatch(t, /the foil runs/);
});

test("two different cards do not produce the same prose", () => {
  const a = text(card());
  const b = text(
    card({
      name: "Vayne",
      displayName: "Vayne, Night Hunter",
      rarity: "Common",
      domain: "Order",
      energyCost: 2,
      might: 2,
      baseline: market({ lowestCents: 90, lowestDeliveredCents: 480, secondCents: 95, storeCount: 9, listingCount: 14 }),
      markets: [market({ lowestCents: 90, lowestDeliveredCents: 480 })],
      history: { points: days(30, 90, -0.004) },
      setContext: { pricedInSet: 200, cheaperThan: 12, setMedianCents: 600 },
    }),
  );
  assert.notEqual(a, b);
  // Not just different nouns — a genuinely different set of observations.
  const shingle = (s: string) => {
    const w = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
    return new Set(Array.from({ length: Math.max(0, w.length - 7) }, (_, i) => w.slice(i, i + 8).join(" ")));
  };
  const [sa, sb] = [shingle(a), shingle(b)];
  const inter = [...sa].filter((s) => sb.has(s)).length;
  const jaccard = inter / (sa.size + sb.size - inter);
  assert.ok(jaccard < 0.3, `two cards were ${(jaccard * 100).toFixed(0)}% identical by 8-word shingle`);
});

// ── nothing is asserted without the data to back it ──────────────────────────

test("no trend claim without enough history", () => {
  const t = text(card({ history: { points: days(2) } }));
  assert.doesNotMatch(t, /over the last (week|month|quarter)/);
  assert.doesNotMatch(t, /tracked range/);
});

test("no 90-day claim when only 10 days are recorded", () => {
  const t = text(card({ history: { points: days(10, 1000, 0.01) } }));
  assert.match(t, /over the last week/);
  assert.doesNotMatch(t, /over the last quarter/);
});

test("no cross-market paragraph with a single market", () => {
  const t = text(card({ markets: [market()] }));
  assert.doesNotMatch(t, /markets we track/);
});

test("no set-context claim when the set has too few priced cards", () => {
  const t = text(card({ setContext: { pricedInSet: 5, cheaperThan: 4, setMedianCents: 300 } }));
  assert.doesNotMatch(t, /priced cards in the set/);
});

test("no variant premium without a real price on both sides", () => {
  const t = text(card({ isSignature: true, printings: [{ label: "base", priceCents: null, isBase: true }] }));
  assert.doesNotMatch(t, /premium over the plain version/);
});

test("no playset cost without a copy count", () => {
  const t = text(card({ decks: [{ name: "Jinx Aggro", copies: null }] }));
  assert.doesNotMatch(t, /a full set for one deck/);
});

// ── branching on data conditions, not synonym shuffling ──────────────────────

test("a single-store card is described as thin supply, not as a spread", () => {
  const t = text(card({ baseline: market({ storeCount: 1, secondCents: null }) }));
  assert.match(t, /Supply is thin/);
  assert.match(t, /price alert/);
});

test("a big gap to the second listing is called out as top-heavy", () => {
  const t = text(card({ baseline: market({ lowestCents: 1000, secondCents: 1900, storeCount: 5 }) }));
  assert.match(t, /top-heavy/);
  assert.match(t, /90%/);
});

test("a tight spread across sellers reads as a settled price", () => {
  const t = text(card({ baseline: market({ lowestCents: 1000, secondCents: 1050, storeCount: 6 }) }));
  assert.match(t, /settled price/);
});

test("postage-dominated cheap cards get the postage advice", () => {
  const t = text(card({ baseline: market({ lowestCents: 80, lowestDeliveredCents: 480, secondCents: 90 }) }));
  assert.match(t, /Postage is the deciding factor/);
  assert.match(t, /larger order/);
});

test("a flat price gets its own paragraph, not a limp 0% move", () => {
  const t = text(card({ history: { points: days(120, 1000, 0) } }));
  assert.match(t, /barely moved/);
  assert.doesNotMatch(t, /up 0%/);
});

test("a card at its tracked high says so", () => {
  const t = text(card({ history: { points: days(90, 500, 0.01) } }));
  assert.match(t, /top of its tracked range|as much as it has ever cost/);
});

test("a card at its tracked low says so", () => {
  const t = text(card({ history: { points: days(90, 3000, -0.008) } }));
  assert.match(t, /bottom of its tracked range|cheapest we have recorded/);
});

test("a chase card and a bulk card get opposite set-context framing", () => {
  const chase = text(card({ setContext: { pricedInSet: 200, cheaperThan: 195, setMedianCents: 600 } }));
  const bulk = text(card({ setContext: { pricedInSet: 200, cheaperThan: 10, setMedianCents: 600 } }));
  assert.match(chase, /genuine chase card/);
  assert.match(bulk, /cheap end of/);
});

// ── printing identity picks the opening ──────────────────────────────────────

test("a Signature print leads with its scarcity", () => {
  assert.match(text(card({ isSignature: true })), /^Jinx, Loose Cannon is the Signature print/);
});

test("a promo leads with its origin", () => {
  assert.match(text(card({ isPromo: true })), /is a promotional printing/);
});

test("a Crystal Rose alt-art is named as one of the six", () => {
  assert.match(text(card({ isCrystalRose: true })), /one of the six Crystal Rose alt-arts/);
});

test("a colorless card is described as domain-free", () => {
  assert.match(text(card({ domain: "Colorless" })), /carries no domain/);
});

test("a card with no stats does not claim an energy cost", () => {
  const t = text(card({ energyCost: null, might: null, power: null }));
  assert.doesNotMatch(t, /energy to play/);
});

// ── the empty-card path ──────────────────────────────────────────────────────

test("a card with no listings says so honestly and offers a real alternative", () => {
  const t = text(
    card({
      baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
      markets: [],
      printings: [{ label: "Showcase", priceCents: 2500, isBase: false }],
      history: { points: [] },
    }),
  );
  assert.match(t, /no live listing/);
  assert.match(t, /Showcase printing is stocked/);
  assert.match(t, /price watch/);
  // And it must not invent a price for the card itself.
  assert.doesNotMatch(t, /stores? in the US/);
});

// Regression: the audit caught this. A card unpriced in the BASELINE market but
// stocked elsewhere was being told it had no listings in any of the six markets,
// which is simply false — the page is cached on one market, not sold in one.
test("a card unpriced in the baseline market but stocked elsewhere says so accurately", () => {
  const t = text(
    card({
      baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
      markets: [
        market({ country: "AU", place: "Australia", currency: "AUD", lowestCents: 1800, lowestDeliveredCents: 2200, storeCount: 4 }),
        market({ country: "UK", place: "the United Kingdom", currency: "GBP", lowestCents: 900, lowestDeliveredCents: 1300, storeCount: 2 }),
      ],
      history: { points: [] },
    }),
  );
  assert.doesNotMatch(t, /no live listing for .* in any of the six markets/i);
  assert.match(t, /available\s+elsewhere/);
  assert.match(t, /Australia/);
  assert.match(t, /the United Kingdom/);
  // The cheapest of the stocked markets is the one quoted.
  assert.match(t, /£9\.00 in the United Kingdom/);
});

test("only a card with NO stock in any market claims none anywhere", () => {
  const t = text(
    card({
      baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
      markets: [],
      history: { points: [] },
    }),
  );
  assert.match(t, /no live listing for .* in any of the six markets/i);
});

test("an empty card never claims a trend or a spread", () => {
  const t = text(
    card({
      baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
      markets: [],
      history: { points: [] },
      setContext: null,
    }),
  );
  assert.doesNotMatch(t, /over the last/);
  // The honest "no listings anywhere" line legitimately names the markets; what
  // must never appear is the cross-market COMPARISON, which has no data behind it.
  assert.doesNotMatch(t, /stocked in \d+ of the markets we track/);
  assert.doesNotMatch(t, /priced cards in the set/);
});

// ── no NaN / undefined / placeholder leakage under any branch ────────────────

test("no branch leaks NaN, undefined, null or an empty currency", () => {
  const permutations: Partial<NarrativeInput>[] = [
    {},
    { history: { points: [] } },
    { history: { points: days(1) } },
    { markets: [] },
    { setContext: null },
    { decks: [{ name: "A", copies: 3 }, { name: "B", copies: 2 }] },
    { printings: [{ label: "base", priceCents: 400, isBase: true }], isSignature: true },
    { printings: [{ label: "Showcase", priceCents: 9000, isBase: false }] },
    { baseline: market({ lowestCents: 0, secondCents: 0, lowestDeliveredCents: 0 }) },
    { baseline: market({ storeCount: 0, listingCount: 0, lowestCents: null, lowestDeliveredCents: null, secondCents: null }) },
    { rarity: "Epic", type: "Legend", domain: "Colorless", energyCost: null, might: null, power: 3 },
    { variant: "Alt Art" },
    { isOvernumbered: true },
  ];
  for (const over of permutations) {
    const t = text(card(over));
    for (const bad of ["NaN", "undefined", "null", "Infinity", "$NaN", "  "]) {
      assert.ok(!t.includes(bad), `"${bad}" leaked into: ${t.slice(0, 200)}`);
    }
    assert.ok(t.length > 40, "narrative collapsed to nothing");
  }
});

test("every paragraph is a complete sentence", () => {
  for (const p of buildCardNarrative(card())) {
    assert.match(p, /^[A-Z0-9]/, `paragraph does not start with a capital: ${p}`);
    assert.match(p, /[.!?]$/, `paragraph does not end with punctuation: ${p}`);
    assert.doesNotMatch(p, /\s{2,}/, `paragraph has doubled whitespace: ${p}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Prose hygiene. All three of these shipped live and were reported from the
// production page for Vi, Destructive (OGN 036a):
//   "This page covers the a printing of Vi, Destructive"
//   "The a print carries a 252.9× premium over the plain version"
//   "…before you check back. the United States is currently the only one…"
// They are asserted over EVERY branch rather than the two reported sentences,
// because the generator concatenates fragments in seven places.
// ─────────────────────────────────────────────────────────────────────────────

import {
  editionLabel,
  printingKind,
  printingLabel,
  tidy,
  variantLabel,
  PRINTING_DISPLAY,
  PRINTING_PROSE,
} from "../src/lib/content/card-narrative";

// Every meaningfully-different shape the generator can be handed.
const ALL_SHAPES: Partial<NarrativeInput>[] = [
  {},
  { variant: "a" },
  { variant: "A" },
  { variant: "b" },
  { variant: "zzz" },
  { variant: null },
  { rarity: "Showcase" },
  { isPromo: true },
  { isSignature: true },
  { isOvernumbered: true },
  { isCrystalRose: true },
  { variant: "a", printings: [{ label: "base", priceCents: 36, isBase: true }] },
  { isSignature: true, printings: [{ label: "base", priceCents: 400, isBase: true }] },
  { printings: [{ label: "showcase", priceCents: 9000, isBase: false }] },
  { history: { points: [] } },
  { history: { points: days(3) } },
  { markets: [] },
  { setContext: null },
  { decks: [{ name: "A", copies: 3 }] },
  { domain: "Colorless" },
  { energyCost: null, might: null, power: null },
  { baseline: market({ storeCount: 1, secondCents: null }) },
  { baseline: market({ lowestCents: 80, lowestDeliveredCents: 480 }) },
  {
    baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
    markets: [],
    history: { points: [] },
  },
  {
    // Triggers coverageNotes() with BOTH of its fragments: a priced baseline,
    // no history yet, and exactly one stocked market. That is the combination
    // that produced the reported "…before you check back. the United States is
    // currently the only one of our six markets…" — a lowercase sentence start
    // from joining two mid-sentence fragments with ". ".
    markets: [market()],
    history: { points: [] },
  },
  {
    // The exact reported shape: unpriced in the baseline market, one listing
    // elsewhere, alternate-art printing, no history.
    variant: "a",
    baseline: market({ lowestCents: null, lowestDeliveredCents: null, secondCents: null, storeCount: 0, listingCount: 0 }),
    markets: [market({ storeCount: 1, lowestCents: 9106, lowestDeliveredCents: 9500, secondCents: null })],
    history: { points: [] },
    printings: [{ label: "base", priceCents: 36, isBase: true }],
  },
];

const everyParagraph = (fn: (p: string, shape: string) => void) => {
  for (const over of ALL_SHAPES) {
    const label = JSON.stringify(over).slice(0, 70);
    for (const p of buildCardNarrative(card(over))) fn(p, label);
  }
};

test("no paragraph contains a raw printing code", () => {
  everyParagraph((p, shape) => {
    // "the a printing", "The a print", "the b print" — a bare single letter
    // where a label belongs.
    assert.doesNotMatch(p, /\bthe [a-z] (print|printing)\b/i, `raw printing code in ${shape}: ${p.slice(0, 120)}`);
    assert.doesNotMatch(p, /\b(printing|print) of the [a-z]\b/i, `raw printing code in ${shape}: ${p.slice(0, 120)}`);
  });
});

test("no sentence starts lowercase", () => {
  everyParagraph((p, shape) => {
    // Split on a terminator followed by a space; every following sentence must
    // start with a capital, a digit or an opening quote.
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if (!sentence.trim()) continue;
      assert.match(
        sentence.trim(),
        /^[A-Z0-9£$€"“'(]/,
        `lowercase sentence start in ${shape}: "${sentence.slice(0, 90)}"`,
      );
    }
  });
});

test("no doubled spaces or doubled/floating punctuation", () => {
  everyParagraph((p, shape) => {
    assert.doesNotMatch(p, /\s{2,}/, `doubled space in ${shape}: ${p.slice(0, 120)}`);
    assert.doesNotMatch(p, /[.,;:!?]{2,}/, `doubled punctuation in ${shape}: ${p.slice(0, 120)}`);
    assert.doesNotMatch(p, /\s+[.,;:!?]/, `space before punctuation in ${shape}: ${p.slice(0, 120)}`);
    assert.doesNotMatch(p, /\.\s*\./, `doubled full stop in ${shape}: ${p.slice(0, 120)}`);
  });
});

test("every paragraph is terminated", () => {
  everyParagraph((p, shape) => {
    assert.match(p, /[.!?]$/, `unterminated paragraph in ${shape}: ${p.slice(-60)}`);
  });
});

test("printing codes map to human labels", () => {
  assert.equal(variantLabel("a"), "alternate-art");
  assert.equal(variantLabel("A"), "alternate-art");
  assert.equal(variantLabel(null), "alternate-art");
  assert.equal(variantLabel("unknown-code"), "alternate-art");
  assert.equal(printingLabel({ variant: "a" }), "alternate-art");
  assert.equal(printingLabel({ isSignature: true }), "Signature");
  assert.equal(printingLabel({ isCrystalRose: true }), "Crystal Rose alt-art");
  assert.equal(printingLabel({ isOvernumbered: true }), "overnumbered");
  assert.equal(printingLabel({ isPromo: true }), "promo");
  assert.equal(printingLabel({}), "base");
  // Precedence: a Signature that is also overnumbered reads as Signature.
  assert.equal(printingLabel({ isSignature: true, isOvernumbered: true, variant: "a" }), "Signature");
});

test("the reported alternate-art sentences read correctly", () => {
  const t = text(card({ variant: "a", printings: [{ label: "base", priceCents: 36, isBase: true }] }));
  assert.match(t, /the alternate-art printing of/);
  assert.doesNotMatch(t, /the a printing/);
  assert.match(t, /The alternate-art print carries/);
  assert.doesNotMatch(t, /The a print carries/);
});

test("tidy collapses the artefacts fragment concatenation leaves behind", () => {
  assert.equal(tidy("one  two"), "one two");
  assert.equal(tidy("end ."), "end.");
  assert.equal(tidy("end.."), "end.");
  assert.equal(tidy("end. ."), "end.");
  assert.equal(tidy("  padded  "), "padded");
});

// ─────────────────────────────────────────────────────────────────────────────
// PRINTING IS NOT RARITY — the About prose and the card page's "Printing" cell
// must name the same printing.
// ─────────────────────────────────────────────────────────────────────────────
// Reported live: /card/vi-destructive-ogn-036a-298 and
// /card/elder-dragon-unl-118a-219 both said "This page covers the Showcase
// printing" / "The Showcase print carries a 252.9× premium" while the variants
// panel on the same page said "Printing: Alternate art" and the badge said
// "ALT A". Cause: printingLabel() tested `rarity === "Showcase"` above
// `variant`, so on a card that is both, the rarity won.
//
// The panel now renders PRINTING_DISPLAY[printingKind(card)] verbatim, so
// asserting against that IS asserting against what the page shows.

// Every printing shape, with the rarity varied independently — because that
// independence is the whole point. Showcase is paired with each printing so a
// rarity can never quietly win again.
const PRINTING_FIXTURES: { name: string; input: Partial<NarrativeInput>; panel: string }[] = [
  { name: "base", input: {}, panel: "Base" },
  { name: "base, Showcase rarity", input: { rarity: "Showcase" }, panel: "Base" },
  { name: "alternate art", input: { variant: "a" }, panel: "Alternate art" },
  // THE REPORTED CARDS: Showcase rarity AND an alternate-art printing.
  { name: "alternate art, Showcase rarity (Vi / Elder Dragon)", input: { variant: "a", rarity: "Showcase" }, panel: "Alternate art" },
  { name: "alternate art 'b'", input: { variant: "b", rarity: "Showcase" }, panel: "Alternate art" },
  { name: "Signature", input: { isSignature: true }, panel: "Signature" },
  { name: "Signature, Showcase rarity", input: { isSignature: true, rarity: "Showcase" }, panel: "Signature" },
  { name: "promo", input: { isPromo: true }, panel: "Promo" },
  { name: "promo, Showcase rarity", input: { isPromo: true, rarity: "Showcase" }, panel: "Promo" },
  { name: "overnumbered", input: { isOvernumbered: true }, panel: "Overnumbered" },
  { name: "overnumbered, Showcase rarity", input: { isOvernumbered: true, rarity: "Showcase" }, panel: "Overnumbered" },
  { name: "Crystal Rose", input: { isCrystalRose: true }, panel: "Crystal Rose alt-art" },
];

const panelValue = (c: NarrativeInput) => PRINTING_DISPLAY[printingKind(c)];

// The two casings differ deliberately in more than case: prose hyphenates
// ("the alternate-art printing" reads as one adjective mid-sentence) while the
// panel spaces ("Alternate art" reads as a standalone value). That is
// typography, not a different answer, so compare on the words alone — a real
// divergence ("Showcase" vs "Alternate art") still fails.
const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, " ").trim();

test("the panel value is derived from the printing, never the rarity", () => {
  for (const f of PRINTING_FIXTURES) {
    assert.equal(panelValue(card(f.input)), f.panel, f.name);
  }
});

test("every printing label the About text prints matches the panel for the same card", () => {
  // Both sentences that name a printing: identity()'s opening and
  // variantEconomics()'s premium comparison.
  const CLAIMS = [/covers the (.+?) printing of/g, /\bThe (.+?) print (?:carries|and|is currently)/g];

  for (const f of PRINTING_FIXTURES) {
    // A priced base sibling, so the premium sentence fires too.
    const c = card({ ...f.input, printings: [{ label: "base", priceCents: 36, isBase: true }] });
    const prose = text(c);
    const expected = norm(panelValue(c));

    let found = 0;
    for (const re of CLAIMS) {
      for (const m of prose.matchAll(re)) {
        found++;
        const claimed = norm(m[1]);
        // The one sanctioned divergence: a Showcase-rarity card at a base
        // collector number has no distinct printing, so the premium sentence
        // names the rarity rather than claiming "the base print". It must never
        // do that when a real printing exists.
        const allowed =
          claimed === expected ||
          (expected === "base" && c.rarity === "Showcase" && claimed === "showcase");
        assert.ok(
          allowed,
          `${f.name}: prose says "${m[1]}" but the panel says "${panelValue(c)}" — ${m[0]}`,
        );
      }
    }
    // A card with a real printing must actually make the claim, or this test
    // would pass by finding nothing to check.
    if (f.panel !== "Base") {
      assert.ok(found > 0, `${f.name}: expected the About text to name its printing at least once`);
    }
  }
});

test("a card with no distinct printing never claims to cover one", () => {
  for (const rarity of ["Epic", "Showcase", "Rare"]) {
    const prose = text(card({ rarity, printings: [{ label: "base", priceCents: 36, isBase: true }] }));
    assert.doesNotMatch(prose, /covers the base printing/i, `${rarity}: "covers the base printing" is nonsense`);
    // …and it must not describe itself as "the same card as the base version
    // but a distinct product" when it IS the base version.
    assert.doesNotMatch(prose, /covers the .*printing of .*same card as the base version/i, rarity);
  }
});

test("THE REGRESSION: an alternate-art Showcase card never says 'Showcase printing'", () => {
  for (const shape of [
    { variant: "a", rarity: "Showcase", name: "Vi, Destructive", collectorNumber: "036a/298" },
    { variant: "a", rarity: "Showcase", name: "Elder Dragon", collectorNumber: "118a/219" },
  ]) {
    const prose = text(card({ ...shape, printings: [{ label: "base", priceCents: 36, isBase: true }] }));
    assert.doesNotMatch(prose, /Showcase printing/, shape.name);
    assert.doesNotMatch(prose, /Showcase print carries/, shape.name);
    assert.match(prose, /the alternate-art printing of/, shape.name);
    assert.match(prose, /The alternate-art print carries/, shape.name);
  }
});

test("editionLabel prefers the printing and only falls back to the rarity", () => {
  assert.equal(editionLabel({ variant: "a", rarity: "Showcase" }), "alternate-art");
  assert.equal(editionLabel({ isSignature: true, rarity: "Showcase" }), "Signature");
  assert.equal(editionLabel({ isPromo: true, rarity: "Showcase" }), "promo");
  // No distinct printing → the rarity is the only distinguishing fact.
  assert.equal(editionLabel({ rarity: "Showcase" }), "Showcase");
  // Genuinely the plain version → nothing to compare, so no label at all.
  assert.equal(editionLabel({ rarity: "Epic" }), null);
  assert.equal(editionLabel({}), null);
});

test("the prose and display casings describe the same set of printings", () => {
  const kinds = Object.keys(PRINTING_PROSE) as (keyof typeof PRINTING_PROSE)[];
  assert.deepEqual(kinds.sort(), (Object.keys(PRINTING_DISPLAY) as typeof kinds).sort());
  for (const k of kinds) {
    assert.equal(
      norm(PRINTING_PROSE[k]),
      norm(PRINTING_DISPLAY[k]),
      `"${k}" says "${PRINTING_PROSE[k]}" in prose but "${PRINTING_DISPLAY[k]}" in the panel — they must differ only in casing/hyphenation`,
    );
  }
});
