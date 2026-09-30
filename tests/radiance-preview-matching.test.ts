import test from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, resolveCardId, type CardLite } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// Radiance Preview Season (catalogued 2026-09-29 in prisma/manual-cards.json)
// gave five names a second printing before a single store had listed either:
//   • K'Sante, Courageous — base 086/167 beside the HEARTSTEEL 178/167;
//   • Seraphine, Not Alone — RAD 138/167 beside the T1 collection's T1S 005,
//     a promo that is never sold as a retail single;
//   • Evelynn, Consuming 090/090a, Ziggs 141/169*, Orianna 145/171* and
//     Seraphine, Starry-Eyed Songstress 151/174* — base prints and their chase
//     prints in the same set.
// A plain listing must land on the ordinary printing, and a listing that names
// the chase print (its number, "Signature", "Alternate Art", "Overnumbered")
// must land on that one. Seraphine's Legend now has both an unsigned 174/167
// and its signed twin 174*/167, so the asterisk alone separates them.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, name: string, setCode: string, collectorNumber: string, rarity: string, isPromo = false): CardLite => ({
  id,
  name,
  setCode,
  collectorNumber,
  rarity,
  variant: collectorNumber.match(/^\d+([a-z]+)/i)?.[1] ?? null,
  isPromo,
});
const idx = buildCardIndex([
  c("ksante-086", "K'Sante, Courageous", "RAD", "086/167", "Rare"),
  c("ksante-178", "K'Sante, Courageous", "RAD", "178/167", "Showcase"),
  c("notalone-t1s", "Seraphine, Not Alone", "T1S", "005/005", "Showcase", true),
  c("notalone-138", "Seraphine, Not Alone", "RAD", "138/167", "Epic"),
  c("evelynn-090", "Evelynn, Consuming", "RAD", "090/167", "Epic"),
  c("evelynn-090a", "Evelynn, Consuming", "RAD", "090a/167", "Showcase"),
  c("ziggs-141", "Ziggs, Hexplosives Expert", "RAD", "141/167", "Rare"),
  c("ziggs-169s", "Ziggs, Hexplosives Expert", "RAD", "169*/167", "Showcase"),
  c("orianna-145", "Orianna, Lady of Clockwork", "RAD", "145/167", "Rare"),
  c("orianna-171s", "Orianna, Lady of Clockwork", "RAD", "171*/167", "Showcase"),
  c("songstress-151", "Seraphine, Starry-Eyed Songstress", "RAD", "151/167", "Rare"),
  c("songstress-174", "Seraphine, Starry-Eyed Songstress", "RAD", "174/167", "Showcase"),
  c("songstress-174s", "Seraphine, Starry-Eyed Songstress", "RAD", "174*/167", "Showcase"),
]);
const resolve = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, idx);

test("a bare-name listing finds the ordinary Radiance printing", () => {
  assert.equal(resolve("K'Sante, Courageous"), "ksante-086");
  assert.equal(resolve("Seraphine, Not Alone"), "notalone-138");
  assert.equal(resolve("Evelynn, Consuming"), "evelynn-090");
  assert.equal(resolve("Ziggs, Hexplosives Expert"), "ziggs-141");
  assert.equal(resolve("Orianna, Lady of Clockwork"), "orianna-145");
  assert.equal(resolve("Seraphine, Starry-Eyed Songstress"), "songstress-151");
});

test("a listing that names the chase print gets the chase print", () => {
  assert.equal(resolve("K'Sante, Courageous - 178/167"), "ksante-178");
  assert.equal(resolve("K'Sante, Courageous (Overnumbered)"), "ksante-178");
  assert.equal(resolve("Evelynn, Consuming (Alternate Art)"), "evelynn-090a");
  assert.equal(resolve("Evelynn, Consuming - 090a/167"), "evelynn-090a");
  assert.equal(resolve("Ziggs, Hexplosives Expert - 169*/167"), "ziggs-169s");
  assert.equal(resolve("Orianna, Lady of Clockwork (Signature)"), "orianna-171s");
  assert.equal(resolve("Seraphine, Starry-Eyed Songstress (Signature)"), "songstress-174s");
  assert.equal(resolve("Seraphine, Starry-Eyed Songstress - 174*/167"), "songstress-174s");
});

test("the asterisk separates a Signature from its unsigned overnumbered twin", () => {
  assert.equal(resolve("Seraphine, Starry-Eyed Songstress - 174/167"), "songstress-174");
  assert.equal(resolve("Seraphine, Starry-Eyed Songstress - 174*/167 Signature"), "songstress-174s");
});

test("a numbered base listing is not pulled onto the chase print or the T1 promo", () => {
  assert.equal(resolve("K'Sante, Courageous - 086/167"), "ksante-086");
  assert.equal(resolve("Seraphine, Not Alone - 138/167"), "notalone-138");
  assert.equal(resolve("Seraphine, Not Alone - Radiance"), "notalone-138");
});

// The SP printings (2026-09-30): "RAD · SP4/005" Kai'Sa, Rebel and "RAD · SP5/005"
// Seraphine, Not Alone, new art on a gold gem. They are catalogued with
// isPromo false, so they sit beside the base cards in the same set, and a
// plain listing must still find the base printing.
test("the SP printings never take a plain listing from the base card", () => {
  const sp = buildCardIndex([
    c("kaisa-063", "Kai'Sa, Rebel", "RAD", "063/167", "Rare"),
    c("kaisa-sp4", "Kai'Sa, Rebel", "RAD", "SP4/005", "Showcase"),
    c("notalone-138", "Seraphine, Not Alone", "RAD", "138/167", "Epic"),
    c("notalone-sp5", "Seraphine, Not Alone", "RAD", "SP5/005", "Showcase"),
    c("notalone-t1s", "Seraphine, Not Alone", "T1S", "005/005", "Showcase", true),
  ]);
  const r = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, sp);
  assert.equal(r("Kai'Sa, Rebel"), "kaisa-063");
  assert.equal(r("Kai'Sa, Rebel - 063/167"), "kaisa-063");
  assert.equal(r("Seraphine, Not Alone"), "notalone-138");
  assert.equal(r("Seraphine, Not Alone - 138/167"), "notalone-138");
});

// Riot's full gallery (2026-09-30) adds alternate arts beside several base
// cards, an over-numbered Legend beside its in-set printing, and renames K'Sante's
// Legend to "K'Sante, Pride of Nazumah" like every other Legend.
test("the gallery's alternate arts and over-numbers each get their own listings", () => {
  const g = buildCardIndex([
    c("z023", "Ziggs, Short-Fused", "RAD", "023/167", "Epic"),
    c("z023a", "Ziggs, Short-Fused", "RAD", "023a/167", "Showcase"),
    c("j155", "Jarvan IV, Exemplar of Demacia", "RAD", "155/167", "Rare"),
    c("j176", "Jarvan IV, Exemplar of Demacia", "RAD", "176/167", "Showcase"),
    c("k086", "K'Sante, Courageous", "RAD", "086/167", "Rare"),
    c("k086a", "K'Sante, Courageous", "RAD", "086a/167", "Showcase"),
    c("k178", "K'Sante, Courageous", "RAD", "178/167", "Showcase"),
    c("p147", "K'Sante, Pride of Nazumah", "RAD", "147/167", "Rare"),
    c("p172", "K'Sante, Pride of Nazumah", "RAD", "172/167", "Showcase"),
  ]);
  const r = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, g);
  assert.equal(r("Ziggs, Short-Fused"), "z023");
  assert.equal(r("Ziggs, Short-Fused (Alternate Art)"), "z023a");
  assert.equal(r("Jarvan IV, Exemplar of Demacia"), "j155");
  assert.equal(r("Jarvan IV, Exemplar of Demacia - 176/167"), "j176");
  assert.equal(r("K'Sante, Courageous"), "k086");
  assert.equal(r("K'Sante, Courageous (Alternate Art)"), "k086a");
  assert.equal(r("K'Sante, Courageous - 178/167"), "k178");
  assert.equal(r("K'Sante - Pride of Nazumah"), "p147");
  assert.equal(r("Pride of Nazumah - 172/167"), "p172");
});
