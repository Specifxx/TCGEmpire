/**
 * One-time migration of the history/analytics tables (PriceHistory + ClickEvent)
 * into the CURRENT history database — used when a Neon history project exhausts its
 * monthly network-transfer allowance or goes unreachable, and is replaced.
 *
 *   target  = RH6 if set, else RH5, else HISTORY_DATABASE_URL_4, else
 *             HISTORY_DATABASE_URL — mirrors src/lib/db-history.ts's own priority,
 *             so this script always fills whatever the app itself reads.
 *   sources = main DATABASE_URL + every OLDER history project (RH5, _4, base, _2,
 *             _3), in order
 *
 * NOTE (2026-07-31): RH5 (in use since 2026-07-26) exhausted its monthly Neon
 * network-transfer allowance — RH6 is its replacement. RH5 is now a source only.
 *
 * PREFER THE pg_dump PATH FOR A BULK COPY. This Prisma-based copier reads every
 * row over the uncompressed Postgres wire protocol, which is the most expensive
 * possible way to drain a project that is ALREADY out of transfer allowance. The
 * `migrate-history-db` task in .github/workflows/maintenance.yml does the same job
 * with `pg_dump --format=custom` (compressed on the wire) and should be used for
 * the initial RH5 -> RH6 bulk copy. Keep this script for what it is genuinely
 * better at: topping up the target from SEVERAL sources at once, tolerating a
 * source that refuses reads, and de-duplicating on the way in.
 *
 * NOTE (2026-07-26): HISTORY_DATABASE_URL_4 (the project in use since 2026-07-20)
 * went unreachable (P1001, connection refused). _4 is a source only; it will fail
 * gracefully below (skipped with a loud log) since it can no longer be read.
 *
 * The target is filled from ALL sources with skipDuplicates (the PriceHistory
 * unique key [cardId, country, day] dedupes overlaps), so running it is safe and
 * idempotent. A source that refuses reads (an exhausted/dead project) is skipped
 * with a loud log — whatever copied is kept and the site runs on the new DB regardless.
 *
 * Usage (CI): npx tsx scripts/migrate-history.ts
 */
import { PrismaClient } from "@prisma/client";

// RM3-first, matching src/lib/db.ts. This was bare DATABASE_URL, which only
// happened to work because maintenance.yml sets a job-level DATABASE_URL from
// the RM3 chain. MAIN_URL feeds copyCards() — the Card rows that satisfy
// PriceHistory's foreign key in the target — so if it ever resolved to the OLD
// exhausted operational project, the target's Card table would be seeded from
// stale data and copyTable()'s FK filter would then silently DROP every
// PriceHistory row for any card created since the RM3 cutover, reported only as
// "skipped N rows for cards not in the target".
const MAIN_URL = process.env.RM3 || process.env.DATABASE_URL_2 || process.env.DATABASE_URL;
const TARGET_URL =
  process.env.RH6 || process.env.RH5 || process.env.HISTORY_DATABASE_URL_4 || process.env.HISTORY_DATABASE_URL;
const TARGET_LABEL =
  process.env.RH6 ? "RH6"
  : process.env.RH5 ? "RH5"
  : process.env.HISTORY_DATABASE_URL_4 ? "HISTORY_DATABASE_URL_4"
  : "HISTORY_DATABASE_URL";

if (!MAIN_URL) { console.error("No operational database is set (RM3 / DATABASE_URL_2 / DATABASE_URL)."); process.exit(1); }
if (!TARGET_URL) { console.error("None of RH6 / RH5 / HISTORY_DATABASE_URL_4 / HISTORY_DATABASE_URL is set — point one at the current history project first."); process.exit(1); }
if (TARGET_LABEL !== "RH6") {
  console.warn(`⚠  Target resolved to ${TARGET_LABEL}, not RH6 — RH6 is not visible in this environment. Every older project is exhausted/dead; this is almost certainly not what you want.`);
}

// Every distinct source to pull from (main + older history projects), excluding the
// target itself. De-duplicated by URL so we never read the same DB twice.
const sourceUrls = [
  { label: "main (DATABASE_URL)", url: MAIN_URL },
  { label: "RH5", url: process.env.RH5 },
  { label: "HISTORY_DATABASE_URL_4", url: process.env.HISTORY_DATABASE_URL_4 },
  { label: "HISTORY_DATABASE_URL", url: process.env.HISTORY_DATABASE_URL },
  { label: "HISTORY_DATABASE_URL_2", url: process.env.HISTORY_DATABASE_URL_2 },
  { label: "HISTORY_DATABASE_URL_3", url: process.env.HISTORY_DATABASE_URL_3 },
].filter((s): s is { label: string; url: string } => !!s.url && s.url !== TARGET_URL);
// Dedupe by URL.
const seenUrl = new Set<string>();
const sources = sourceUrls.filter((s) => (seenUrl.has(s.url) ? false : (seenUrl.add(s.url), true)));

const target = new PrismaClient({ datasourceUrl: TARGET_URL });
const main = new PrismaClient({ datasourceUrl: MAIN_URL });

async function counts(label: string, c: PrismaClient): Promise<{ ph: number; ce: number } | null> {
  try {
    const [ph, ce] = await Promise.all([c.priceHistory.count(), c.clickEvent.count()]);
    console.log(`${label}: PriceHistory=${ph.toLocaleString()} ClickEvent=${ce.toLocaleString()}`);
    return { ph, ce };
  } catch (e) {
    console.warn(`${label}: UNREADABLE (${(e as Error).message.split("\n")[0]})`);
    return null;
  }
}

async function copyCards(validInto: Set<string>) {
  const rows = await main.card.findMany();
  for (let i = 0; i < rows.length; i += 500) {
    await target.card.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
  }
  rows.forEach((r) => validInto.add(r.id));
  console.log(`Cards: ensured ${rows.length.toLocaleString()} rows in the target (FK for PriceHistory).`);
}

async function copyTable(from: PrismaClient, label: string, table: "priceHistory" | "clickEvent", validCardIds?: Set<string>) {
  let copied = 0, skippedFk = 0, cursor: string | undefined;
  for (;;) {
    const batch: { id: string; cardId?: string }[] = await (from[table] as any).findMany({
      take: 20_000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    // PriceHistory has an FK to Card; drop rows for cards not present in the target.
    const rows = validCardIds ? batch.filter((r) => r.cardId && validCardIds.has(r.cardId)) : batch;
    skippedFk += batch.length - rows.length;
    for (let i = 0; i < rows.length; i += 5_000) {
      await (target[table] as any).createMany({ data: rows.slice(i, i + 5_000), skipDuplicates: true });
    }
    copied += rows.length;
    if (copied % 100_000 === 0 || batch.length < 20_000) console.log(`${table} ← ${label}: ${copied.toLocaleString()} copied…`);
    if (batch.length < 20_000) break;
  }
  if (skippedFk) console.log(`${table} ← ${label}: skipped ${skippedFk} rows for cards not in the target.`);
  return copied;
}

async function run() {
  console.log(`Target: ${TARGET_LABEL}`);
  console.log(`Sources: ${sources.map((s) => s.label).join(", ") || "(none)"}\n`);

  console.log("— Counts before —");
  await counts("target", target);

  const cardIds = new Set<string>();
  await copyCards(cardIds);

  let ph = 0, ce = 0, unreadable = 0;
  for (const src of sources) {
    const client = src.url === MAIN_URL ? main : new PrismaClient({ datasourceUrl: src.url });
    const c = await counts(src.label, client);
    if (c === null) unreadable++;
    if (c && (c.ph > 0 || c.ce > 0)) {
      try {
        if (c.ph > 0) ph += await copyTable(client, src.label, "priceHistory", cardIds);
        if (c.ce > 0) ce += await copyTable(client, src.label, "clickEvent");
      } catch (e) {
        console.warn(`${src.label} read failed mid-copy (transfer cap?): ${(e as Error).message.split("\n")[0]}`);
        console.warn("Whatever copied so far is kept; the site runs on the new DB either way.");
      }
    }
    if (client !== main) await client.$disconnect();
  }

  console.log("— Counts after —");
  await counts("target", target);
  console.log(`Done. ${ph.toLocaleString()} PriceHistory + ${ce.toLocaleString()} ClickEvent rows copied (deduped).`);

  // "Copied nothing" is NOT success. counts() returns null on a read error and
  // only console.warn()s, and the per-source loop skips a source whose count
  // failed — so a run where the source holding 100% of the data was unreachable
  // used to print "Done. 0 + 0 rows copied" and exit 0, which reads as a
  // completed migration. Every source being unreadable AND nothing copied is
  // the one combination that must fail loudly. (Zero copied with readable
  // sources is legitimately fine — it means the target is already up to date,
  // since createMany runs with skipDuplicates.)
  if (ph === 0 && ce === 0 && unreadable === sources.length && sources.length > 0) {
    console.error(
      `✗ Every source (${sources.map((s) => s.label).join(", ")}) was unreadable and nothing was copied. ` +
        `An exhausted Neon project refuses connections outright — this is a FAILED migration, not an empty one.`
    );
    process.exit(1);
  }
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await Promise.all([target.$disconnect(), main.$disconnect()]); });
