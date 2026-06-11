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
 *     "domain": "Fury",            // Fury|Calm|Mind|Body|Chaos|Order|Colorless
 *     "type": "Unit",              // Unit|Spell|Gear|Rune|Battlefield|Legend
 *     "rarity": "Rare",            // Common|Uncommon|Rare|Epic|Showcase
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
import { cardSlug } from "../src/lib/card-url";
import { normalizeSearch } from "../src/lib/format";

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
      // Keep the search index in sync — a card with an empty nameNormalized can
      // NEVER be found by name search (the box matches on this column).
      nameNormalized: normalizeSearch(c.name),
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
      // Keep the existing slug — it's the card's public URL; renames shouldn't
      // break inbound links. (Only a missing slug is backfilled.)
      await prisma.card.update({
        where: { id: existing.id },
        data: { ...data, artSeed: existing.artSeed, slug: existing.slug ?? cardSlug(c) },
      });
      updated++;
    } else {
      await prisma.card.create({ data: { ...data, slug: cardSlug(c) } });
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
