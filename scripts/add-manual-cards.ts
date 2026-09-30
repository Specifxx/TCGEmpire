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
import { currentSlug } from "../src/lib/card-slug-renames";
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

// Printings this file once catalogued that Riot's own sources show do not
// exist. Removing a row from manual-cards.json leaves it in the database, so
// it is retired here. Every relation on Card cascades, including users' price
// alerts, collection holdings and listings, so a card that any of those point
// at is kept and reported rather than deleted: never trade user data for
// catalogue tidiness. The old URL keeps working through lib/card-slug-renames.ts.
const RETIRED: { externalId: string; why: string }[] = [
  {
    externalId: "spoiler-rad-174-seraphine-starry-eyed-songstress",
    why: "Riot's gallery lists one printing at 174, the signed 174*/167 (2026-09-30)",
  },
];

async function retire(): Promise<void> {
  for (const r of RETIRED) {
    const card = await prisma.card.findUnique({ where: { externalId: r.externalId }, select: { id: true, slug: true } });
    if (!card) continue;
    const where = { cardId: card.id };
    // Plus the two that hold a card id without a relation, so they would be
    // left pointing at nothing: price reports and published decks.
    const [alerts, holdings, listings, buyOrders, marketListings, reports, decks] = await Promise.all([
      prisma.priceAlert.count({ where }),
      prisma.collectionCard.count({ where }),
      prisma.listing.count({ where }),
      prisma.buyOrder.count({ where }),
      prisma.marketplaceListing.count({ where }),
      prisma.priceReport.count({ where }),
      prisma.publishedDeck.count({ where: { cardIds: { has: card.id } } }),
    ]);
    const userRows = alerts + holdings + listings + buyOrders + marketListings + reports + decks;
    if (userRows > 0) {
      console.log(`KEEP  /card/${card.slug} — ${r.why}, but ${userRows} user row(s) point at it; not deleted`);
      continue;
    }
    console.log(`${DRY ? "(dry) " : ""}RETIRE /card/${card.slug} — ${r.why}`);
    if (!DRY) await prisma.card.delete({ where: { id: card.id } });
  }
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
      // Battlefields are the only landscape cards (the same rule import-set-cards.ts
      // applies). Without it CardImage frames Rakelstake, the first hand-added
      // Battlefield (RAD 165/167, 2026-09-29), as a portrait card.
      ...(c.type === "Battlefield" ? { orientation: "landscape" } : {}),
    };

    const existing = c.externalId
      ? await prisma.card.findUnique({ where: { externalId: c.externalId }, select: { id: true, slug: true } })
      : await prisma.card.findFirst({ where: { setCode: c.setCode, collectorNumber: c.collectorNumber, isPromo }, select: { id: true, slug: true } });

    if (existing) {
      console.log(`${DRY ? "(dry) " : ""}UPDATE ${c.name} [${c.setCode} ${c.collectorNumber}${isPromo ? " promo" : ""}]`);
      // A slug moves only through lib/card-slug-renames.ts, which also keeps the
      // old URL working (a correction to a row's collector number, e.g. Ntofo
      // Strikes 146 -> 148 on 2026-09-30). Otherwise the live slug is kept.
      const slug = existing.slug ? currentSlug(existing.slug) : await uniqueSlug(cardSlug({ ...data }), externalId);
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data: { ...data, slug } });
      updated++;
    } else {
      const slug = await uniqueSlug(cardSlug({ name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, isPromo }), externalId);
      console.log(`${DRY ? "(dry) " : ""}CREATE ${c.name} [${c.setCode} ${c.collectorNumber}${isPromo ? " promo" : ""}] -> /card/${slug}`);
      if (!DRY) await prisma.card.create({ data: { ...data, slug, externalId, marketPriceCents: 0, artSeed: Math.floor(Math.random() * 1_000_000) } });
      created++;
    }
  }
  await retire();
  console.log(`\nManual cards: ${created} created, ${updated} updated, ${skipped} skipped${DRY ? " (dry run — no writes)" : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
