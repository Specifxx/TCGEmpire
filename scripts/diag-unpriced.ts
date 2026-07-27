/**
 * TEMPORARY diagnostic — not wired into CI. Quantifies how many card pages
 * currently have zero price data (would render the generic "tracking down
 * store listings" boilerplate with no real comparison value) vs how many are
 * genuinely priced, to size the AdSense thin-content fix correctly.
 *
 * Usage: npx tsx scripts/diag-unpriced.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const total = await prisma.card.count();
  const unpriced = await prisma.card.count({
    where: {
      lowestPriceCents: null,
      lowestPriceCentsNz: null,
      lowestPriceCentsUs: null,
      lowestPriceCentsUk: null,
    },
  });
  console.log(`Total cards: ${total}`);
  console.log(`Unpriced (no price in ANY market): ${unpriced} (${((unpriced / total) * 100).toFixed(1)}%)`);

  const bySet = await prisma.card.groupBy({
    by: ["setCode"],
    where: {
      lowestPriceCents: null,
      lowestPriceCentsNz: null,
      lowestPriceCentsUs: null,
      lowestPriceCentsUk: null,
    },
    _count: true,
  });
  console.log("Unpriced by set:");
  for (const b of bySet.sort((a, b) => b._count - a._count)) console.log(`  ${b.setCode}: ${b._count}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
