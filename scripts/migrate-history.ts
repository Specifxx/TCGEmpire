/**
 * One-time migration of the history/analytics tables (PriceHistory + ClickEvent)
 * into the CURRENT history database — used when a Neon history project exhausts its
 * monthly network-transfer allowance or goes unreachable, and is replaced.
 *
 *   target  = RH5 if set, else HISTORY_DATABASE_URL_4, else HISTORY_DATABASE_URL —
 *             mirrors src/lib/db-history.ts's own priority, so this script always
 *             fills whatever the app itself reads.
 *   sources = main DATABASE_URL + every OLDER history project (_4, base, _2, _3),
 *             in order
 *
 * NOTE (2026-07-26): HISTORY_DATABASE_URL_4 (the project in use since 2026-07-20)
 * went unreachable (P1001, connection refused) — RH5 is its replacement. _4 is now
 * a source only; it will fail gracefully below (skipped with a loud log) since it
 * can no longer be read.
 *
 * The target is filled from ALL sources with skipDuplicates (the PriceHistory
 * unique key [cardId, country, day] dedupes overlaps), so running it is safe and
 * idempotent. A source that refuses reads (an exhausted/dead project) is skipped
 * with a loud log — whatever copied is kept and the site runs on the new DB regardless.
 *
 * Usage (CI): npx tsx scripts/migrate-history.ts
 */
import { PrismaClient } from "@prisma/client";

const MAIN_URL = process.env.DATABASE_URL;
const TARGET_URL = process.env.RH5 || process.env.HISTORY_DATABASE_URL_4 || process.env.HISTORY_DATABASE_URL;

if (!MAIN_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
if (!TARGET_URL) { console.error("None of RH5 / HISTORY_DATABASE_URL_4 / HISTORY_DATABASE_URL is set — point one at the current history project first."); process.exit(1); }

// Every distinct source to pull from (main + older history projects), excluding the
// target itself. De-duplicated by URL so we never read the same DB twice.
const sourceUrls = [
  { label: "main (DATABASE_URL)", url: MAIN_URL },
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
  console.log(`Target: ${process.env.RH5 ? "RH5" : process.env.HISTORY_DATABASE_URL_4 ? "HISTORY_DATABASE_URL_4" : "HISTORY_DATABASE_URL"}`);
  console.log(`Sources: ${sources.map((s) => s.label).join(", ") || "(none)"}\n`);

  console.log("— Counts before —");
  await counts("target", target);

  const cardIds = new Set<string>();
  await copyCards(cardIds);

  let ph = 0, ce = 0;
  for (const src of sources) {
    const client = src.url === MAIN_URL ? main : new PrismaClient({ datasourceUrl: src.url });
    const c = await counts(src.label, client);
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
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await Promise.all([target.$disconnect(), main.$disconnect()]); });
