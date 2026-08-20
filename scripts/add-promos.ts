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
    // A promo of an alt-art printing ("193a") must look up its BASE card by the
    // bare number ("193") — the base's own collectorNumber never carries the
    // letter suffix. Without stripping it, every lettered promo (OGN-193a,
    // SFD-118a/178a/195a, UNL-082b/178a/178b confirmed missing this way) fell
    // through to "no base card" even though the underlying card obviously exists.
    const bareNum = pr.num.replace(/[a-z*]/gi, "");
    const base = await prisma.card.findFirst({
      where:
        runeDonorWhere(pr) ?? {
          setCode: pr.set,
          isPromo: false,
          variant: null,
          collectorNumber: { startsWith: `${bareNum}/` },
        },
    });
    if (!base) {
      noBase++;
      if (noBase <= 25) console.log(`  NO BASE: ${pr.set}-${pr.num}`);
      continue;
    }
    // Don't clone identity or per-printing state from the base:
    //  - slug is @unique → cloning it makes the insert throw; promos get their own
    //    ("-promo"-suffixed) slug.
    //  - lowest prices (ALL FIVE markets) belong to the base's listings, not this
    //    new printing — the importer fills them in once real promo listings match.
    //  - view/search counts and eBay state are per-printing popularity signals.
    //  - collectorNumber: the donor is matched by its BARE number (or, for runes,
    //    by name — see runeDonorWhere) — either way the donor's OWN number lacks
    //    the promo's distinguishing letter suffix ("193" not "193a"). Rebuilding
    //    it from pr.num keeps that suffix, so a lettered promo never collides
    //    (slug included) with its own base card or a sibling lettered promo.
    const { id, createdAt, slug, collectorNumber: donorNumber, ...rest } = base;
    const donorTotal = donorNumber.split("/")[1];
    const collectorNumber = runeDonorWhere(pr) ? pr.num.replace(/^r/i, "R") : `${pr.num}/${donorTotal}`;
    const ok = await prisma.card
      .create({
        data: {
          ...rest,
          collectorNumber,
          externalId,
          isPromo: true,
          slug: cardSlug({ name: base.name, setCode: base.setCode, collectorNumber, isPromo: true }),
          lowestPriceCents: null,
          lowestPriceCentsUs: null,
          lowestPriceCentsUk: null,
          lowestPriceCentsSg: null,
          lowestPriceCentsCa: null,
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
