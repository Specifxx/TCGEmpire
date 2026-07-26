/**
 * Fix art for promo/rune printings that scripts/add-tcg-printings.ts (or the older
 * add-promos.ts) had to clone from a donor card because no independent image source
 * existed for that exact printing — sometimes borrowing a DIFFERENT set's version of
 * the same rune, which is the wrong specific artwork.
 *
 * Uses prisma/official-images.json (built by scripts/fetch-official-images.ts) to
 * swap in the real image wherever the official gallery has this exact printing.
 * Where it doesn't:
 *  - Alt-art/Showcase-style printings (variant != null) are supposed to have unique
 *    art of their own, so a borrowed photo would misrepresent this printing as
 *    identical to its base — clear the image so it falls back to the site's existing
 *    generated CardArt placeholder (a real "no photo yet" state, not a wrong one).
 *  - Plain promo reprints (variant == null) commonly DO reuse the base card's exact
 *    art in real life (that's how most organized-play promos work) — leave those
 *    alone, matching add-promos.ts's own long-standing documented design ("no
 *    promo-specific images available").
 *
 * Usage: npx tsx scripts/fix-cloned-art.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numKey } from "../src/lib/tcgplayer";

const prisma = new PrismaClient();

async function main() {
  const dry = process.argv.includes("--dry");
  const official: { id: string; imageUrl: string }[] = JSON.parse(
    readFileSync(join(process.cwd(), "prisma", "official-images.json"), "utf8")
  );

  const officialByKey = new Map<string, string>();
  for (const o of official) {
    const m = o.id.match(/^([a-z]{2,4})-(r?\d+[a-z]?)/i);
    if (!m) continue;
    officialByKey.set(`${m[1].toLowerCase()}|${numKey(m[2])}`, o.imageUrl);
  }
  console.log(`Loaded ${officialByKey.size} official images.`);

  // Candidates: any card cloned by add-tcg-printings.ts (externalId "tcg-<id>") or
  // add-promos.ts (externalId "<set>-<num>-p") — the only two paths that ever
  // borrow a donor's art instead of having their own.
  const candidates = await prisma.card.findMany({
    where: {
      externalId: { not: null },
      OR: [{ externalId: { startsWith: "tcg-" } }, { externalId: { endsWith: "-p" } }],
    },
    select: {
      id: true, name: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, imageUrl: true, imageThumbUrl: true,
    },
  });
  console.log(`${candidates.length} cloned-art candidates.`);

  let upgraded = 0, cleared = 0, leftAlone = 0;
  const samples: string[] = [];
  for (const c of candidates) {
    const numSeg = c.collectorNumber.split("/")[0];
    const key = `${c.setCode.toLowerCase()}|${numKey(numSeg)}`;
    const real = officialByKey.get(key);

    if (real) {
      if (real !== c.imageUrl) {
        upgraded++;
        if (samples.length < 25) samples.push(`UPGRADE: ${c.name} ${c.setCode} ${c.collectorNumber}`);
        if (!dry) {
          await prisma.card.update({
            where: { id: c.id },
            data: { imageUrl: real, imageThumbUrl: real, blurDataUrl: null },
          });
        }
      } else {
        leftAlone++; // already correct
      }
      continue;
    }

    if (c.variant != null) {
      cleared++;
      if (samples.length < 25) samples.push(`CLEAR (Showcase, no real art): ${c.name} ${c.setCode} ${c.collectorNumber}`);
      if (!dry && (c.imageUrl || c.imageThumbUrl)) {
        await prisma.card.update({
          where: { id: c.id },
          data: { imageUrl: null, imageThumbUrl: null, blurDataUrl: null },
        });
      }
    } else {
      leftAlone++; // plain promo — sharing base art is expected, leave it
    }
  }

  console.log(`${dry ? "[DRY] " : ""}upgraded=${upgraded} clearedToPlaceholder=${cleared} leftAlone=${leftAlone}`);
  for (const s of samples) console.log("  ", s);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
