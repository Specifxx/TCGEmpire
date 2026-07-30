/**
 * Additively add/refresh cards our source (RiftScribe) genuinely lacks — e.g. TCGplayer
 * Organized-Play / promotional printings. Reads prisma/manual-cards.json and UPSERTS
 * each entry. PROD-SAFE: never wipes, never touches cards not listed. Idempotent.
 *
 * Matching (so a promo never clobbers its base card):
 *   - by `externalId` when provided (recommended for promos), else
 *   - by setCode + collectorNumber + isPromo.
 * Entries with any FILL_ME placeholder are skipped (nothing fabricated is inserted).
 *
 * Usage:  npx tsx scripts/add-manual-cards.ts   (DRY_RUN=1 to preview)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardSlug } from "../src/lib/card-url";
import { normalizeSearch } from "../src/lib/format";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1";

type ManualCard = {
  externalId?: string; // stable unique key (recommended for promos), e.g. "promo-ogn-151-lee-sin-op"
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  domain: string;
  type: string;
  rarity: string;
  variant?: string | null;
  isPromo?: boolean;
  energyCost?: number | null;
  might?: number | null;
  description?: string | null;
  imageUrl?: string | null;
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

async function uniqueSlug(base: string, externalId: string): Promise<string> {
  const clash = await prisma.card.findUnique({ where: { slug: base }, select: { externalId: true } });
  if (!clash || clash.externalId === externalId) return base;
  return `${base}-${externalId.replace(/[^a-z0-9]/gi, "").slice(-5)}`;
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
    if (why) { console.log(`SKIP  ${c.name ?? "(no name)"} — ${why}`); skipped++; continue; }

    const isPromo = c.isPromo ?? false;
    const externalId = c.externalId ?? `manual-${c.setCode.toLowerCase()}-${c.collectorNumber.replace(/[^a-z0-9]/gi, "")}${isPromo ? "-promo" : ""}`;
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
      isPromo,
      energyCost: c.energyCost ?? null,
      might: c.might ?? null,
      description: c.description ?? null,
      imageUrl: c.imageUrl ?? null,
      imageThumbUrl: c.imageThumbUrl ?? c.imageUrl ?? null,
    };

    const existing = c.externalId
      ? await prisma.card.findUnique({ where: { externalId: c.externalId }, select: { id: true, slug: true } })
      : await prisma.card.findFirst({ where: { setCode: c.setCode, collectorNumber: c.collectorNumber, isPromo }, select: { id: true, slug: true } });

    if (existing) {
      console.log(`${DRY ? "(dry) " : ""}UPDATE ${c.name} [${c.setCode} ${c.collectorNumber}${isPromo ? " promo" : ""}]`);
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data: { ...data, slug: existing.slug ?? (await uniqueSlug(cardSlug({ ...data }), externalId)) } });
      updated++;
    } else {
      const slug = await uniqueSlug(cardSlug({ name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, isPromo }), externalId);
      console.log(`${DRY ? "(dry) " : ""}CREATE ${c.name} [${c.setCode} ${c.collectorNumber}${isPromo ? " promo" : ""}] -> /card/${slug}`);
      if (!DRY) await prisma.card.create({ data: { ...data, slug, externalId, marketPriceCents: 0, artSeed: Math.floor(Math.random() * 1_000_000) } });
      created++;
    }
  }
  console.log(`\nManual cards: ${created} created, ${updated} updated, ${skipped} skipped${DRY ? " (dry run — no writes)" : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
