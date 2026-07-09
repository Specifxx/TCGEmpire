/**
 * Additively add/refresh cards that our card source (RiftScribe) is missing — e.g. a
 * printing that only appears on TCGplayer. Reads prisma/manual-cards.json and UPSERTS
 * each entry (create if missing, update if present) matched by setCode+collectorNumber.
 * PROD-SAFE: never wipes, never touches cards not listed. Idempotent. Existing slugs
 * are preserved (public URLs never change).
 *
 * Entries with any FILL_ME placeholder are skipped (so nothing fabricated is inserted).
 *
 * Usage:  npx tsx scripts/add-manual-cards.ts
 *   Dry run (list what WOULD change, no writes):  DRY_RUN=1 npx tsx scripts/add-manual-cards.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardSlug } from "../src/lib/card-url";
import { normalizeSearch } from "../src/lib/format";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1";

type ManualCard = {
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string; // e.g. "151a/298" — include the alt-art letter if any
  domain: string; // Fury | Calm | Mind | Body | Chaos | Order | Colorless
  type: string; // Unit | Spell | Gear | Rune | Battlefield | Legend
  rarity: string; // Common | Uncommon | Rare | Epic | Showcase
  variant?: string | null; // e.g. "a" for an alt-art; omit for base
  isPromo?: boolean;
  energyCost?: number | null;
  might?: number | null;
  imageUrl?: string | null; // e.g. https://tcgplayer-cdn.tcgplayer.com/product/<id>_in_1000x1000.jpg
  imageThumbUrl?: string | null;
};

const REQUIRED: (keyof ManualCard)[] = ["name", "setCode", "setName", "collectorNumber", "domain", "type", "rarity"];

function incomplete(c: ManualCard): string | null {
  for (const k of REQUIRED) {
    const v = c[k];
    if (v == null || String(v).trim() === "" || String(v).includes("FILL_ME")) return `missing/placeholder "${k}"`;
  }
  if (c.imageUrl && c.imageUrl.includes("FILL_ME")) return 'placeholder "imageUrl"';
  return null;
}

async function main() {
  let list: ManualCard[];
  try {
    const raw = readFileSync(join(process.cwd(), "prisma", "manual-cards.json"), "utf8");
    list = (JSON.parse(raw) as unknown[]).filter((x): x is ManualCard => !!x && typeof x === "object" && !("_note" in (x as object)));
  } catch (e) {
    console.error("Could not read prisma/manual-cards.json:", (e as Error).message);
    return;
  }

  let created = 0, updated = 0, skipped = 0;
  for (const c of list) {
    const why = incomplete(c);
    if (why) {
      console.log(`SKIP  ${c.name ?? "(no name)"} — ${why}`);
      skipped++;
      continue;
    }
    const data = {
      name: c.name,
      nameNormalized: normalizeSearch(c.name),
      setCode: c.setCode,
      setName: c.setName,
      collectorNumber: c.collectorNumber,
      domain: c.domain,
      type: c.type,
      rarity: c.rarity,
      variant: c.variant ?? (c.collectorNumber.match(/^\d+([a-z]+)/i)?.[1]?.toLowerCase() ?? null),
      isPromo: c.isPromo ?? false,
      energyCost: c.energyCost ?? null,
      might: c.might ?? null,
      imageUrl: c.imageUrl ?? null,
      imageThumbUrl: c.imageThumbUrl ?? c.imageUrl ?? null,
    };
    const slug = cardSlug(c);
    const existing = await prisma.card.findFirst({ where: { setCode: c.setCode, collectorNumber: c.collectorNumber } });
    if (existing) {
      console.log(`${DRY ? "(dry) " : ""}UPDATE ${c.name} [${c.setCode} ${c.collectorNumber}]`);
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data: { ...data, slug: existing.slug ?? slug } });
      updated++;
    } else {
      console.log(`${DRY ? "(dry) " : ""}CREATE ${c.name} [${c.setCode} ${c.collectorNumber}] -> /card/${slug}`);
      if (!DRY) await prisma.card.create({ data: { ...data, slug, externalId: `manual-${c.setCode.toLowerCase()}-${c.collectorNumber.replace(/[^a-z0-9]/gi, "")}` } });
      created++;
    }
  }
  console.log(`\nManual cards: ${created} created, ${updated} updated, ${skipped} skipped${DRY ? " (dry run — no writes)" : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
