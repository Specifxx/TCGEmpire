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
// alerts, collection holdings and listings, so user data is never deleted with
// the card: a retired card that user rows point at is either MERGED into the
// printing it really was (`mergeInto`, which moves every row across first) or
// kept and reported. Never trade user data for catalogue tidiness. The old URL
// keeps working through lib/card-slug-renames.ts.
const RETIRED: { externalId: string; why: string; mergeInto?: string }[] = [
  // Empty since 2026-10-02. Its one entry retired the unsigned Seraphine
  // 174/167 and merged it into 174*/167 on the reading that Riot's gallery
  // showed only the signed card. Riot's image for RAD-174/167 is the UNSIGNED
  // printing, so the row is back in manual-cards.json under its original
  // externalId. Before adding an entry here, look at the card image Riot
  // serves for that number, not only at the number.
];

type DeckLine = { cardId: string; qty: number };

// Rows that would collide with one the same person already has on the target,
// under each table's unique key. Any clash stops the merge (see mergeInto): the
// fix would have to choose between two of someone's rows, and this script does
// not make that choice for them.
async function mergeClashes(from: string, to: string): Promise<string[]> {
  const clashes: string[] = [];
  const alerts = await prisma.priceAlert.findMany({ where: { cardId: from }, select: { email: true, market: true } });
  if (alerts.length) {
    const n = await prisma.priceAlert.count({ where: { cardId: to, OR: alerts.map((a) => ({ email: a.email, market: a.market })) } });
    if (n) clashes.push(`${n} price alert(s) already on the target for the same email and market`);
  }
  const holdings = await prisma.collectionCard.findMany({ where: { cardId: from }, select: { userId: true, condition: true, isFoil: true } });
  if (holdings.length) {
    const n = await prisma.collectionCard.count({ where: { cardId: to, OR: holdings.map((h) => ({ userId: h.userId, condition: h.condition, isFoil: h.isFoil })) } });
    if (n) clashes.push(`${n} collection holding(s) already on the target in the same condition and finish`);
  }
  const signups = await prisma.setReleaseAlert.findMany({ where: { scope: from }, select: { email: true, setCode: true } });
  if (signups.length) {
    const n = await prisma.setReleaseAlert.count({ where: { scope: to, OR: signups.map((s) => ({ email: s.email, setCode: s.setCode })) } });
    if (n) clashes.push(`${n} release-day signup(s) already scoped to the target`);
  }
  return clashes;
}

// Moves every user row from one card to another, then deletes the first, in one
// transaction: either all of it happens or none of it does. Counts only in the
// log, never an email or a user id (the log is a CI log).
async function mergeCard(from: { id: string; slug: string | null }, to: { id: string; slug: string | null }): Promise<void> {
  const decks = await prisma.publishedDeck.findMany({
    where: { OR: [{ cardIds: { has: from.id } }, { legendCardId: from.id }] },
    select: { id: true, cardIds: true, lines: true, legendCardId: true },
  });
  const counts = {
    alerts: await prisma.priceAlert.count({ where: { cardId: from.id } }),
    holdings: await prisma.collectionCard.count({ where: { cardId: from.id } }),
    listings: await prisma.listing.count({ where: { cardId: from.id } }),
    buyOrders: await prisma.buyOrder.count({ where: { cardId: from.id } }),
    marketListings: await prisma.marketplaceListing.count({ where: { cardId: from.id } }),
    reports: await prisma.priceReport.count({ where: { cardId: from.id } }),
    signups: await prisma.setReleaseAlert.count({ where: { scope: from.id } }),
    decks: decks.length,
  };
  const moved = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";
  console.log(`${DRY ? "(dry) " : ""}MERGE /card/${from.slug} -> /card/${to.slug}: moving ${moved}, then deleting the retired card`);
  if (DRY) return;
  await prisma.$transaction(
    async (tx) => {
      const move = { where: { cardId: from.id }, data: { cardId: to.id } };
      await tx.priceAlert.updateMany(move);
      await tx.collectionCard.updateMany(move);
      await tx.listing.updateMany(move);
      await tx.buyOrder.updateMany(move);
      await tx.marketplaceListing.updateMany(move);
      await tx.priceReport.updateMany(move);
      await tx.setReleaseAlert.updateMany({ where: { scope: from.id }, data: { scope: to.id } });
      for (const d of decks) {
        // A deck that already lists the target keeps one line for it, copies summed.
        const lines = new Map<string, number>();
        for (const l of (d.lines as unknown as DeckLine[]) ?? []) {
          const id = l.cardId === from.id ? to.id : l.cardId;
          lines.set(id, (lines.get(id) ?? 0) + l.qty);
        }
        await tx.publishedDeck.update({
          where: { id: d.id },
          data: {
            cardIds: [...new Set(d.cardIds.map((id) => (id === from.id ? to.id : id)))],
            lines: [...lines].map(([cardId, qty]) => ({ cardId, qty })),
            legendCardId: d.legendCardId === from.id ? to.id : d.legendCardId,
          },
        });
      }
      await tx.card.delete({ where: { id: from.id } });
    },
    { timeout: 30_000 },
  );
}

async function retire(): Promise<void> {
  for (const r of RETIRED) {
    const card = await prisma.card.findUnique({ where: { externalId: r.externalId }, select: { id: true, slug: true } });
    if (!card) continue;
    const where = { cardId: card.id };
    // Plus the ones that hold a card id without a relation, so they would be
    // left pointing at nothing: price reports, published decks (ids and Legend)
    // and card-scoped release-day signups.
    const [alerts, holdings, listings, buyOrders, marketListings, reports, decks, signups] = await Promise.all([
      prisma.priceAlert.count({ where }),
      prisma.collectionCard.count({ where }),
      prisma.listing.count({ where }),
      prisma.buyOrder.count({ where }),
      prisma.marketplaceListing.count({ where }),
      prisma.priceReport.count({ where }),
      prisma.publishedDeck.count({ where: { OR: [{ cardIds: { has: card.id } }, { legendCardId: card.id }] } }),
      prisma.setReleaseAlert.count({ where: { scope: card.id } }),
    ]);
    const userRows = alerts + holdings + listings + buyOrders + marketListings + reports + decks + signups;
    if (userRows > 0) {
      const target = r.mergeInto
        ? await prisma.card.findUnique({ where: { externalId: r.mergeInto }, select: { id: true, slug: true } })
        : null;
      if (!target) {
        console.log(`KEEP  /card/${card.slug} — ${r.why}, but ${userRows} user row(s) point at it; not deleted`);
        continue;
      }
      const clashes = await mergeClashes(card.id, target.id);
      if (clashes.length) {
        console.log(`KEEP  /card/${card.slug} — not merged into /card/${target.slug}: ${clashes.join("; ")}`);
        continue;
      }
      await mergeCard(card, target);
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
