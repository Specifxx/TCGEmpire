/**
 * Attach real ENGLISH rune art to printings that render the generated placeholder,
 * and clear art that is the wrong language for this site.
 *
 * WHY THIS EXISTS: neither RiftScribe nor the official gallery publishes the
 * alt-art / promo rune cycles, and add-tcg-printings.ts only ever created the rows
 * (cloning a donor card's art, which fix-cloned-art.ts then cleared as wrong). So
 * 36 rune printings sat on the placeholder. The art below is cropped from a
 * community-compiled "every Riftbound rune variation" reference chart; every card
 * used here carries its own set + collector code printed on the card face
 * (e.g. "UNL · R01a", "SFD · R01b", "OGN · 007b/298"), which is what each entry is
 * matched on — no guessing, and nothing is cloned from another print.
 *
 * DELIBERATELY NOT COVERED (a rune printing keeps the placeholder rather than
 * borrow a photo whose printed collector code contradicts the row):
 *   - SFD R01a-R06a — the chart's "Spiritforged & Origins Alt Arts" cards are all
 *     OGN-coded (007a/298 …), so they are the Origins print, not the SFD one.
 *   - UNL R01b-R06b — the chart's Nexus Night promo cards are all SFD-coded.
 *   - OGN NN1 x6 — no NN1-coded card appears on the chart.
 *   - VEN R01A-R06A — only the simplified-Chinese print exists on the chart
 *     (card name reads 炽烈符文, not "Fury Rune"), so it is CLEARED here instead:
 *     wrong-language art is worse than no art on an English price site. Same call
 *     fix-cloned-art.ts makes for a variant with no correct art.
 *
 * PROD-SAFE: only ever writes imageUrl/imageThumbUrl/blurDataUrl, never card data.
 * Matches on setCode + collectorNumber (case-insensitive), so it adopts whichever
 * row already exists rather than creating anything. Idempotent.
 *
 * Usage: npx tsx scripts/set-rune-art.ts   (DRY_RUN=1 to preview)
 */
import { prisma } from "../src/lib/db";

const DRY = process.env.DRY_RUN === "1";
const BASE = "https://riftcompare.com/rune-variants";

// [setCode, collectorNumber, filename] — collector code as printed on the card.
const ART: [string, string, string][] = [
  // Origins promo runes ("b" prints) — chart section "Origins Promo Runes"
  ["OGN", "007b/298", "fury-rune-ogn-007b.jpg"],
  ["OGN", "042b/298", "calm-rune-ogn-042b.jpg"],
  ["OGN", "089b/298", "mind-rune-ogn-089b.jpg"],
  ["OGN", "126b/298", "body-rune-ogn-126b.jpg"],
  ["OGN", "166b/298", "chaos-rune-ogn-166b.jpg"],
  ["OGN", "214b/298", "order-rune-ogn-214b.jpg"],
  // Unleashed alt arts — chart section "Unleashed Alt Arts" (Envar Studio)
  ["UNL", "R01a", "fury-rune-unl-r01a.jpg"],
  ["UNL", "R02a", "calm-rune-unl-r02a.jpg"],
  ["UNL", "R03a", "mind-rune-unl-r03a.jpg"],
  ["UNL", "R04a", "body-rune-unl-r04a.jpg"],
  ["UNL", "R05a", "chaos-rune-unl-r05a.jpg"],
  ["UNL", "R06a", "order-rune-unl-r06a.jpg"],
  // Spirit Forged Nexus Night promo runes — chart section "Spiritforged & Unleashed
  // Nexus Night Promo Runes"; every card in it is SFD-coded.
  ["SFD", "R01b", "fury-rune-sfd-r01b.jpg"],
  ["SFD", "R02b", "calm-rune-sfd-r02b.jpg"],
  ["SFD", "R03b", "mind-rune-sfd-r03b.jpg"],
  ["SFD", "R04b", "body-rune-sfd-r04b.jpg"],
  ["SFD", "R05b", "chaos-rune-sfd-r05b.jpg"],
  ["SFD", "R06b", "order-rune-sfd-r06b.jpg"],
];

// Printings whose only known art is the wrong language — clear to the placeholder.
const CLEAR: [string, string][] = [
  ["VEN", "R01A"], ["VEN", "R02A"], ["VEN", "R03A"],
  ["VEN", "R04A"], ["VEN", "R05A"], ["VEN", "R06A"],
];

async function findRune(setCode: string, collectorNumber: string) {
  const rows = await prisma.card.findMany({
    where: { setCode, type: "Rune" },
    select: { id: true, collectorNumber: true, name: true, slug: true, imageUrl: true },
  });
  return rows.filter((r) => r.collectorNumber.toLowerCase() === collectorNumber.toLowerCase());
}

async function main() {
  let set = 0, cleared = 0, missing = 0, ambiguous = 0;

  for (const [setCode, cn, file] of ART) {
    const hits = await findRune(setCode, cn);
    if (hits.length === 0) { console.log(`MISS   ${setCode} ${cn} — no such rune row`); missing++; continue; }
    if (hits.length > 1) { console.log(`AMBIG  ${setCode} ${cn} — ${hits.length} rows, skipping`); ambiguous++; continue; }
    const c = hits[0];
    const url = `${BASE}/${file}`;
    if (c.imageUrl === url) { console.log(`OK     ${setCode} ${cn.padEnd(9)} already set  ${c.name}`); continue; }
    console.log(`${DRY ? "(dry) " : ""}SET    ${setCode} ${cn.padEnd(9)} ${c.name} -> ${file}  /card/${c.slug}`);
    if (!DRY) {
      await prisma.card.update({
        where: { id: c.id },
        data: { imageUrl: url, imageThumbUrl: url, blurDataUrl: null },
      });
    }
    set++;
  }

  for (const [setCode, cn] of CLEAR) {
    const hits = await findRune(setCode, cn);
    if (hits.length !== 1) { console.log(`MISS   ${setCode} ${cn} — ${hits.length} rows`); missing++; continue; }
    const c = hits[0];
    if (c.imageUrl == null) { console.log(`OK     ${setCode} ${cn.padEnd(9)} already imageless  ${c.name}`); continue; }
    console.log(`${DRY ? "(dry) " : ""}CLEAR  ${setCode} ${cn.padEnd(9)} ${c.name} (wrong-language print)  /card/${c.slug}`);
    if (!DRY) {
      await prisma.card.update({
        where: { id: c.id },
        data: { imageUrl: null, imageThumbUrl: null, blurDataUrl: null },
      });
    }
    cleared++;
  }

  console.log(`\nRune art: ${set} set, ${cleared} cleared, ${missing} not found, ${ambiguous} ambiguous${DRY ? " (dry run — no writes)" : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
