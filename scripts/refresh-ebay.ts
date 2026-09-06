// Refresh eBay AU (AUD) + US (USD) prices for every card, bypassing the importer's
// once-daily gate, then recompute the AU + US lowest-price columns.
// Use to seed US eBay data after adding US support. Run: npx tsx scripts/refresh-ebay.ts
import { prisma } from "../src/lib/db";
import { refreshEbayMarkets } from "../src/lib/price-import";
import { isEbayEnabled } from "../src/lib/ebay";

async function recompute(country: "AU" | "US") {
  const priced = await prisma.retailerPrice.groupBy({
    by: ["cardId"],
    where: { inStock: true, country },
    _min: { priceCents: true },
  });
  const low = new Map(priced.map((r) => [r.cardId, r._min.priceCents ?? null]));
  if (country === "AU") {
    await prisma.card.updateMany({ data: { lowestPriceCents: null } });
    for (const [id, v] of low) await prisma.card.update({ where: { id }, data: { lowestPriceCents: v } });
  } else {
    await prisma.card.updateMany({ data: { lowestPriceCentsUs: null } });
    for (const [id, v] of low) await prisma.card.update({ where: { id }, data: { lowestPriceCentsUs: v } });
  }
  console.log(`Recomputed ${country} lowest from ${low.size} cards with in-stock rows.`);
}

async function main() {
  if (!isEbayEnabled()) { console.error("eBay not configured (EBAY_CLIENT_ID/SECRET)."); process.exit(1); }
  const cards = await prisma.card.findMany({
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    select: { id: true, name: true, setCode: true, collectorNumber: true, isPromo: true },
  });
  const n = await refreshEbayMarkets(cards);
  console.log(`eBay rows written across AU+US: ${n}`);
  await recompute("AU");
  await recompute("US");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
