import { test } from "node:test";
import assert from "node:assert/strict";
import { chasePrintRarity, RARITY_KEYS, isOvernumbered, isSignature } from "../src/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// A chase print does not sit in a base rarity tier.
// ─────────────────────────────────────────────────────────────────────────────
// Reported live: /browse?rarity=Rare returned a wall of A$165–172 Vendetta chase
// cards — Ambessa 196/166, Swain 173/166, Draven 172/166, Leona 184/166. The
// filter was correct; the DATA said they were Rare, because the official
// Vendetta gallery labels a re-print by the rarity of the card it re-prints.
//
// A cross-set census (scripts/audit-rarity.ts, production 2026-08-03) showed
// every OTHER set already keeps its chase prints in Showcase:
//
//   set   ALT-ART      SIG                  OVERNUM
//   OGN   Showcase:39  Showcase:12          Showcase:12
//   SFD   Showcase:36  Showcase:12          Showcase:30
//   UNL   Showcase:42  Showcase:12          Showcase:19
//   VEN   Showcase:18  Rare:1 Showcase:8    Rare:24 Epic:7   ← the outlier
//
// …so this is not a new policy, it is Vendetta catching up.

test("an overnumbered print is Showcase, whatever it re-prints", () => {
  for (const base of ["Common", "Uncommon", "Rare", "Epic"]) {
    assert.equal(chasePrintRarity({ collectorNumber: "196/166", rarity: base }), "Showcase", base);
  }
});

test("THE REPORTED CARDS", () => {
  for (const [num, name] of [["196/166", "Ambessa"], ["173/166", "Swain"], ["172/166", "Draven"], ["184/166", "Leona"]]) {
    assert.equal(chasePrintRarity({ collectorNumber: num, rarity: "Rare" }), "Showcase", name);
  }
});

test("a Signature print is Showcase — the one VEN outlier", () => {
  // 196*/166 Ambessa was Rare while all 8 other VEN signatures were Showcase.
  assert.equal(chasePrintRarity({ collectorNumber: "196*/166", rarity: "Rare" }), "Showcase");
});

test("an alt-art print is Showcase", () => {
  assert.equal(chasePrintRarity({ collectorNumber: "036/298", variant: "a", rarity: "Rare" }), "Showcase");
});

test("A BASE PRINT KEEPS ITS RARITY — this must not touch the base set", () => {
  // VEN's base distribution already matches every other set (31/26/25/18%
  // C/U/R/E vs OGN 30/28/28/14). Rewriting it would be the real damage.
  for (const r of RARITY_KEYS) {
    assert.equal(chasePrintRarity({ collectorNumber: "045/166", rarity: r }), r, r);
  }
});

test("PROMOS keep their base rarity — the existing convention, unchanged", () => {
  // Every set keeps promos in base tiers (OGN promo: Common:20 Uncommon:5
  // Rare:19 Epic:3). They carry their own PROMO badge and their own filter.
  assert.equal(chasePrintRarity({ collectorNumber: "196/166", isPromo: true, rarity: "Rare" }), "Rare");
  assert.equal(chasePrintRarity({ collectorNumber: "036/298", variant: "a", isPromo: true, rarity: "Common" }), "Common");
});

test("Crystal Rose (VEN SP1–SP6) keeps its genuine Epic tier", () => {
  // Its collector numbers are not numeric-over-total, so isOvernumbered() is
  // false by construction and the rule leaves them alone — they have their own
  // Crystal Rose badge.
  assert.equal(isOvernumbered("SP1/006"), false);
  assert.equal(chasePrintRarity({ collectorNumber: "SP1/006", rarity: "Epic" }), "Epic");
});

test("the rule is idempotent — re-running never changes an already-fixed row", () => {
  const once = chasePrintRarity({ collectorNumber: "196/166", rarity: "Rare" });
  assert.equal(chasePrintRarity({ collectorNumber: "196/166", rarity: once }), once);
});

test("a Signature is never also counted as overnumbered", () => {
  // isOvernumbered excludes "*" by design, so the two branches cannot both fire
  // and disagree about which label applies.
  assert.equal(isSignature("196*/166"), true);
  assert.equal(isOvernumbered("196*/166"), false);
});

test("an unparseable collector number is left alone rather than promoted", () => {
  for (const n of ["TBA", "R01", "T04", ""]) {
    assert.equal(chasePrintRarity({ collectorNumber: n, rarity: "Common" }), "Common", n);
  }
});
