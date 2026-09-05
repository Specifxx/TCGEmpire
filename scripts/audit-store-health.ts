/**
 * Read-only CLI wrapper around checkStoreHealth() (lib/store-health.ts) — the
 * same computation /admin/store-health renders, without needing admin auth to
 * see it. Prints every currently-registered store that has ZERO RetailerPrice
 * rows at all (the "no-listings" alert — a store tracked in retailers.ts that
 * has never returned, or has stopped returning, any priced card), so a stale
 * entry can be identified and removed, plus every other open alert for context.
 *
 * Usage: npx tsx scripts/audit-store-health.ts
 */
import { checkStoreHealth } from "../src/lib/store-health";
import { prisma } from "../src/lib/db";

async function main() {
  const { rows, alerts } = await checkStoreHealth();
  const noListings = rows.filter((r) => r.alerts.some((a) => a.kind === "no-listings"));

  console.log(`Stores tracked: ${rows.length}`);
  console.log(`Stores with ZERO listings (candidates to remove): ${noListings.length}\n`);
  for (const r of noListings.sort((a, b) => a.retailerName.localeCompare(b.retailerName))) {
    console.log(`  ${r.retailer.padEnd(24)} ${r.retailerName.padEnd(35)} (${r.country})`);
  }

  const otherAlerts = alerts.filter((a) => a.kind !== "no-listings");
  console.log(`\nOther open alerts (${otherAlerts.length}, not "no-listings"):`);
  for (const a of otherAlerts) {
    console.log(`  ${a.retailer.padEnd(24)} ${a.country}  ${a.kind}: ${a.detail}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
