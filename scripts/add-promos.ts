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

// Rune promos are numbered "R01".."R06" (optionally with a Showcase-style letter
// suffix, e.g. "R06b") — but that number has NO "/NNN" denominator, so the normal
// slash-based lookup below can never match it (this is why every promo rune,
// R06b P included, always fell through to "no base card"). This R01-R06 -> domain
// mapping is fixed and consistent across every set (confirmed from the game's own
// rune numbering); it resolves straight to that set's BASE rune card — promos
// share the base card's art regardless (see the file header), so the letter
// suffix on the promo's own number doesn't matter for donor selection.
const RUNE_DOMAIN: Record<string, string> = {
  "01": "Fury", "02": "Calm", "03": "Mind", "04": "Body", "05": "Chaos", "06": "Order",
};
function runeDonorWhere(pr: { set: string; num: string }) {
  const m = pr.num.match(/^r(\d{2})[a-z]?$/i);
  const domain = m ? RUNE_DOMAIN[m[1]] : undefined;
  return domain ? { setCode: pr.set, isPromo: false, variant: null, name: `${domain} Rune` } : null;
}

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
      where:
        runeDonorWhere(pr) ?? {
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
    //  - collectorNumber: a rune promo's donor is matched by NAME (see
    //    runeDonorWhere), not by number, so the donor's own number ("R06", say)
    //    would otherwise leak onto every one of its promo siblings and collide on
    //    slug — use pr.num itself (normalized to the DB's "R06b" capitalisation,
    //    matching every other bare rune number already stored). Regular numbered
    //    promos already had a number-matched donor, so this is a no-op for them.
    const { id, createdAt, slug, collectorNumber: donorNumber, ...rest } = base;
    const collectorNumber = runeDonorWhere(pr) ? pr.num.replace(/^r/i, "R") : donorNumber;
    const ok = await prisma.card
      .create({
        data: {
          ...rest,
          collectorNumber,
          externalId,
          isPromo: true,
          slug: cardSlug({ name: base.name, setCode: base.setCode, collectorNumber, isPromo: true }),
          lowestPriceCents: null,
          lowestPriceCentsNz: null,
          lowestPriceCentsUs: null,
          lowestPriceCentsUk: null,
          viewCount: 0,
          searchCount: 0,
          lastViewedAt: null,
          ebayCheckedAt: null,
        },
      })
      .then(() => true)
      .catch((e) => { console.warn("create failed", externalId, e.message); return false; });
    if (ok) created++;
  }
  console.log(`Promos: created ${created}, skipped ${skipped} (existed), ${noBase} had no base card.`);
  const total = await prisma.card.count({ where: { isPromo: true } });
  console.log(`Total promo cards now: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
