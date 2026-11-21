import test from "node:test";
import assert from "node:assert/strict";
import { classifySealed, setCatchAllRedirect } from "../src/lib/sealed-import";
import { sealedSlug } from "../src/lib/sealed-slug";

// THE BARE "SEALED" PAGE MIXED A PACK AND A CASE (2026-11-21, DECISIONS.md). Real titles from the 21 Nov 16:26 UTC
// sealed-listings.json export: each set's "<SET>|Sealed" page held Cardmarket's single booster (EUR 3-5) beside
// spellnexus's six-box case (EUR 600-900), so the case page's cheapest price was a pack. OGN|Sealed also held four
// different Trial Decks and a EUR 2,250 promo booster.

test("Cardmarket's '<Set> Booster' is one booster pack", () => {
  for (const t of ["Origins Booster", "Radiance Booster", "Spiritforged Booster", "Unleashed Booster", "Vendetta Booster", "Legacy Booster"]) {
    assert.equal(classifySealed(t), "Booster Pack", t);
  }
});

test("a promos booster is not the set's pack", () => {
  assert.equal(classifySealed("Project K Promos Booster"), "Sealed");
});

test("Cardmarket's Nexus Night Promo Booster is the Nexus Night Pack", () => {
  for (const t of ["Radiance Nexus Night Promo Booster", "Vendetta Nexus Night Promo Booster", "Unleashed Nexus Night Promo Booster"]) {
    assert.equal(classifySealed(t), "Nexus Night Pack", t);
  }
  assert.equal(classifySealed("Radiance - Nexus Night Promo Pack"), "Nexus Night Pack"); // unchanged
});

test("'<Set> Case' is that set's booster case", () => {
  for (const t of [
    "Riftbound Radiance Case English",
    "Riftbound Spiritforged Case English",
    "Riftbound Legacy Case English (PRESALE)",
    "Riftbound Reckoning Case English (PRESALE)",
  ]) {
    assert.equal(classifySealed(t), "Booster Case", t);
  }
  // Never a Vault Bundle Case, and never a single box "from a case".
  assert.equal(classifySealed("Legacy - Vault Bundle Case"), "Bundle Case");
  assert.equal(classifySealed("x1 Riftbound: Origins Booster Box FRESHLY FROM A CASE"), "Booster Box");
});

test("each Trial Deck is its own product", () => {
  assert.equal(classifySealed("Jinx Trial Deck"), "Trial Deck (Jinx)");
  assert.equal(classifySealed("Volibear Trial Deck"), "Trial Deck (Volibear)");
  assert.equal(classifySealed("Yasuo Trial Deck"), "Trial Deck (Yasuo)");
});

test("an emptied set catch-all page goes to its set hub, never a 404", () => {
  assert.equal(setCatchAllRedirect(sealedSlug("RAD|Sealed")), "/sets/radiance");
  assert.equal(setCatchAllRedirect(sealedSlug("OGN|Sealed")), "/sets/origins");
  assert.equal(setCatchAllRedirect(sealedSlug("RAD|Booster Box")), null);
  assert.equal(setCatchAllRedirect("xyz-sealed"), null);
  assert.equal(setCatchAllRedirect("secretgardenbox"), null);
});
