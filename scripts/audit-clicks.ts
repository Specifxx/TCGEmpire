// Read-only outbound-click leaderboard — real, self-recorded click counts per
// retailer (independent of any partner dashboard), used to prioritise which
// Shopify stores to approach first for a direct affiliate/referral deal. See
// lib/affiliate.ts's DIRECT_PROGRAMS note: eBay/Amazon/TCGplayer pay us directly
// already; every other (Shopify) store currently earns nothing until its own
// program is signed and registered there.
import { dbHistory } from "../src/lib/db-history";
import { RETAILERS } from "../src/lib/retailers";

async function main() {
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400_000);

  const [all30, allTime] = await Promise.all([
    dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true }, where: { createdAt: { gte: d30 } } }),
    dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true } }),
  ]);
  const allTimeMap = new Map(allTime.map((r) => [r.retailer, r._count._all]));

  const rows = all30
    .map((r) => ({
      retailer: r.retailer,
      name: RETAILERS[r.retailer]?.name ?? r.retailer,
      isShopifyStore: !!RETAILERS[r.retailer], // every entry in RETAILERS is a Shopify store (see retailers.ts)
      d30: r._count._all,
      allTime: allTimeMap.get(r.retailer) ?? r._count._all,
    }))
    .sort((a, b) => b.d30 - a.d30);

  console.log(`Outbound clicks, last 30 days — ${rows.length} distinct retailer keys.\n`);
  console.log("Rank  D30    AllTime  Shopify  Retailer");
  rows.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)}  ${String(r.d30).padStart(5)}  ${String(r.allTime).padStart(7)}  ${(r.isShopifyStore ? "yes" : "-").padEnd(7)}  ${r.name} (${r.retailer})`
    );
  });

  const shopifyRows = rows.filter((r) => r.isShopifyStore);
  const shopifyD30Total = shopifyRows.reduce((s, r) => s + r.d30, 0);
  const allD30Total = rows.reduce((s, r) => s + r.d30, 0);
  console.log(`\nShopify-store clicks: ${shopifyD30Total} of ${allD30Total} total (${((shopifyD30Total / (allD30Total || 1)) * 100).toFixed(1)}%) over the last 30 days.`);
  console.log(`Top 10 Shopify stores by D30 clicks (best affiliate-outreach targets):`);
  shopifyRows.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} — ${r.d30} clicks (30d), ${r.allTime} all-time`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => dbHistory.$disconnect());
