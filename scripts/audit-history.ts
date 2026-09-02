/**
 * Read-only diagnostic for the price-history DB (the one db-history.ts resolves —
 * RH6 in prod as of 2026-07-31, after RH5 exhausted its monthly Neon
 * network-transfer allowance).
 * Prints, for the last 14 Sydney days and per country: row count, distinct
 * cards, and min/median/max lowestPriceCents — so a gap (missing recent days)
 * or a scale jump (broken index) is obvious in the log. Also prints which DB
 * it actually connected to.
 *
 * CA and EU showing "—" (or a row count that stops growing) from 2026-09-02
 * onward is EXPECTED, not a gap: they no longer get their own snapshot rows
 * (see price-import.ts's write-skip) — every real reader derives their history
 * from US's and UK's own rows instead, converted (see historySource() in
 * price-history.ts). This script deliberately shows the RAW table, not that
 * derivation, so it can't be used to spot-check CA/EU's actual (converted)
 * numbers — read them from the site (a card page, or /market?market=CA) instead.
 *
 * Usage: npx tsx scripts/audit-history.ts
 */
import { dbHistory, HISTORY_URL_SOURCE } from "../src/lib/db-history";

const CC = ["AU", "US", "UK", "SG", "CA", "EU"];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  // Use db-history.ts's OWN exported constant rather than re-deriving it here.
  // This block used to be a hand-rolled copy of the chain, commented "mirrors
  // db-history.ts's resolution order exactly" — and it had silently stopped
  // doing so: it still led with RH5 after the chain moved to RH6-first. Since
  // maintenance.yml passes BOTH vars, this script would connect to RH6 (via
  // dbHistory) and print "RH5" — a wrong answer from the one tool an operator
  // runs to confirm which history database is live. Never re-derive a chain
  // that something else already exports.
  console.log(`History DB in use: ${HISTORY_URL_SOURCE}`);

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
