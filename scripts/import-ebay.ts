/**
 * Focused eBay-only price import: adds/refreshes "eBay" RetailerPrice rows for
 * every card without touching the Shopify store data, then recomputes each card's
 * lowest price. Use this to enable/refresh eBay independently.
 *
 * Usage: npx tsx scripts/import-ebay.ts   (requires EBAY_CLIENT_ID/SECRET in env)
 */
import { PrismaClient } from "@prisma/client";
import { isEbayEnabled, isEbayRateLimited, searchEbayLowest } from "../src/lib/ebay";

const prisma = new PrismaClient();

async function main() {
  if (!isEbayEnabled()) {
    console.log("eBay keys not set — aborting.");
    return;
  }
  const cards = await prisma.card.findMany({
    where: { isPromo: false },
    select: { id: true, name: true, setCode: true, collectorNumber: true },
  });
  console.log(`Querying eBay for ${cards.length} cards…`);

  // Buffer results, then replace in one shot. If we got nothing (rate-limited /
  // 429), DON'T delete existing eBay prices — a throttled run must not wipe data.
  const ebayRows: any[] = [];
  let done = 0;
  for (const c of cards) {
    if (isEbayRateLimited()) { console.warn("eBay rate-limited (429) — aborting eBay pass."); break; }
    const [rawNum, total] = c.collectorNumber.split("/");
    try {
      const r = await searchEbayLowest({
        name: c.name,
        setCode: c.setCode,
        number: rawNum.replace(/\*/g, ""),
        total: total ?? "",
        isSignature: c.collectorNumber.includes("*"),
      });
      if (r) {
        ebayRows.push({
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
        });
      }
    } catch {
      // skip on error
    }
    done++;
    if (done % 100 === 0) console.log(`  …${done}/${cards.length} checked, ${ebayRows.length} eBay prices`);
  }
  if (ebayRows.length === 0) {
    console.warn("eBay returned 0 results (rate-limited?) — keeping existing eBay prices, aborting.");
    return;
  }
  await prisma.retailerPrice.deleteMany({ where: { retailer: "ebay" } });
  await prisma.retailerPrice.createMany({ data: ebayRows });
  const count = ebayRows.length;
  console.log(`Created ${count} eBay prices.`);

  // Recompute each card's lowest live price including eBay. Reset all first so a
  // card that lost its only price (e.g. a removed bad eBay match) goes back to null.
  await prisma.card.updateMany({ data: { lowestPriceCents: null } });
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
