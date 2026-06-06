// Post-import check: confirm NZ pricing populated correctly and AU is intact.
// Run: npx tsx scripts/validate-nz.ts
import { prisma } from "../src/lib/db";

async function main() {
  const [auCards, nzCards, auRows, nzRows, ebayRows, nzEbay, nzStores] = await Promise.all([
    prisma.card.count({ where: { lowestPriceCents: { not: null } } }),
    prisma.card.count({ where: { lowestPriceCentsNz: { not: null } } }),
    prisma.retailerPrice.count({ where: { country: "AU" } }),
    prisma.retailerPrice.count({ where: { country: "NZ" } }),
    prisma.retailerPrice.count({ where: { retailer: "ebay" } }),
    prisma.retailerPrice.count({ where: { retailer: "ebay", country: "NZ" } }),
    prisma.retailerPrice.groupBy({ by: ["retailer"], where: { country: "NZ" }, _count: true }),
  ]);

  console.log(`Cards priced — AU: ${auCards}, NZ: ${nzCards}`);
  console.log(`RetailerPrice rows — AU: ${auRows}, NZ: ${nzRows}, eBay total: ${ebayRows} (eBay in NZ: ${nzEbay} — must be 0)`);
  console.log(`\nNZ stores contributing rows:`);
  for (const s of nzStores.sort((a, b) => (b._count as number) - (a._count as number))) {
    console.log(`  ${s.retailer.padEnd(16)} ${s._count}`);
  }

  // Sample cards that have BOTH prices, to eyeball AU vs NZ.
  const sample = await prisma.card.findMany({
    where: { lowestPriceCents: { not: null }, lowestPriceCentsNz: { not: null } },
    select: { name: true, setCode: true, collectorNumber: true, lowestPriceCents: true, lowestPriceCentsNz: true },
    orderBy: { lowestPriceCentsNz: "desc" },
    take: 10,
  });
  console.log(`\nSample (both markets priced), by NZ price desc:`);
  for (const c of sample) {
    const au = `$${((c.lowestPriceCents ?? 0) / 100).toFixed(2)}`;
    const nz = `$${((c.lowestPriceCentsNz ?? 0) / 100).toFixed(2)}`;
    console.log(`  ${c.name.padEnd(28)} ${c.setCode} ${c.collectorNumber.padEnd(9)} AU ${au.padStart(10)}  NZ ${nz.padStart(10)}`);
  }

  // Sealed by country.
  const [sealedAu, sealedNz] = await Promise.all([
    prisma.sealedListing.count({ where: { country: "AU" } }),
    prisma.sealedListing.count({ where: { country: "NZ" } }),
  ]);
  console.log(`\nSealed listings — AU: ${sealedAu}, NZ: ${sealedNz}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
