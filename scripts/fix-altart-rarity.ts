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
}

main()
  .catch((e) => console.error("Alt-art rarity fix failed (non-fatal):", e?.message ?? e))
  .finally(() => prisma.$disconnect());
