// Run only the sealed-product import (booster boxes/packs/etc.) across all AU
// stores. Useful after changing sealed matching without re-scraping all singles.
// Run: npx tsx scripts/import-sealed-only.ts
import { importSealed } from "../src/lib/sealed-import";
import { prisma } from "../src/lib/db";

importSealed()
  .then((n) => console.log(`Sealed import done: ${n} listings.`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
