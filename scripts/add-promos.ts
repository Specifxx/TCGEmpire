/**
 * Add promo printings to the database (additive — does not wipe anything).
 * Each promo is cloned from its base card (same name/number/art) with isPromo=true.
 * Promos share the base art (no promo-specific images available).
 *
 * Usage: npx tsx scripts/add-promos.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

async function main() {
  const promos: { set: string; num: string }[] = JSON.parse(
    readFileSync(join(process.cwd(), "prisma", "promos.json"), "utf8")
  );

  let created = 0;
  let skipped = 0;
  let noBase = 0;
  for (const pr of promos) {
    const externalId = `${pr.set.toLowerCase()}-${pr.num}-p`;
    if (await prisma.card.findUnique({ where: { externalId } })) {
      skipped++;
      continue;
    }
    const base = await prisma.card.findFirst({
      where: {
        setCode: pr.set,
        isPromo: false,
        variant: null,
        collectorNumber: { startsWith: `${pr.num}/` },
      },
    });
    if (!base) {
      noBase++;
      continue;
    }
    const { id, createdAt, ...rest } = base;
    await prisma.card.create({
      data: { ...rest, externalId, isPromo: true, lowestPriceCents: null },
    });
    created++;
  }
  console.log(`Promos: created ${created}, skipped ${skipped} (existed), ${noBase} had no base card.`);
  const total = await prisma.card.count({ where: { isPromo: true } });
  console.log(`Total promo cards now: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
