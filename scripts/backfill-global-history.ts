/**
 * ONE-TIME backfill: collapses PriceHistory's existing per-market rows
 * (AU/US/UK/SG/CA/EU, each in its own currency) into ONE row per card per day
 * under country=GLOBAL_HISTORY_COUNTRY, in USD cents — the same value
 * price-import.ts's snapshot write now computes for every NEW day going
 * forward (see price-history.ts's historySource() and price-import.ts's
 * snapshot-write section).
 *
 * WHY THIS EXISTS. historySource() now resolves EVERY market to the single
 * GLOBAL series. Without this backfill, every existing per-market row becomes
 * permanently invisible to every reader (charts, movers, Rising Cards) the
 * moment the new read-side code deploys — not corrupted, just never looked up
 * again — and the whole site's price history would appear to restart from
 * empty, rebuilding one point a week. This script rebuilds it from what's
 * already there so the cutover doesn't cost the weeks of history already on
 * record.
 *
 * ALGORITHM. Group every row by (cardId, day). For each group, convert each
 * row's price to USD cents (skipping any row whose country isn't a CURRENT
 * real market — see rise-predictor.ts's own identical guard for why: a
 * retired market code like NZ must never be looked up in COUNTRIES, and
 * currencyOf() finding nothing there isn't a crash any more, it's a WRONG
 * currency guess, quietly), take the minimum, and write ONE new GLOBAL row.
 * The old per-market rows are superseded by it — the GLOBAL row is a strictly
 * equivalent replacement (same card, same day, the actual lowest of what was
 * there), never a lossy summary, so nothing of value is discarded.
 *
 * TWO INDEPENDENT PHASES, ON PURPOSE — do not collapse them into one:
 *
 *   1. POPULATE (default): write the new GLOBAL rows. Purely additive — the
 *      currently-deployed code has never heard of country=GLOBAL, so this is
 *      safe to run at ANY time, before or after the read/write code change
 *      ships. Run this FIRST, before that code deploys, so reads never hit a
 *      window where GLOBAL rows don't exist yet.
 *   2. DELETE OLD (--delete-old): remove the now-superseded per-market rows.
 *      Only safe once the new code is confirmed live — deleting old rows
 *      before that would blind the STILL-DEPLOYED old code (which reads
 *      per-market rows) before its replacement is actually serving traffic.
 *      Run this SECOND, as a separate step, after prod-verifying the deploy.
 *
 * COST. This is a genuinely large one-time read (the whole table) to unlock
 * an ongoing ~4-6x cut in what every future snapshot writes and every future
 * chart/movers/screener read has to scan — the entire point of the change
 * this backfill exists to carry across. Run phase 1 once; re-running either
 * phase is a safe no-op (see IDEMPOTENT below).
 *
 * IDEMPOTENT. A (cardId, day) group that already has a GLOBAL row (this
 * backfill already ran, or price-import.ts's new write already covered that
 * day) is never recomputed or rewritten — but its old per-market rows, if
 * still present, are still queued for deletion in phase 2. Re-running phase 1
 * after a partial run, or after the new code has started writing fresh GLOBAL
 * rows alongside still-unbackfilled old ones, does not double-write anything.
 *
 * DRY RUN BY DEFAULT for both phases. Pass DRY_RUN=1 to preview either phase
 * (maintenance.yml sets this from its dry_run input); omit it to write/delete
 * for real.
 *
 * Usage:
 *   npx tsx scripts/backfill-global-history.ts                        # populate, dry run
 *   DRY_RUN=1 npx tsx scripts/backfill-global-history.ts               # populate, dry run (explicit)
 *   npx tsx scripts/backfill-global-history.ts --delete-old            # delete old rows, dry run
 *   npx tsx scripts/backfill-global-history.ts --apply                 # populate for real
 *   npx tsx scripts/backfill-global-history.ts --delete-old --apply    # delete old rows for real
 */
import { dbHistory, HISTORY_URL_SOURCE } from "../src/lib/db-history";
import { COUNTRIES, currencyOf, type Country } from "../src/lib/country";
import { convertCents } from "../src/lib/fx";
import { GLOBAL_HISTORY_COUNTRY } from "../src/lib/price-history";

// Matches every other script's DRY_RUN idiom (maintenance.yml sets it to "1"
// from the dry_run input) rather than an --apply flag, since this is meant to
// be dispatched from there like any other maintenance task.
const APPLY = process.env.DRY_RUN !== "1";
const DELETE_OLD = process.argv.includes("--delete-old");
const WRITE_CHUNK = 2000;

type Group = {
  day: Date;
  oldRowIds: string[]; // every non-GLOBAL row for this (cardId, day) — superseded either way
  usdCandidates: number[]; // converted prices from rows with a CURRENT, real market code
  hasGlobal: boolean; // a GLOBAL row already exists for this key
};

async function main() {
  console.log(`History DB in use: ${HISTORY_URL_SOURCE}`);
  console.log(`Phase: ${DELETE_OLD ? "DELETE OLD (removes superseded per-market rows)" : "POPULATE (writes new GLOBAL rows)"}`);
  console.log(`Mode: ${APPLY ? "APPLY (will write for real)" : "DRY RUN (nothing written)"}\n`);

  // The whole table, deliberately — see the header's COST note. This is a
  // one-time read; db-history.ts's egress-guard warning firing here is
  // expected, not a bug to chase.
  const rows = await dbHistory.priceHistory.findMany({
    select: { id: true, cardId: true, country: true, day: true, lowestPriceCents: true },
    orderBy: { day: "asc" },
  });
  console.log(`Read ${rows.length.toLocaleString()} existing rows.`);

  const byKey = new Map<string, Group>();
  let skippedRetiredMarket = 0;
  for (const r of rows) {
    const key = `${r.cardId}|${r.day.toISOString().slice(0, 10)}`;
    const g = byKey.get(key) ?? byKey.set(key, { day: r.day, oldRowIds: [], usdCandidates: [], hasGlobal: false }).get(key)!;
    if (r.country === GLOBAL_HISTORY_COUNTRY) {
      g.hasGlobal = true;
      continue; // never queued for deletion or folded into the min — it IS the replacement
    }
    g.oldRowIds.push(r.id); // superseded regardless of whether it converts cleanly
    if (!(r.country in COUNTRIES)) {
      // A retired market code (e.g. NZ — see rise-predictor.ts's identical
      // guard). currencyOf() would silently return the DEFAULT_COUNTRY's
      // currency for this rather than throw, which is a wrong answer, not a
      // safe one — exclude it from the minimum instead of trusting a guess.
      skippedRetiredMarket++;
      continue;
    }
    g.usdCandidates.push(convertCents(r.lowestPriceCents, currencyOf(r.country as Country), "USD"));
  }

  if (!DELETE_OLD) {
    const toWrite: { cardId: string; country: string; day: Date; lowestPriceCents: number }[] = [];
    let skippedAlreadyGlobal = 0;
    let skippedNoCandidates = 0;
    for (const [key, g] of byKey) {
      if (g.hasGlobal) { skippedAlreadyGlobal++; continue; }
      if (g.usdCandidates.length === 0) { skippedNoCandidates++; continue; } // e.g. only a retired-market row that day
      const cardId = key.slice(0, key.indexOf("|"));
      toWrite.push({ cardId, country: GLOBAL_HISTORY_COUNTRY, day: g.day, lowestPriceCents: Math.min(...g.usdCandidates) });
    }

    console.log(`\n(card, day) groups                : ${byKey.size.toLocaleString()}`);
    console.log(`  already GLOBAL, left alone       : ${skippedAlreadyGlobal.toLocaleString()}`);
    console.log(`  no convertible price that day    : ${skippedNoCandidates.toLocaleString()}`);
    console.log(`  new GLOBAL rows to write          : ${toWrite.length.toLocaleString()}`);
    console.log(`  rows skipped (retired market, e.g. NZ): ${skippedRetiredMarket.toLocaleString()}`);

    if (!APPLY) {
      console.log("\nDRY RUN — nothing written. Re-run with DRY_RUN unset to populate for real.");
      return;
    }
    // skipDuplicates as belt-and-braces against an accidental overlap with the
    // new write path (e.g. this running the same moment a deploy starts
    // writing fresh GLOBAL rows) — normal operation never collides, since
    // hasGlobal groups are already excluded above.
    for (let i = 0; i < toWrite.length; i += WRITE_CHUNK) {
      await dbHistory.priceHistory.createMany({ data: toWrite.slice(i, i + WRITE_CHUNK), skipDuplicates: true });
      console.log(`  wrote ${Math.min(i + WRITE_CHUNK, toWrite.length).toLocaleString()}/${toWrite.length.toLocaleString()}`);
    }
    console.log(`\nDone. Wrote ${toWrite.length.toLocaleString()} GLOBAL rows.`);
    console.log("Next: once the GLOBAL-reading code has deployed and been prod-verified, run again with --delete-old to remove the superseded per-market rows.");
    return;
  }

  // ── Phase 2: delete old rows ────────────────────────────────────────────
  const idsToDelete: string[] = [];
  let groupsMissingGlobal = 0;
  for (const [, g] of byKey) {
    if (!g.oldRowIds.length) continue;
    if (!g.hasGlobal) { groupsMissingGlobal++; continue; } // don't delete a row with no replacement yet
    idsToDelete.push(...g.oldRowIds);
  }

  console.log(`\nOld rows with a GLOBAL replacement (safe to delete): ${idsToDelete.length.toLocaleString()}`);
  if (groupsMissingGlobal) {
    console.log(
      `!! ${groupsMissingGlobal.toLocaleString()} (card, day) group(s) still have OLD rows but no GLOBAL replacement — ` +
        `their old rows are left in place. Run the populate phase again first.`
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with DRY_RUN unset to delete for real.");
    return;
  }
  for (let i = 0; i < idsToDelete.length; i += WRITE_CHUNK) {
    await dbHistory.priceHistory.deleteMany({ where: { id: { in: idsToDelete.slice(i, i + WRITE_CHUNK) } } });
    console.log(`  deleted ${Math.min(i + WRITE_CHUNK, idsToDelete.length).toLocaleString()}/${idsToDelete.length.toLocaleString()}`);
  }
  const remaining = await dbHistory.priceHistory.count({ where: { country: { not: GLOBAL_HISTORY_COUNTRY } } });
  console.log(`\nDone. Non-GLOBAL rows remaining: ${remaining.toLocaleString()} (expect ${groupsMissingGlobal ? "> 0 — see warning above" : "0"}).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => dbHistory.$disconnect());
