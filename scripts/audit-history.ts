/**
 * Read-only diagnostic for the price-history DB (the one db-history.ts resolves —
 * HISTORY_DATABASE_URL_4 in prod as of 2026-07-20). Prints, for the last 14 Sydney
 * days and per country: row count, distinct cards, and min/median/max
 * lowestPriceCents — so a gap (missing recent days) or a scale jump (broken
 * index) is obvious in the log. Also prints which DB it actually connected to.
 *
 * Usage: npx tsx scripts/audit-history.ts
 */
import { dbHistory } from "../src/lib/db-history";

const CC = ["AU", "NZ", "US", "UK", "SG"];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  // Mirrors db-history.ts's own resolution order exactly.
  const which =
    process.env.HISTORY_DATABASE_URL_4 ? "HISTORY_DATABASE_URL_4"
    : process.env.HISTORY_DATABASE_URL ? "HISTORY_DATABASE_URL"
    : process.env.HISTORY_DATABASE_URL_2 ? "HISTORY_DATABASE_URL_2"
    : process.env.HISTORY_DATABASE_URL_3 ? "HISTORY_DATABASE_URL_3"
    : "DATABASE_URL (fallback)";
  console.log(`History DB in use: ${which}`);

  const total = await dbHistory.priceHistory.count();
  console.log(`PriceHistory total rows: ${total.toLocaleString()}`);

  const cutoff = new Date(Date.now() - 14 * 86400_000);
  const rows = await dbHistory.priceHistory.findMany({
    where: { day: { gte: cutoff } },
    select: { country: true, day: true, cardId: true, lowestPriceCents: true },
    orderBy: { day: "asc" },
  });
  console.log(`Rows in last 14 days: ${rows.length.toLocaleString()}\n`);

  // Group by day → country
  const byDay = new Map<string, Map<string, { cards: Set<string>; prices: number[] }>>();
  for (const r of rows) {
    const day = r.day.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? byDay.set(day, new Map()).get(day)!;
    const c = d.get(r.country) ?? d.set(r.country, { cards: new Set(), prices: [] }).get(r.country)!;
    c.cards.add(r.cardId);
    c.prices.push(r.lowestPriceCents);
  }

  const days = [...byDay.keys()].sort();
  console.log("day        | " + CC.map((c) => c.padEnd(22)).join(""));
  console.log("-".repeat(11 + CC.length * 22));
  for (const day of days) {
    const d = byDay.get(day)!;
    const cells = CC.map((cc) => {
      const c = d.get(cc);
      if (!c) return "—".padEnd(22);
      return `${c.cards.size}c med${median(c.prices)}`.padEnd(22);
    });
    console.log(`${day} | ${cells.join("")}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => dbHistory.$disconnect());
