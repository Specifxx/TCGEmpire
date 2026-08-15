import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPreorderSetCode } from "../src/lib/constants";
import { classifySealed, isTrackableSealedTitle } from "../src/lib/sealed-import";
import { setCodeFromSetName } from "../src/lib/tcgplayer";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Pre-order listings for unreleased sets.
// ─────────────────────────────────────────────────────────────────────────────
// Unreleased sets used to be dropped at import ("never list their (pre-order)
// sealed products"). They are imported now, which is only safe because three
// things hold: they are labelled pre-orders, they are kept off the pages that
// mean "buyable today", and they never inherit another set's RRP. Each is pinned
// below, because losing any one of them turns a real feature into a false claim
// about a product nobody can ship.

test("an unreleased set reads as pre-order, and a shipped one does not", () => {
  // Radiance: 23 Oct 2026.
  assert.equal(isPreorderSetCode("RAD", new Date("2026-08-15T00:00:00Z")), true);
  assert.equal(isPreorderSetCode("VEN", new Date("2026-08-15T00:00:00Z")), false, "Vendetta shipped 31 Jul 2026");
  assert.equal(isPreorderSetCode("OGN", new Date("2026-08-15T00:00:00Z")), false);
});

test("the pre-order flag retires itself on release day — no code change needed", () => {
  // The day before, and the day after. This is the whole reason the helper takes
  // `now` rather than reading the clock: the rollover is the behaviour.
  assert.equal(isPreorderSetCode("RAD", new Date("2026-10-22T00:00:00Z")), true, "still a pre-order the day before");
  assert.equal(isPreorderSetCode("RAD", new Date("2026-10-24T00:00:00Z")), false, "released — no longer a pre-order");
});

test("an unknown set code is treated as released, not as a pre-order", () => {
  assert.equal(isPreorderSetCode("ZZZ"), false);
  assert.equal(isPreorderSetCode(null), false);
  assert.equal(isPreorderSetCode(undefined), false);
});

test("Pokémon's Astral Radiance is never mistaken for Riftbound's Radiance", () => {
  // Searching tracked stores for "radiance" returns far more Pokémon Astral
  // Radiance than Riftbound — verified live against real storefronts. Both layers
  // that can assign a set must reject it.
  assert.equal(setCodeFromSetName("Astral Radiance"), null);
  assert.equal(setCodeFromSetName("Pokemon - Astral Radiance"), null);
  assert.equal(setCodeFromSetName("Radiance"), "RAD", "Riftbound's own set must still resolve");

  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /FOREIGN_RADIANCE\s*=\s*\/\\bastral\\s\*radiance\\b\/i/, "the guard regex must stay");
  // Used in BOTH the store-scrape gate and the TCGplayer catalogue loop.
  const uses = src.match(/FOREIGN_RADIANCE\.test\(/g) ?? [];
  assert.ok(uses.length >= 2, `expected the guard on both import paths, saw ${uses.length}`);
});

test("Radiance sealed titles classify into real product types", () => {
  // Real titles observed on tracked storefronts.
  assert.equal(classifySealed("Riftbound: League of Legends - Radiance Booster Box (Pre-Order)"), "Booster Box");
  assert.equal(classifySealed("Riftbound League of Legends TCG - Radiance Booster Pack (Preorder)"), "Booster Pack");
  assert.equal(
    classifySealed("Riftbound League of Legends TCG - Radiance Pre-Rift Event Kit (Preorder)"),
    "Pre-Rift Event Kit",
  );
});

test("real Radiance pre-order titles pass the import gate", () => {
  // VERBATIM titles read off tracked storefronts' own Shopify search on
  // 2026-08-15, which is what made this feature buildable rather than
  // speculative. If the gate stops accepting these, the page goes quietly empty.
  for (const title of [
    "Riftbound: League of Legends - Radiance Booster Box (Pre-Order)",
    "Riftbound League of Legends TCG - Radiance Booster Box (Preorder)",
    "Riftbound League of Legends TCG - Radiance Vault (Preorder)",
    "Riftbound: League of Legends - Showdown Deck - Radiance Evelynn vs Seraphine (Pre-Order)",
    "Riftbound League of Legends TCG - Radiance Pre-Rift Event Kit (Preorder)",
  ]) {
    assert.ok(isTrackableSealedTitle(title), `gate rejected a real pre-order listing: ${title}`);
  }
});

test("the import gate still rejects Pokémon Astral Radiance sealed", () => {
  // The false positive that a bare "radiance" match would let in — these are real
  // titles returned by tracked stores when searching "radiance".
  for (const title of [
    "Pokemon - Astral Radiance - Booster pack",
    "Pokemon TCG Astral Radiance Booster Box",
  ]) {
    assert.ok(!isTrackableSealedTitle(title), `gate admitted a Pokémon product: ${title}`);
  }
});

test("pre-orders never carry an RRP claim", () => {
  // lib/msrp.ts is keyed by productType alone, so without this an unreleased
  // Booster Box inherits the CURRENT set's published RRP and renders "at RRP" or
  // "18% over RRP" for a product whose RRP has never been announced.
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /const preorder = isPreorderSetCode\(g\.setCode\)/, "the group must know it is a pre-order");
  assert.match(src, /g\.msrpCents = preorder \? null : msrpCents\(/, "RRP must be null for pre-orders");
  assert.match(src, /g\.atMsrp = !preorder &&/, "the at-RRP badge must be suppressed for pre-orders");
  assert.match(src, /g\.overMsrpPct =\s*\n?\s*!preorder &&/, "the over-RRP figure must be suppressed for pre-orders");
});

test("pre-orders are kept off the pages that mean 'buyable today'", () => {
  const src = read("src/lib/sealed-import.ts");
  // getSealedGroups is what /sealed, the set pages and /api/v1/sealed.json read.
  assert.match(
    src,
    /export async function getSealedGroups[\s\S]*?return all\.filter\(\(g\) => !isPreorderSetCode\(g\.setCode\)\)/,
    "getSealedGroups must exclude pre-orders",
  );
  assert.match(
    src,
    /export async function getPreorderGroups[\s\S]*?return all\.filter\(\(g\) => isPreorderSetCode\(g\.setCode\)\)/,
    "getPreorderGroups must return only pre-orders",
  );
  // The unfiltered builder must not be exported — that is the only way a caller
  // could accidentally mix the two back together.
  assert.ok(!/export async function getAllSealedGroups/.test(src), "the unfiltered builder must stay private");
});

test("the pre-order page declares PreOrder availability, never InStock", () => {
  const page = read("src/app/radiance-preorders/page.tsx");
  assert.match(page, /schema\.org\/PreOrder/, "structured data must say PreOrder");
  assert.ok(!/schema\.org\/InStock/.test(page), "must never claim InStock for an unshipped product");
});

test("the countdown page's pre-order promise now points somewhere real", () => {
  // This page promised "compare booster box pre-order prices" while the importer
  // was still dropping every unreleased-set listing, so the link it offered could
  // not have shown one.
  const page = read("src/app/radiance-countdown/page.tsx");
  assert.match(page, /href="\/radiance-preorders"/, "the pre-order tile must link to the comparison page");
});
