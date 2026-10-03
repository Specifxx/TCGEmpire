// Copies the public price history out of the Neon history project into
// data/price-history/ (the file store, src/lib/price-history-store.ts).
// Run by .github/workflows/export-price-history.yml; safe to re-run.
//
//   • Cards: every PriceHistory row with country = GLOBAL, the only series any
//     reader has used since 2026-09-05. The older per-market rows (AU/US/UK/SG/
//     CA/EU/NZ from before the consolidation) stay in Neon untouched; nothing
//     reads them and they are not exported.
//   • Sealed: every SealedPriceHistory row, as recorded (own currency per market).
//
// ADDITIVE. A day that already has a file keeps it: a file the importer wrote
// is the authority for its day. --overwrite replaces them instead.
//
// VERIFIED. After writing, the files are read back through the same store the
// site reads and every exported day's point count is compared with the
// database's. Any mismatch on a day this run wrote fails the run.
//
// Refuses to run unless the history connection resolved to a real history
// project: on DATABASE_URL (the operational database) it would export nothing,
// and the files would look like history had been lost.
import { dbHistory, HISTORY_URL_SOURCE } from "../src/lib/db-history";
import { GLOBAL_HISTORY_COUNTRY } from "../src/lib/price-history";
import {
  CARD_HISTORY_SUBDIR,
  SEALED_HISTORY_SUBDIR,
  cardHistoryRows,
  cardHistoryStats,
  historyDays,
  resetPriceHistoryStore,
  sealedHistoryRows,
  writeCardHistoryDay,
  writeSealedHistoryDay,
} from "../src/lib/price-history-store";

const overwrite = process.argv.includes("--overwrite");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const PAGE = 20_000;

async function main() {
  if (HISTORY_URL_SOURCE.startsWith("DATABASE_URL")) {
    console.error(`::error::history resolved to ${HISTORY_URL_SOURCE} — set the current history project's variable.`);
    process.exit(1);
  }
  console.log(`Exporting public price history from ${HISTORY_URL_SOURCE}${overwrite ? " (overwriting existing days)" : ""}.`);

  // ── Cards ──
  const cardDays = new Map<string, Map<string, number>>();
  let cursor: string | undefined;
  let read = 0;
  for (;;) {
    const page = await dbHistory.priceHistory.findMany({
      where: { country: GLOBAL_HISTORY_COUNTRY },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, cardId: true, day: true, lowestPriceCents: true },
    });
    if (!page.length) break;
    for (const r of page) {
      const day = iso(r.day);
      (cardDays.get(day) ?? cardDays.set(day, new Map()).get(day)!).set(r.cardId, r.lowestPriceCents);
    }
    read += page.length;
    cursor = page[page.length - 1].id;
    if (page.length < PAGE) break;
  }
  console.log(`Cards: ${read} GLOBAL rows over ${cardDays.size} days.`);

  const existingCards = new Set(historyDays(CARD_HISTORY_SUBDIR));
  const wroteCards: string[] = [];
  for (const [day, prices] of [...cardDays].sort(([a], [b]) => a.localeCompare(b))) {
    if (existingCards.has(day) && !overwrite) {
      console.log(`  ${day}: file exists — kept (${prices.size} rows in Neon).`);
      continue;
    }
    const res = writeCardHistoryDay(new Date(`${day}T00:00:00.000Z`), prices);
    if (res) wroteCards.push(day);
  }

  // ── Sealed ──
  const sealed = await dbHistory.sealedPriceHistory.findMany({
    select: { groupKey: true, country: true, day: true, lowestPriceCents: true },
  });
  const sealedDays = new Map<string, typeof sealed>();
  for (const r of sealed) (sealedDays.get(iso(r.day)) ?? sealedDays.set(iso(r.day), []).get(iso(r.day))!).push(r);
  console.log(`Sealed: ${sealed.length} rows over ${sealedDays.size} days.`);
  const existingSealed = new Set(historyDays(SEALED_HISTORY_SUBDIR));
  const wroteSealed: string[] = [];
  for (const [day, rows] of [...sealedDays].sort(([a], [b]) => a.localeCompare(b))) {
    if (existingSealed.has(day) && !overwrite) {
      console.log(`  sealed ${day}: file exists — kept.`);
      continue;
    }
    if (writeSealedHistoryDay(new Date(`${day}T00:00:00.000Z`), rows)) wroteSealed.push(day);
  }

  // ── Verify by reading back through the site's own reader ──
  resetPriceHistoryStore();
  const back = new Map<string, number>();
  for (const r of cardHistoryRows()) back.set(iso(r.day), (back.get(iso(r.day)) ?? 0) + 1);
  let bad = 0;
  const valid = (c: number) => Number.isInteger(c) && c > 0;
  for (const day of wroteCards) {
    const all = [...cardDays.get(day)!.values()];
    const want = all.filter(valid).length;
    if (want !== all.length) console.warn(`  ${day}: ${all.length - want} row(s) with no positive price were not exported.`);
    const got = back.get(day) ?? 0;
    if (want !== got) {
      bad++;
      console.error(`::error::cards ${day}: Neon has ${want} points, the file reads back ${got}.`);
    }
  }
  const sealedBack = new Map<string, number>();
  for (const r of sealedHistoryRows()) sealedBack.set(iso(r.day), (sealedBack.get(iso(r.day)) ?? 0) + 1);
  for (const day of wroteSealed) {
    const want = sealedDays.get(day)!.filter((r) => valid(r.lowestPriceCents)).length;
    const got = sealedBack.get(day) ?? 0;
    if (want !== got) {
      bad++;
      console.error(`::error::sealed ${day}: Neon has ${want} points, the file reads back ${got}.`);
    }
  }

  const stats = cardHistoryStats();
  console.log(
    `Wrote ${wroteCards.length} card day file(s) and ${wroteSealed.length} sealed day file(s). ` +
      `The card store now holds ${stats.points} points for ${stats.cards} cards over ${stats.days} days (${stats.first} → ${stats.last}).`,
  );
  if (bad) {
    console.error(`::error::${bad} day(s) did not read back with the database's count.`);
    process.exit(1);
  }
  console.log("Every exported day reads back with the database's exact count.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => dbHistory.$disconnect());
