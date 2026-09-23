/**
 * Attach Riot's official gallery art to specific printings that render the
 * generated placeholder.
 *
 * WHY THIS EXISTS: after the 2026-09-23 mirror refresh (scripts/mirror-card-art.ts
 * recovered 70 of the 71 cards whose CDN art had vanished), 22 card pages still
 * had no picture. Checked each against the official gallery
 * (playriftbound.com/en-us/card-gallery, its __NEXT_DATA__ card objects). Four
 * are published there under their own printing's id and are set below:
 *   unl-t02 Bird, unl-t03 Brush, unl-t06 Reflection — Unleashed tokens, never
 *     in RiftScribe's catalogue so never mirrored;
 *   unl-055a-219 Vex — the one alt art whose CDN art is still 404 at every
 *     rendition (the last entry in src/lib/card-art-missing.ts).
 * (First run, 2026-09-23: the three tokens turned out to store RiftScribe URLs
 * whose stems the same day's re-mirror had recovered, so they were SKIPPED as
 * working art and only Vex was written. They stay listed as a no-op guard.)
 * The other 18 stay on the placeholder on purpose. The gallery has the BASE
 * Vendetta runes (ven-r01 …) but not the "a" alt arts our rows are, and none of
 * the Nexus Night / organised-play promos. Borrowing another printing's picture
 * would misstate which card this is, which set-rune-art.ts and fix-cloned-art.ts
 * already refuse to do.
 *
 * MATCHED BY SLUG (read off the live sitemap), not by collector number: token
 * numbers are stored inconsistently and the slug is the one key already proven
 * to name exactly one row. Only writes imageUrl/imageThumbUrl/blurDataUrl (and
 * orientation for Brush, which is a landscape card). Never overwrites a row
 * that already carries a working picture — only a null one, or one pointing at
 * a CDN stem listed as missing. Idempotent.
 *
 * Usage: npx tsx scripts/set-official-art.ts [--dry]   (maintenance task set-official-art)
 */
import { prisma } from "../src/lib/db";
import { MISSING_CARD_ART } from "../src/lib/card-art-missing";

const DRY = process.argv.includes("--dry") || process.env.DRY_RUN === "1";
const CMS = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/";

// [slug, gallery id, file, orientation]
export const OFFICIAL_ART: [string, string, string, "portrait" | "landscape"][] = [
  ["bird-unl-t02-000", "unl-t02", "949a2e43263a9fe0d957595325c7e2ebe06bf85f-744x1039.png", "portrait"],
  ["brush-unl-t03-000", "unl-t03", "fad09d6bd9bf38e376f430ecb0b400762420d061-1039x744.png", "landscape"],
  ["reflection-unl-t06-000", "unl-t06", "80327b196c59841a67a65327974a93223a3c541a-744x1039.png", "portrait"],
  ["vex-mocking-unl-055a-219", "unl-055a-219", "9594ce4be31689c364a43954a541c4391fe0d4f3-744x1039.png", "portrait"],
];

// A stored URL that renders nothing: null, or a RiftScribe CDN URL whose stem
// the mirror could not fetch at any rendition.
function isBroken(url: string | null): boolean {
  if (!url) return true;
  const stem = /\/cards\/(?:originals|thumbnails\/\w+)\/([^/.?]+)\./.exec(url)?.[1];
  return stem != null && MISSING_CARD_ART.has(stem);
}

async function main() {
  let set = 0, skipped = 0, missing = 0;
  for (const [slug, galleryId, file, orientation] of OFFICIAL_ART) {
    const url = `${CMS}${file}?accountingTag=RB`;
    const c = await prisma.card.findUnique({
      where: { slug },
      select: { id: true, name: true, imageUrl: true, orientation: true },
    });
    if (!c) { console.log(`MISS   ${slug} — no such card`); missing++; continue; }
    if (c.imageUrl === url) { console.log(`OK     ${slug} already set`); continue; }
    if (!isBroken(c.imageUrl)) {
      console.log(`SKIP   ${slug} has working art (${c.imageUrl}) — not overwriting`);
      skipped++;
      continue;
    }
    console.log(`${DRY ? "(dry) " : ""}SET    ${slug} (${c.name}) <- gallery ${galleryId}`);
    if (!DRY) {
      await prisma.card.update({
        where: { id: c.id },
        data: { imageUrl: url, imageThumbUrl: url, blurDataUrl: null, orientation },
      });
    }
    set++;
  }
  console.log(`\nOfficial art: ${set} set, ${skipped} skipped (already had art), ${missing} not found${DRY ? " (dry run — no writes)" : ""}.`);
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
