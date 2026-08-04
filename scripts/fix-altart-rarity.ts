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

  // ── Chase prints that still sit in a base rarity tier ──────────────────────
  // Reported live: filtering /browse by "Rare" returned a wall of A$165–172
  // Vendetta chase cards (Ambessa 196/166, Swain 173/166, Draven 172/166,
  // Leona 184/166). The filter was right — the DATA said they were Rare.
  //
  // A cross-set census (scripts/audit-rarity.ts, run against production
  // 2026-08-03) showed this is a VENDETTA-ONLY gap, and that every other set
  // already follows the convention this enforces:
  //
  //   set   ALT-ART        SIG                    OVERNUM
  //   OGN   Showcase:39    Showcase:12            Showcase:12
  //   SFD   Showcase:36    Showcase:12            Showcase:30
  //   UNL   Showcase:42    Showcase:12            Showcase:19
  //   VEN   Showcase:18    Rare:1  Showcase:8     Rare:24  Epic:7   ← outlier
  //
  // VEN's overnumbered/signature prints came from the official gallery
  // (import-vendetta.ts), which labels a re-print by the rarity of the card it
  // re-prints, so they were stored faithfully — and then landed in the base
  // tiers. Every other set's chase prints were already Showcase.
  //
  // The BASE prints are fine and are deliberately untouched: VEN's base
  // distribution (31/26/25/18% C/U/R/E) matches OGN (30/28/28/14), SFD
  // (27/28/27/17) and UNL (31/27/26/16) almost exactly.
  //
  // PROMOS ARE EXCLUDED, matching the alt-art rule above: they carry their own
  // PROMO badge and their own filter, and every set keeps them in base tiers.
  //
  // Runs after the backfill above so `isOvernumbered` is accurate. Idempotent.
  const chase = await prisma.card.updateMany({
    where: {
      isPromo: false,
      rarity: { not: "Showcase" },
      OR: [
        { isOvernumbered: true },
        { collectorNumber: { contains: "*" } }, // Signature prints
      ],
    },
    data: { rarity: "Showcase" },
  });
  console.log(`Chase-print rarity fix: reclassified ${chase.count} overnumbered/signature print(s) to Showcase.`);
}

main()
  .catch((e) => console.error("Alt-art rarity fix failed (non-fatal):", e?.message ?? e))
  .finally(() => prisma.$disconnect());
