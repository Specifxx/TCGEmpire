/**
 * Focused eBay-only price import: adds/refreshes "eBay" RetailerPrice rows for
 * every card without touching the Shopify store data, then recomputes each card's
 * lowest price. Use this to enable/refresh eBay independently.
 *
 * Usage: npx tsx scripts/import-ebay.ts   (requires EBAY_CLIENT_ID/SECRET in env)
 */
import { PrismaClient } from "@prisma/client";
import { isEbayEnabled, searchEbayLowest } from "../src/lib/ebay";

const prisma = new PrismaClient();

async function main() {
  if (!isEbayEnabled()) {
    console.log("eBay keys not set — aborting.");
    return;
  }
  await prisma.retailerPrice.deleteMany({ where: { retailer: "ebay" } });

  const cards = await prisma.card.findMany({
    select: { id: true, name: true, setCode: true, collectorNumber: true },
  });
  console.log(`Querying eBay for ${cards.length} cards…`);

  let count = 0;
  let done = 0;
  for (const c of cards) {
    const num = c.collectorNumber.split("/")[0].replace(/\*/g, "");
    try {
      const r = await searchEbayLowest({ name: c.name, setCode: c.setCode, number: num });
      if (r) {
        await prisma.retailerPrice.create({
          data: {
            cardId: c.id,
            retailer: "ebay",
            retailerName: "eBay",
            title: r.title,
            url: r.url,
            condition: r.condition ?? null,
            isFoil: /foil/i.test(r.title),
            priceCents: r.priceCents,
            shippingCents: r.shippingCents,
            currency: "AUD",
            inStock: true,
          },
        });
        count++;
      }
    } catch {
      // skip on error
    }
    done++;
    if (done % 100 === 0) console.log(`  …${done}/${cards.length} checked, ${count} eBay prices`);
  }
  console.log(`Created ${count} eBay prices.`);

  // Recompute each card's lowest live price including eBay.
  const priced = await prisma.retailerPrice.groupBy({ by: ["cardId"], _min: { priceCents: true } });
  for (const row of priced) {
    const inStockMin = await prisma.retailerPrice.aggregate({
      where: { cardId: row.cardId, inStock: true },
      _min: { priceCents: true },
    });
    await prisma.card.update({
      where: { id: row.cardId },
      data: { lowestPriceCents: inStockMin._min.priceCents ?? row._min.priceCents ?? null },
    });
  }
  console.log("Recomputed lowest prices. eBay is live.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
