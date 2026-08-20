// Refresh the sealed-products table (booster boxes, packs, Nexus Night packs, …).
// Pulls the AU Shopify store feeds + eBay AU (importSealed) AND the US TCGplayer
// sealed catalogue (refreshTcgplayerSealed). Run on the price-refresh schedule so the
// /sealed page stays populated — previously nothing scheduled the sealed importer, so
// the table went stale/empty and the page showed nothing.
import { importSealed, refreshTcgplayerSealed } from "../src/lib/sealed-import";
import { prisma } from "../src/lib/db";

async function main() {
  const n = await importSealed();
  console.log(`Sealed import (stores + eBay AU) done — ${n} listings.`);
  // TCGplayer US catalogue is best-effort: a failure here must not lose the store/eBay
  // rows we already wrote.
  try {
    const t = await refreshTcgplayerSealed();
    console.log(`Sealed import (TCGplayer US) done — ${t} listings.`);
  } catch (e) {
    console.error("TCGplayer sealed refresh failed (continuing):", e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
