/**
 * Import real Riftbound card data from a JSON file into the database.
 *
 * Usage:
 *   npx tsx scripts/import-cards.ts path/to/cards.json
 *
 * Expected JSON: an array of objects shaped like:
 * [
 *   {
 *     "name": "Jinx, Loose Cannon",
 *     "setCode": "OGN",
 *     "setName": "Origins",
 *     "collectorNumber": "012/298",
 *     "domain": "Fury",            // Fury|Calm|Mind|Body|Chaos|Order|Neutral
 *     "type": "Champion",          // Champion|Unit|Spell|Gear|Rune|Battlefield|Legend
 *     "rarity": "Legendary",       // Common|Uncommon|Rare|Epic|Legendary|Mythic
 *     "energyCost": 5,
 *     "might": 6,
 *     "tags": "Zaun, Marksman",
 *     "description": "…rules text…",
 *     "flavorText": "…",
 *     "marketPriceAud": 89.0       // dollars; converted to cents on import
 *   }
 * ]
 *
 * Existing cards (matched on setCode + collectorNumber) are updated; new ones
 * are created. This does NOT touch listings, users or orders.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ImportCard {
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  domain: string;
  type: string;
  rarity: string;
  energyCost?: number | null;
  might?: number | null;
  tags?: string | null;
  description?: string | null;
  flavorText?: string | null;
  marketPriceAud?: number;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/import-cards.ts <path-to-cards.json>");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const cards = JSON.parse(raw) as ImportCard[];
  if (!Array.isArray(cards)) {
    console.error("Expected the JSON file to contain an array of cards.");
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  for (const c of cards) {
    const data = {
      name: c.name,
      setCode: c.setCode,
      setName: c.setName,
      collectorNumber: c.collectorNumber,
      domain: c.domain,
      type: c.type,
      rarity: c.rarity,
      energyCost: c.energyCost ?? null,
      might: c.might ?? null,
      tags: c.tags ?? null,
      description: c.description ?? null,
      flavorText: c.flavorText ?? null,
      marketPriceCents: Math.round((c.marketPriceAud ?? 0) * 100),
      artSeed: Math.floor(Math.random() * 1_000_000),
    };

    const existing = await prisma.card.findFirst({
      where: { setCode: c.setCode, collectorNumber: c.collectorNumber },
    });

    if (existing) {
      await prisma.card.update({
        where: { id: existing.id },
        data: { ...data, artSeed: existing.artSeed },
      });
      updated++;
    } else {
      await prisma.card.create({ data });
      created++;
    }
  }

  console.log(`Import complete: ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
