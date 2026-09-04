// Refresh the sealed-products table (booster boxes, packs, Nexus Night packs, …).
// Pulls the AU Shopify store feeds + eBay AU (importSealed), the US TCGplayer
// sealed catalogue (refreshTcgplayerSealed), and Cardmarket's EU sealed catalogue
// (refreshCardmarketSealed). Run on the price-refresh schedule so the /sealed
// page stays populated — previously nothing scheduled the sealed importer, so
// the table went stale/empty and the page showed nothing.
import { importSealed, refreshTcgplayerSealed, writeSealedPriceHistory } from "../src/lib/sealed-import";
import { refreshCardmarketSealed } from "../src/lib/cardmarket";
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
  // Cardmarket EU catalogue — also best-effort, same reasoning.
  try {
    const c = await refreshCardmarketSealed();
    console.log(`Sealed import (Cardmarket EU) done — ${c.written} listings${c.skipped ? ` (skipped: ${c.reason})` : ""}.`);
  } catch (e) {
    console.error("Cardmarket sealed refresh failed (continuing):", e);
  }
  // Runs LAST, after every source above has had its chance to write — feeds
  // the Sealed Index and Rising Sealed. Best-effort internally (see its own
  // try/catch), so a history-write hiccup never loses the listings this run
  // already wrote.
  await writeSealedPriceHistory();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
