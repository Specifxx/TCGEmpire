/**
 * Import live Riftbound single prices from Australian retailers into RetailerPrice.
 *
 * Reads public Shopify products.json feeds (catalogue data only), matches each
 * product to a card, and stores the cheapest price per store. Configure stores +
 * shipping in src/lib/retailers.ts. Matching logic lives in src/lib/price-import.ts.
 *
 * Usage: npx tsx scripts/import-prices.ts
 */
import { importPrices } from "../src/lib/price-import";
import { prisma } from "../src/lib/db";

async function main() {
  const s = await importPrices();
  for (const st of s.stores) {
    console.log(`  ${st.name}: ${st.products} products → ${st.priced} cards priced, ${st.matched} matched, ${st.unmatched} unmatched`);
  }
  console.log(`Done. ${s.totalMatched} matched, ${s.totalUnmatched} unmatched. ${s.cardsPriced} cards now have prices.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
