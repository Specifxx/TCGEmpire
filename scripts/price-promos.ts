// Price PROMO cards from eBay AU (their main secondary market). Promos share the
// base card's collector number, so searchEbayLowest matches them by promo wording
// in the listing title (isPromo: true). This is a targeted pass that bypasses the
// main importer's once-daily eBay gate; it only touches eBay rows for promo cards.
// Run: npx tsx scripts/price-promos.ts
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { isEbayEnabled, isEbayRateLimited, searchEbayLowest } from "../src/lib/ebay";

async function main() {
  if (!isEbayEnabled()) {
    console.error("eBay not configured (EBAY_CLIENT_ID/SECRET). Aborting.");
    process.exit(1);
  }
  const promos = await prisma.card.findMany({
    where: { isPromo: true },
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    select: { id: true, name: true, setCode: true, collectorNumber: true },
  });
  console.log(`Searching eBay AU for ${promos.length} promo cards…`);

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  let searched = 0;
  for (const c of promos) {
    if (isEbayRateLimited()) { console.warn("Rate limited — stopping early."); break; }
    searched++;
    const [rawNum, total] = c.collectorNumber.split("/");
    const r = await searchEbayLowest({
      name: c.name,
      setCode: c.setCode,
      number: rawNum.replace(/\*/g, ""),
      total: total ?? "",
      isSignature: false,
      isPromo: true,
    });
    if (!r) continue;
    rows.push({
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
      country: "AU",
      inStock: true,
    });
  }
  console.log(`Found eBay prices for ${rows.length} / ${searched} promos searched.`);

  // Replace eBay rows for these promo cards only (don't disturb base eBay rows).
  const promoIds = promos.map((p) => p.id);
  await prisma.retailerPrice.deleteMany({ where: { retailer: "ebay", cardId: { in: promoIds } } });
  if (rows.length) await prisma.retailerPrice.createMany({ data: rows });

  // Recompute the AU lowest for promo cards (NZ untouched — eBay is AU-only).
  const priced = await prisma.retailerPrice.groupBy({
    by: ["cardId"],
    where: { inStock: true, country: "AU", cardId: { in: promoIds } },
    _min: { priceCents: true },
  });
  const low = new Map(priced.map((r) => [r.cardId, r._min.priceCents ?? null]));
  for (const id of promoIds) {
    await prisma.card.update({ where: { id }, data: { lowestPriceCents: low.get(id) ?? null } });
  }
  const nowPriced = [...low.values()].filter((v) => v != null).length;
  console.log(`Done. ${nowPriced} promo cards now have an AU price.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
