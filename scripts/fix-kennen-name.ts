/**
 * Fix the "Yordle, Heart of the Tempest" placeholder name still sitting on VEN
 * 155/166 (base Rare) and 197/166 (overnumbered chase) — the Signature sibling
 * (collector number 197 with a star, over a total of 166) was manually corrected
 * to "Kennen, Heart of the Tempest" at some point, but the two RiftScribe-synced
 * rows for the same Legend never were.
 *
 * Root cause of a real bug: a store (88gamesarena.com.au) sells the 155/166
 * print titled "Kennen - Heart of the Tempest", and because our own 155/166 and
 * 197/166 rows didn't share that name, resolveCardId()'s name-match found only
 * the Signature card and (before the price-import.ts fix) mis-priced it there.
 * Renaming these rows lets that listing correctly match its OWN (currently
 * unpriced) card going forward, instead of just going unmatched.
 *
 * Only the `name` column is touched — `slug` is deliberately left alone. Both
 * rows' stored slugs ("heart-of-the-tempest-ven-155"/"-197") never included
 * "yordle" in the first place, so they're not stale, and changing them would
 * break whatever external links/search results already point at these URLs
 * for no benefit.
 *
 * Idempotent — a second run finds nothing left to fix.
 *
 * Usage: npx tsx scripts/fix-kennen-name.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WRONG_NAME = "Yordle, Heart of the Tempest";
const RIGHT_NAME = "Kennen, Heart of the Tempest";

async function main() {
  const dry = process.argv.includes("--dry");
  const cards = await prisma.card.findMany({
    where: { setCode: "VEN", name: WRONG_NAME },
    select: { id: true, collectorNumber: true, slug: true, name: true },
  });
  console.log(`Found ${cards.length} VEN card(s) named "${WRONG_NAME}".`);
  for (const c of cards) {
    console.log(`${dry ? "(dry) " : ""}FIX VEN ${c.collectorNumber} /card/${c.slug} "${c.name}" -> "${RIGHT_NAME}"`);
    if (!dry) {
      await prisma.card.update({ where: { id: c.id }, data: { name: RIGHT_NAME } });
    }
  }
  console.log(`${dry ? "Would fix" : "Fixed"} ${cards.length} row(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
