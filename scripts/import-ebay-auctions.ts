// Sweep live eBay auctions for every market into EbayAuctionListing — the data
// behind /auctions. Run: npx tsx scripts/import-ebay-auctions.ts
//
// Costs ~6-12 eBay Browse calls per sweep (one or two pages per market, and
// pagination stops on a short page). See the quota arithmetic in
// src/lib/ebay-auctions.ts; refreshAuctions primes the shared budget first, so
// this can never eat into what the price importer needs.
import { prisma } from "../src/lib/db";
import { isEbayEnabled } from "../src/lib/ebay";
import { refreshAuctions } from "../src/lib/ebay-auctions";

async function main() {
  if (!isEbayEnabled()) {
    console.error("eBay not configured (EBAY_CLIENT_ID/SECRET).");
    process.exit(1);
  }
  const summaries = await refreshAuctions();
  const live = summaries.reduce((n, s) => n + s.found, 0);
  const failed = summaries.filter((s) => !s.ok).map((s) => s.market);
  console.log(`Live auctions across ${summaries.length} markets: ${live}`);
  if (failed.length) {
    // A market that gave no answer keeps whatever rows it already had — worth
    // saying out loud, since "0 found" and "never asked" look identical in a
    // row count.
    console.log(`No answer from: ${failed.join(", ")} (their existing rows were left alone)`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
