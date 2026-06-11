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
import { cardSlug } from "../src/lib/card-url";

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
    // Don't clone identity or per-printing state from the base:
    //  - slug is @unique → cloning it makes the insert throw; promos get their own
    //    ("-promo"-suffixed) slug.
    //  - lowest prices (ALL four markets) belong to the base's listings, not this
    //    new printing — the importer fills them in once real promo listings match.
    //  - view/search counts and eBay state are per-printing popularity signals.
    const { id, createdAt, slug, ...rest } = base;
    await prisma.card.create({
      data: {
        ...rest,
        externalId,
        isPromo: true,
        slug: cardSlug({ ...base, isPromo: true }),
        lowestPriceCents: null,
        lowestPriceCentsNz: null,
        lowestPriceCentsUs: null,
        lowestPriceCentsUk: null,
        viewCount: 0,
        searchCount: 0,
        lastViewedAt: null,
        ebayCheckedAt: null,
      },
    });
    created++;
  }
  console.log(`Promos: created ${created}, skipped ${skipped} (existed), ${noBase} had no base card.`);
  const total = await prisma.card.count({ where: { isPromo: true } });
  console.log(`Total promo cards now: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
