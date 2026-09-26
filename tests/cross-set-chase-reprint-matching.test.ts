import test from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, resolveCardId, type CardLite } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// Radiance's HEARTSTEEL cards (RAD 178–183/167, catalogued 2026-09-26) are
// over-numbered REPRINTS of cards that have been legal since Origins and
// Spiritforged: Sett, Kingpin, Aphelios, Exalted, Kayn, Unleashed and the rest.
// Before them, every one of those names lived in a single set, so a store title
// giving nothing but the name matched without needing any set evidence. One RAD
// row turned each into a two-set name and sent it to the set check, which a
// title with no number and no set name cannot pass: the listing matched nothing
// and the older card lost prices it had carried since launch.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, name: string, setCode: string, collectorNumber: string, rarity: string): CardLite => ({
  id, name, setCode, collectorNumber, rarity, variant: null, isPromo: false,
});
const CARDS: CardLite[] = [
  c("sett-ogn", "Sett, Kingpin", "OGN", "240/298", "Rare"),
  c("sett-ogn-alt", "Sett, Kingpin", "OGN", "240a/298", "Showcase"),
  c("sett-rad", "Sett, Kingpin", "RAD", "183/167", "Showcase"),
  c("kayn-ogn", "Kayn, Unleashed", "OGN", "189/298", "Rare"),
  c("kayn-rad", "Kayn, Unleashed", "RAD", "182/167", "Showcase"),
  c("aphelios-sfd", "Aphelios, Exalted", "SFD", "049/221", "Rare"),
  c("aphelios-sfd-over", "Aphelios, Exalted", "SFD", "224/221", "Showcase"),
  c("aphelios-sfd-sig", "Aphelios, Exalted", "SFD", "224*/221", "Showcase"),
  c("aphelios-rad", "Aphelios, Exalted", "RAD", "179/167", "Showcase"),
  // A base-numbered reprint: no chase print involved, so set evidence is still required.
  c("reprint-ogn", "Test Reprint", "OGN", "010/298", "Common"),
  c("reprint-ogs", "Test Reprint", "OGS", "005/024", "Common"),
];
const idx = buildCardIndex(CARDS);
const resolve = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, idx);

test("a bare-name listing of a reprinted card still finds the ordinary printing", () => {
  assert.equal(resolve("Sett, Kingpin"), "sett-ogn");
  assert.equal(resolve("Sett - Kingpin (Foil)"), "sett-ogn");
  assert.equal(resolve("Aphelios, Exalted"), "aphelios-sfd");
});

test("a listing whose number names the over-numbered reprint still gets it", () => {
  assert.equal(resolve("Kayn, Unleashed - 182/167"), "kayn-rad");
  assert.equal(resolve("Sett, Kingpin - 183/167"), "sett-rad");
  assert.equal(resolve("Sett, Kingpin (Overnumbered) - Radiance"), "sett-rad");
  assert.equal(resolve("Aphelios, Exalted - 179/167"), "aphelios-rad");
  // …and the older set's own chase print is unaffected.
  assert.equal(resolve("Aphelios, Exalted - 224/221"), "aphelios-sfd-over");
  assert.equal(resolve("Sett, Kingpin - 240/298"), "sett-ogn");
});

test("a Showcase listing with no set evidence is left alone, not pinned on the base card", () => {
  // Sett has a Showcase in OGN (240a) and in RAD (183): without a set, either could be meant.
  assert.equal(resolve("Sett, Kingpin - Showcase"), null);
});

test("a base-numbered reprint in two sets still needs set evidence", () => {
  assert.equal(resolve("Test Reprint"), null);
  assert.equal(resolve("Test Reprint - 005/024 - Proving Grounds"), "reprint-ogs");
});
