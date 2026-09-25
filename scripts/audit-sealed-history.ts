/**
 * READ-ONLY: why is Rising Sealed still "building"? (2026-09-24)
 *
 * Rising Sealed scores a product only once it has MIN_POINTS weekly snapshots
 * in SealedPriceHistory (the predictor and /tools/rising-sealed were retired on
 * 2026-09-25; the table is still written, for a future per-product chart once
 * there are enough weekly points). This reports, for the
 * live history project AND every other history project still reachable:
 * row counts, distinct snapshot days, per-market series depth, and how many of
 * the stored groupKeys still match a live SealedListing groupKey — a series
 * whose key no longer exists can never qualify, however long it is.
 *
 *   npx tsx scripts/audit-sealed-history.ts
 */
import { PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { HISTORY_URL_SOURCE } from "../src/lib/db-history";

const HISTORY_NAMES = ["HISTORY_DATABASE_URL_3", "HISTORY_DATABASE_URL_2", "HISTORY_DATABASE_URL_4", "HISTORY_DATABASE_URL", "RH11", "RH10", "RH9", "RH8", "RH7", "RH6"];

async function main() {
  const live = await prisma.sealedListing.groupBy({ by: ["groupKey", "country"], where: { inStock: true } });
  const liveKeys = new Set(live.map((r) => `${r.country}\u0000${r.groupKey}`));
  console.log(`Live in-stock SealedListing groups (market×groupKey): ${liveKeys.size}`);
  console.log(`History source the app reads: ${HISTORY_URL_SOURCE}\n`);

  for (const name of HISTORY_NAMES) {
    const url = process.env[name];
    if (!url) continue;
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
      const rows = await db.sealedPriceHistory.findMany({ select: { groupKey: true, country: true, day: true } });
      const days = [...new Set(rows.map((r) => r.day.toISOString().slice(0, 10)))].sort();
      console.log(`── ${name}${name === HISTORY_URL_SOURCE ? "  (LIVE)" : ""}: ${rows.length} rows, ${days.length} snapshot days${days.length ? ` (${days[0]} … ${days[days.length - 1]})` : ""}`);
      if (days.length) console.log(`   days: ${days.join(", ")}`);
      const series = new Map<string, number>();
      for (const r of rows) series.set(`${r.country}\u0000${r.groupKey}`, (series.get(`${r.country}\u0000${r.groupKey}`) ?? 0) + 1);
      const byMarket = new Map<string, number[]>();
      let matching = 0;
      for (const [k, n] of series) {
        const m = k.split("\u0000")[0];
        (byMarket.get(m) ?? byMarket.set(m, []).get(m)!).push(n);
        if (liveKeys.has(k)) matching++;
      }
      for (const [m, ns] of [...byMarket].sort()) {
        ns.sort((a, b) => b - a);
        const hist = [1, 2, 3, 4, 5, 6].map((d) => `>=${d}:${ns.filter((n) => n >= d).length}`).join(" ");
        console.log(`   ${m}: ${ns.length} series, deepest ${ns[0]}  ${hist}`);
      }
      console.log(`   series whose key matches a live group: ${matching}/${series.size}\n`);
    } catch (e) {
      console.log(`── ${name}: unreadable (${(e as Error).message.split("\n")[0]})\n`);
    } finally {
      await db.$disconnect();
    }
  }
  await prisma.$disconnect();
}

void main();
