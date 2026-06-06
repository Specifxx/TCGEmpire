// Refresh ONLY the sealed-products table (booster boxes, packs, Nexus Night packs,
// …) without re-running the full singles import. Uses the live store feeds + eBay.
import { importSealed } from "../src/lib/sealed-import";

(async () => {
  const n = await importSealed();
  console.log(`Sealed import done — ${n} listings.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
