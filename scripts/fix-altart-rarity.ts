// Idempotent data fix, run on every production deploy (see package.json build).
// Alt-art ("variant") prints cloned from a base card by add-tcg-printings.ts
// inherited the base's rarity (e.g. "Rare"), so they cluttered that rarity filter
// with the base art. Alt-arts are a Showcase-tier treatment — reclassify them so
// they group with the genuine showcase alt-arts and leave the Rare filter clean.
// Promos are untouched (they carry their own PROMO badge and their own filter).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const res = await prisma.card.updateMany({
    where: { variant: { not: null }, isPromo: false, rarity: { not: "Showcase" } },
    data: { rarity: "Showcase" },
  });
  console.log(`Alt-art rarity fix: reclassified ${res.count} alt-art print(s) to Showcase.`);

  // Backfill the denormalised overnumbered flag (numerator > denominator, "*"
  // signatures excluded — mirrors isOvernumbered() in lib/constants). Idempotent;
  // covers rows created before the importers wrote the flag.
  const over = await prisma.$executeRaw`
    UPDATE "Card" SET "isOvernumbered" = true
    WHERE "isOvernumbered" = false
      AND position('*' in "collectorNumber") = 0
      AND split_part("collectorNumber", '/', 1) ~ '^[0-9]+[a-zA-Z]?$'
      AND split_part("collectorNumber", '/', 2) ~ '^[0-9]+$'
      AND (regexp_replace(split_part("collectorNumber", '/', 1), '[^0-9]', '', 'g'))::int
          > (split_part("collectorNumber", '/', 2))::int`;
  console.log(`Overnumbered backfill: flagged ${over} card(s).`);
}

main()
  .catch((e) => console.error("Alt-art rarity fix failed (non-fatal):", e?.message ?? e))
  .finally(() => prisma.$disconnect());
