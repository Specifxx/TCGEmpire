/**
 * Consolidate SealedPriceHistory into the LIVE history project (2026-09-24).
 *
 * WHY: every history cutover (RH6 → … → HISTORY_DATABASE_URL_3) dumped only
 * Card, ClickEvent and PriceHistory, so SealedPriceHistory was left behind each
 * time. The weekly writer then saw an empty table on the new project and wrote
 * one snapshot — and with a rotation every 2-5 days, no project ever reached a
 * second point. audit-sealed-history showed it: nine projects, ONE snapshot day
 * each (09-02, 03, 05, 07, 09, 11, 12, 17, 22). Rising Sealed needs five per
 * product, so it said "Signals are still building" for weeks. The data existed;
 * it was scattered one point per database.
 *
 * WHAT: reads SealedPriceHistory from every reachable history project and
 * inserts it into the live one (lib/db-history.ts's), skipping duplicates on
 * the (groupKey, country, day) unique key. Additive and idempotent: running it
 * twice changes nothing, and it never deletes. ~3,500 rows in total — a
 * negligible transfer. Honours DRY_RUN=1.
 *
 *   npx tsx scripts/consolidate-sealed-history.ts
 */
import { PrismaClient } from "@prisma/client";
import { dbHistory, HISTORY_URL_SOURCE } from "../src/lib/db-history";

const SOURCES = ["HISTORY_DATABASE_URL_2", "HISTORY_DATABASE_URL", "HISTORY_DATABASE_URL_4", "RH11", "RH10", "RH9", "RH8", "RH7", "RH6", "RH5"];
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function main() {
  console.log(`Target (live history project): ${HISTORY_URL_SOURCE}${DRY ? "  — DRY RUN, nothing is written" : ""}`);
  const before = await dbHistory.sealedPriceHistory.count();
  let offered = 0;
  for (const name of SOURCES) {
    const url = process.env[name];
    if (!url || name === HISTORY_URL_SOURCE) continue;
    const src = new PrismaClient({ datasources: { db: { url } } });
    try {
      const rows = await src.sealedPriceHistory.findMany({
        select: { groupKey: true, country: true, day: true, lowestPriceCents: true },
      });
      offered += rows.length;
      const days = [...new Set(rows.map((r) => r.day.toISOString().slice(0, 10)))].sort();
      console.log(`${name}: ${rows.length} rows on ${days.join(", ") || "no days"}`);
      if (!DRY && rows.length) {
        const res = await dbHistory.sealedPriceHistory.createMany({ data: rows, skipDuplicates: true });
        console.log(`   inserted ${res.count} (rest already present)`);
      }
    } catch (e) {
      console.log(`${name}: unreadable, skipped (${(e as Error).message.split("\n")[0]})`);
    } finally {
      await src.$disconnect();
    }
  }
  const after = await dbHistory.sealedPriceHistory.count();
  const days = await dbHistory.sealedPriceHistory.findMany({ distinct: ["day"], select: { day: true }, orderBy: { day: "asc" } });
  console.log(`\nLive SealedPriceHistory: ${before} → ${after} rows (${offered} offered), ${days.length} snapshot days: ${days.map((d) => d.day.toISOString().slice(0, 10)).join(", ")}`);
  await dbHistory.$disconnect();
}

void main();
