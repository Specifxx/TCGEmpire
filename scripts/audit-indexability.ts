/**
 * HOW MANY CARD PAGES ARE WE TELLING GOOGLE NOT TO INDEX, AND WHY?
 *
 * READ-ONLY. Prints a census, changes nothing.
 *
 * WHY THIS EXISTS. A card page noindexes itself, and drops out of the sitemap,
 * when lib/card-price-state.ts says it is empty:
 *
 *     indexable = hasInStockListing  OR  historyDays >= 7  OR  noRetailChannelExempt
 *
 * Both halves of that OR read a DIFFERENT database. Listings come from the
 * operational project; history comes from the separate history project. Either
 * can go wrong on its own, and when one does the failure is SILENT and SLOW:
 * nothing errors, the pages still render, and Google quietly drops them over the
 * following days. The symptom is a traffic decline with no deploy to blame.
 *
 * THE FAILURE MODE THIS IS BUILT TO CATCH. The two databases are joined on
 * Card.id, and those ids have been broken apart before — repeatedly. From
 * maintenance.yml's own repair-history-card-ids task:
 *
 *   "Every history project currently has 0% of its cardIds resolving against the
 *    live Card table, because the operational catalogue was REBUILT rather than
 *    restored and every card got a fresh cuid."
 *
 * When that happens historyDays is 0 for EVERY card, the whole OR collapses onto
 * "does it have an in-stock listing right now", and every out-of-stock card
 * noindexes itself at once. Nine database rotations and a restore-from-snapshot
 * have each been an opportunity to re-break it.
 *
 * So this reports the join health FIRST — what fraction of history cardIds
 * resolve against the live catalogue — and then the indexability census that
 * depends on it. A low join rate makes every number under it meaningless, and
 * says to run `repair-history-card-ids`, not to go looking at the sitemap.
 *
 * Usage:
 *   npx tsx scripts/audit-indexability.ts
 *
 * Run in CI via .github/workflows/maintenance.yml (task: audit-indexability).
 */
import { prisma } from "../src/lib/db";
import { dbHistory } from "../src/lib/db-history";
import { MIN_HISTORY_DAYS, cardIsSubstantial } from "../src/lib/card-price-state";
import { NO_RETAIL_CHANNEL_SETS } from "../src/lib/constants";
import { buildDuplicateMap } from "../src/lib/card-duplicates";

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}
function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

async function wakeDb(tries = 6, delayMs = 10_000): Promise<void> {
  for (let i = 1; i <= tries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === tries) throw e;
      console.log(`  …database cold (attempt ${i}/${tries}), retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  await wakeDb();
  console.log(`Wall clock: ${new Date().toISOString()}`);

  const cards = await prisma.card.findMany({
    select: {
      id: true, slug: true, name: true, setCode: true, collectorNumber: true,
      rarity: true, variant: true, isPromo: true, description: true, imageUrl: true,
    },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));

  // ── Cross-database join health ────────────────────────────────────────────
  // Counted in Postgres; only the two integers cross the wire.
  section("History join health (the thing that silently breaks)");
  let historyCardIds: string[] = [];
  let historyErr = "";
  try {
    const rows = await dbHistory.$queryRaw<{ cardId: string }[]>`
      SELECT "cardId" FROM "PriceHistory" GROUP BY "cardId"
    `;
    historyCardIds = rows.map((r) => r.cardId);
  } catch (e) {
    historyErr = e instanceof Error ? e.message.split("\n")[0] : String(e);
  }

  if (historyErr) {
    console.log(`  ✗ history database unreachable: ${historyErr}`);
    console.log("    Every card reads as historyDays=0, so indexability collapses onto");
    console.log("    'has an in-stock listing' alone. Treat the census below as a WORST CASE.");
  } else {
    const resolving = historyCardIds.filter((id) => byId.has(id)).length;
    console.log(`  distinct cardIds in PriceHistory : ${historyCardIds.length.toLocaleString()}`);
    console.log(`  …that resolve to a live Card row : ${resolving.toLocaleString()} (${pct(resolving, historyCardIds.length)})`);
    if (historyCardIds.length > 0 && resolving / historyCardIds.length < 0.5) {
      console.log("");
      console.log("  ✗✗ THE JOIN IS BROKEN. History is keyed to a RETIRED catalogue, so every");
      console.log("     card reads as historyDays=0 and every out-of-stock card noindexes.");
      console.log("     FIX: maintenance.yml task `repair-history-card-ids` (dry_run first).");
      console.log("     Nothing below this line means anything until that is repaired.");
    }
  }

  // ── The indexability census ───────────────────────────────────────────────
  const withListings = new Set(
    (await prisma.retailerPrice.groupBy({ by: ["cardId"], where: { inStock: true }, _count: { _all: true } }))
      .map((r) => r.cardId)
  );
  const richHistory = new Set(
    historyErr
      ? []
      : (
          await dbHistory.$queryRaw<{ cardId: string }[]>`
            SELECT "cardId" FROM "PriceHistory"
            GROUP BY "cardId" HAVING COUNT(DISTINCT day) >= ${MIN_HISTORY_DAYS}
          `
        ).map((r) => r.cardId)
  );

  // A duplicate printing noindexes too — see the `twin != null` term in
  // app/card/[id]/page.tsx. Same map the page builds, so the count agrees.
  const dupes = buildDuplicateMap(cards);
  const isDuplicate = (id: string) => {
    const twin = dupes.get(id);
    return twin != null && twin.id !== id;
  };

  let indexable = 0;
  const reasons = { noListing: 0, thinHistory: 0, duplicate: 0 };
  const noindexedBySet = new Map<string, number>();
  const samples: string[] = [];

  for (const c of cards) {
    const exempt = NO_RETAIL_CHANNEL_SETS.has(c.setCode) && cardIsSubstantial(c);
    const empty = !withListings.has(c.id) && !richHistory.has(c.id);
    const dupe = isDuplicate(c.id);
    const noindex = (empty && !exempt) || dupe;
    if (!noindex) { indexable++; continue; }
    if (dupe) reasons.duplicate++;
    else { reasons.noListing++; if (!richHistory.has(c.id)) reasons.thinHistory++; }
    noindexedBySet.set(c.setCode, (noindexedBySet.get(c.setCode) ?? 0) + 1);
    if (samples.length < 15) samples.push(`${c.name} ${c.setCode} ${c.collectorNumber} (/card/${c.slug ?? c.id})`);
  }

  const noindexed = cards.length - indexable;
  section("Indexability census");
  console.log(`  cards in catalogue            : ${cards.length.toLocaleString()}`);
  console.log(`  INDEXABLE                     : ${indexable.toLocaleString()} (${pct(indexable, cards.length)})`);
  console.log(`  noindexed + out of the sitemap: ${noindexed.toLocaleString()} (${pct(noindexed, cards.length)})`);
  console.log("");
  console.log(`    no in-stock listing anywhere: ${reasons.noListing.toLocaleString()}`);
  console.log(`      …and under ${MIN_HISTORY_DAYS} days of history: ${reasons.thinHistory.toLocaleString()}`);
  console.log(`    duplicate printing (canonical elsewhere): ${reasons.duplicate.toLocaleString()}`);
  console.log("");
  console.log(`  with an in-stock listing      : ${withListings.size.toLocaleString()}`);
  console.log(`  with >= ${MIN_HISTORY_DAYS} days of history      : ${richHistory.size.toLocaleString()}`);

  if (noindexedBySet.size) {
    section("Noindexed by set");
    for (const [set, n] of [...noindexedBySet.entries()].sort((a, b) => b[1] - a[1])) {
      const total = cards.filter((c) => c.setCode === set).length;
      console.log(`  ${set.padEnd(6)} ${String(n).padStart(5)} of ${String(total).padStart(5)}  (${pct(n, total)})`);
    }
    section("Sample of noindexed pages");
    for (const s of samples) console.log(`  - ${s}`);
  }

  // ── What this means for traffic ───────────────────────────────────────────
  section("Read");
  if (noindexed / Math.max(1, cards.length) > 0.25) {
    console.log(`  ⚠ ${pct(noindexed, cards.length)} of the catalogue is withheld from Google.`);
    console.log("    If that share moved recently, it is a sufficient explanation for a");
    console.log("    traffic decline on its own — these pages leave the index over days,");
    console.log("    not instantly, so the drop trails the cause.");
  } else {
    console.log(`  ${pct(indexable, cards.length)} of the catalogue is indexable. Not a mass-noindex event.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await dbHistory.$disconnect().catch(() => {});
  });
