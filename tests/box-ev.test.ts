import test from "node:test";
import assert from "node:assert/strict";

import {
  poolOf,
  poolStats,
  computeEv,
  derivedRates,
  oneInPacks,
  DEFAULT_BASE_RATES,
  DEFAULT_SPECIALS_PER_BOX,
  DEFAULT_PACKS,
  SPECIAL_POOLS,
  CHASE_POOLS,
  CHASE_RATES,
  type PoolKey,
} from "../src/lib/box-ev";
import { chasePrintRarity, isOvernumbered, isSignature } from "../src/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// The Box EV model.
//
// The bug this file exists to prevent, concretely: the old page hand-rolled its
// chase-print detection, tested for a LETTER in the collector number, and
// documented an example shape ("223s/221") that appears nowhere in the data.
// Real signatures carry a star. So the letter branch never fired, and signatures
// were kept out of the base pools only because they happen ALSO to be numbered
// above the set total — a coincidence of this set's numbering, not a rule.
// Everything below pins the real behaviour so it cannot drift back.
// ─────────────────────────────────────────────────────────────────────────────

const card = (over: Partial<Parameters<typeof poolOf>[0]> = {}) => ({
  setCode: "VEN",
  collectorNumber: "012/166",
  rarity: "Common",
  variant: null,
  isPromo: false,
  ...over,
});

// A signature's collector number: 197, a star, then the set total.
const SIG = `197${"*"}/166`;
const SIG_INSIDE_BASE = `045${"*"}/166`;

test("a base card lands in its printed rarity", () => {
  assert.equal(poolOf(card({ rarity: "Common" })), "Common");
  assert.equal(poolOf(card({ collectorNumber: "101/166", rarity: "Epic" })), "Epic");
  assert.equal(poolOf(card({ collectorNumber: "160/166", rarity: "Showcase" })), "Showcase");
});

test("THE BUG: a signature is caught by the star, not by being over-numbered", () => {
  // Every signature in the data today is ALSO numbered past the set total, which
  // is why the old letter-matching code appeared to work. This one is not.
  assert.equal(isSignature(SIG_INSIDE_BASE), true, "the shared helper sees the star");
  assert.equal(isOvernumbered(SIG_INSIDE_BASE), false, "…and it is NOT over-numbered");

  // The old predicate: /[a-z]/i on the numerator, then num > denom.
  const oldIsSpecialPrint = (n: string) => {
    const [numPart, denomPart] = n.split("/");
    if (!numPart) return false;
    if (/[a-z]/i.test(numPart.trim())) return true;
    const num = parseInt(numPart, 10);
    const denom = parseInt((denomPart ?? "").trim(), 10);
    return Number.isFinite(num) && Number.isFinite(denom) && denom > 0 && num > denom;
  };
  assert.equal(oldIsSpecialPrint(SIG_INSIDE_BASE), false, "the old code missed it entirely");

  // The new model gets it right, which is the whole point.
  assert.equal(poolOf(card({ collectorNumber: SIG_INSIDE_BASE, rarity: "Epic" })), "Signature");
});

test("signature, over-numbered and alt-art each get their OWN pool", () => {
  assert.equal(poolOf(card({ collectorNumber: SIG, rarity: "Showcase" })), "Signature");
  assert.equal(poolOf(card({ collectorNumber: "196/166", rarity: "Rare" })), "Overnumbered");
  assert.equal(poolOf(card({ collectorNumber: "021a/166", variant: "a", rarity: "Showcase" })), "AltArt");
});

test("Crystal Rose shares the alt-art PULL SLOT without changing the rarity rule", () => {
  // These are two different questions and they are allowed to differ:
  //   • what rarity is this card?  → Epic (pinned by tests/rarity.test.ts)
  //   • which pack slot produced it? → the alt-art slot
  assert.equal(poolOf(card({ collectorNumber: "SP1/006", rarity: "Epic" })), "AltArt");
  assert.equal(chasePrintRarity({ collectorNumber: "SP1/006", rarity: "Epic" }), "Epic");
});

test("promos are not pack pulls at all", () => {
  assert.equal(poolOf(card({ isPromo: true, rarity: "Rare" })), null);
  assert.equal(poolOf(card({ collectorNumber: "196/166", isPromo: true, rarity: "Rare" })), null);
});

test("an unparseable collector number stays in its base tier rather than vanishing", () => {
  // The old code dropped these from every pool. Runes and tokens are ordinary
  // cards as far as an average is concerned.
  for (const n of ["R01", "R04a", "TBA", "t06/000"]) {
    assert.equal(poolOf(card({ collectorNumber: n, rarity: "Common" })), "Common", n);
  }
});

test("a card with an unknown rarity is excluded rather than crashing the pools", () => {
  assert.equal(poolOf(card({ rarity: "Mythic" })), null);
});

// ── Averages ─────────────────────────────────────────────────────────────────

test("the average divides by EVERY card in the pool, not just the priced ones", () => {
  // Two priced at $10, two unpriced. A box opener pulling at random gets $5 on
  // average, not $10 — dividing by the priced subset would claim the bulk tail
  // is as valuable as the priced head.
  const stats = poolStats([
    { ...card({ collectorNumber: "001/166" }), valueCents: 1000 },
    { ...card({ collectorNumber: "002/166" }), valueCents: 1000 },
    { ...card({ collectorNumber: "003/166" }), valueCents: null },
    { ...card({ collectorNumber: "004/166" }), valueCents: 0 },
  ]);
  const c = stats.get("Common")!;
  assert.equal(c.total, 4);
  assert.equal(c.priced, 2);
  assert.equal(c.avgCents, 500);
  assert.equal(c.topCents, 1000);
});

test("NO outlier cap — the expensive chase card is the signal, not noise", () => {
  // The old model capped each card at 4x the pool minimum when n < 6. On a small
  // signature pool that shaves off exactly the card people open boxes for.
  const stats = poolStats([
    { ...card({ collectorNumber: SIG, rarity: "Showcase" }), valueCents: 100 },
    { ...card({ collectorNumber: `191${"*"}/166`, rarity: "Showcase" }), valueCents: 30_000 },
  ]);
  const sig = stats.get("Signature")!;
  assert.equal(sig.avgCents, 15_050, "the $300 card must survive into the average");
  assert.equal(sig.topCents, 30_000);
});

// ── Rates ────────────────────────────────────────────────────────────────────

test("AltArt, Overnumbered and Signature take Riot's own published rate, not a shared split", () => {
  // 2026-09-04 site-owner correction: "Alt art is 1 in 12 packs and
  // overnumbered is 1 in 72 packs" — exactly PULL_RATES' own figures
  // (lib/pack-composition.ts), which is what caught the old model inverting
  // them (see the next test).
  const counts = new Map<PoolKey, number>([
    ["Showcase", 10],
    ["AltArt", 24],
    ["Overnumbered", 31],
    ["Signature", 9],
  ]);
  const rates = derivedRates({ counts, packs: DEFAULT_PACKS, specialsPerBox: DEFAULT_SPECIALS_PER_BOX });

  assert.ok(Math.abs(rates.AltArt - 1 / 12) < 1e-9, `got ${rates.AltArt}`);
  assert.ok(Math.abs(rates.Overnumbered - 1 / 72) < 1e-9, `got ${rates.Overnumbered}`);
  assert.ok(Math.abs(rates.Signature - 1 / 720) < 1e-9, `got ${rates.Signature}`);
  assert.deepEqual(rates.AltArt, CHASE_RATES.AltArt);
  assert.deepEqual(rates.Overnumbered, CHASE_RATES.Overnumbered);
  assert.deepEqual(rates.Signature, CHASE_RATES.Signature);
});

test("THE BUG: a bigger pool of cards must not change its own chase rate", () => {
  // The old model split one shared budget by card count, so Overnumbered (31
  // cards in this fixture) outweighed AltArt (24 cards) — backwards from
  // Riot's real numbers, where AltArt is six times MORE common than
  // Overnumbered. A per-pool count can never move a rate that is Riot's own
  // published figure.
  const small = derivedRates({
    counts: new Map<PoolKey, number>([["AltArt", 1], ["Overnumbered", 1]]),
    packs: DEFAULT_PACKS,
    specialsPerBox: DEFAULT_SPECIALS_PER_BOX,
  });
  const big = derivedRates({
    counts: new Map<PoolKey, number>([["AltArt", 500], ["Overnumbered", 500]]),
    packs: DEFAULT_PACKS,
    specialsPerBox: DEFAULT_SPECIALS_PER_BOX,
  });
  assert.equal(small.AltArt, big.AltArt);
  assert.equal(small.Overnumbered, big.Overnumbered);
  assert.ok(small.AltArt > small.Overnumbered, "alt art is the more common chase print, not the rarer one");
});

test("Showcase alone still spends the full specials-per-box estimate", () => {
  const counts = new Map<PoolKey, number>([["Showcase", 10]]);
  const rates = derivedRates({ counts, packs: DEFAULT_PACKS, specialsPerBox: DEFAULT_SPECIALS_PER_BOX });
  assert.ok(Math.abs(rates.Showcase * DEFAULT_PACKS - DEFAULT_SPECIALS_PER_BOX) < 1e-9);
  assert.deepEqual(SPECIAL_POOLS, ["Showcase"]);
});

test("a pool with no cards in this set gets a zero rate, published or not", () => {
  const counts = new Map<PoolKey, number>([["Showcase", 5], ["Signature", 0]]);
  const rates = derivedRates({ counts, packs: 24, specialsPerBox: 0.33 });
  assert.equal(rates.Signature, 0);
  assert.ok(rates.Showcase > 0);
});

test("no special cards at all leaves every chase/special rate at zero rather than dividing by zero", () => {
  const rates = derivedRates({ counts: new Map(), packs: 24, specialsPerBox: 0.33 });
  for (const p of [...CHASE_POOLS, ...SPECIAL_POOLS]) assert.equal(rates[p], 0, p);
  assert.equal(rates.Common, DEFAULT_BASE_RATES.Common);
});

test("base rates are untouched by the special-slot split", () => {
  const rates = derivedRates({
    counts: new Map<PoolKey, number>([["Signature", 9]]),
    packs: 24,
    specialsPerBox: 5,
  });
  assert.equal(rates.Common, 7);
  assert.equal(rates.Uncommon, 3);
  assert.equal(rates.Rare, 2);
  assert.equal(rates.Epic, 0.25);
});

test("a fractional rate reads as '1 in N packs' rather than 0.0139", () => {
  assert.equal(oneInPacks(0.0139), "≈ 1 in 72 packs");
  assert.equal(oneInPacks(0.25), "≈ 1 in 4 packs");
  assert.equal(oneInPacks(2), null, "whole-number rates need no translation");
  assert.equal(oneInPacks(0), null);
});

// ── EV ───────────────────────────────────────────────────────────────────────

test("EV is rate x average, summed, then multiplied by pack count", () => {
  const stats = new Map([
    ["Common" as PoolKey, { avgCents: 10, priced: 100, total: 100, topCents: 50 }],
    ["Signature" as PoolKey, { avgCents: 20_000, priced: 9, total: 9, topCents: 60_000 }],
  ]);
  const ev = computeEv({
    stats,
    rates: { Common: 7, Signature: 0.001 },
    packs: 24,
    boxPriceCents: 0,
  });
  // 7 x 10 = 70 ; 0.001 x 20000 = 20 ; = 90/pack ; x24 = 2160
  assert.equal(ev.evPackCents, 90);
  assert.equal(ev.evBoxCents, 2160);
  assert.equal(ev.ratio, null, "no box price entered → no ratio");
  assert.equal(ev.cardsPerPack, 7.001);
});

test("THE HEADLINE FIX: chase cards actually move the EV", () => {
  const base = new Map([["Common" as PoolKey, { avgCents: 10, priced: 100, total: 100, topCents: 50 }]]);
  const withChase = new Map(base).set("Signature", {
    avgCents: 20_000,
    priced: 9,
    total: 9,
    topCents: 60_000,
  });
  const rates = { Common: 7, Signature: 0.001 };
  const a = computeEv({ stats: base, rates, packs: 24, boxPriceCents: 0 });
  const b = computeEv({ stats: withChase, rates, packs: 24, boxPriceCents: 0 });
  assert.ok(b.evBoxCents > a.evBoxCents, "the old model returned the lower figure");
});

test("shares sum to 1 and drive the contribution bars", () => {
  const stats = new Map([
    ["Common" as PoolKey, { avgCents: 10, priced: 10, total: 10, topCents: 10 }],
    ["Rare" as PoolKey, { avgCents: 100, priced: 10, total: 10, topCents: 100 }],
  ]);
  const ev = computeEv({ stats, rates: { Common: 5, Rare: 5 }, packs: 1, boxPriceCents: 0 });
  const total = ev.lines.reduce((a, l) => a + l.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("a zero-EV configuration yields shares of 0 rather than NaN", () => {
  const stats = new Map([["Common" as PoolKey, { avgCents: 0, priced: 0, total: 10, topCents: 0 }]]);
  const ev = computeEv({ stats, rates: { Common: 7 }, packs: 24, boxPriceCents: 5000 });
  assert.equal(ev.evBoxCents, 0);
  for (const l of ev.lines) assert.equal(l.share, 0);
  assert.equal(ev.ratio, 0);
});

test("the box-price ratio compares EV against what you'd pay", () => {
  const stats = new Map([["Common" as PoolKey, { avgCents: 100, priced: 10, total: 10, topCents: 100 }]]);
  const ev = computeEv({ stats, rates: { Common: 1 }, packs: 24, boxPriceCents: 1200 });
  assert.equal(ev.evBoxCents, 2400);
  assert.equal(ev.ratio, 2);
});

test("pools with no cards never reach the EV table", () => {
  const stats = new Map([["Common" as PoolKey, { avgCents: 10, priced: 1, total: 1, topCents: 10 }]]);
  const ev = computeEv({ stats, rates: { Common: 7, Signature: 99 }, packs: 1, boxPriceCents: 0 });
  assert.deepEqual(ev.lines.map((l) => l.pool), ["Common"]);
});
