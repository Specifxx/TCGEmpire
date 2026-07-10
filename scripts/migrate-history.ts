/**
 * One-time migration of the history/analytics tables (PriceHistory + ClickEvent)
 * to a NEW history database — used when a Neon history project blows its monthly
 * network-transfer allowance and gets replaced.
 *
 *   source  = HISTORY_DATABASE_URL   (the exhausted project; reads may be blocked)
 *   target  = HISTORY_DATABASE_URL_2 (the new project; schema must be pushed first)
 *   main    = DATABASE_URL           (operational DB — Card rows + fallback source)
 *
 * Steps:
 *   1. Report PriceHistory/ClickEvent counts in main / source / target, so the log
 *      shows exactly where history currently lives (a fallback setup writes it to
 *      the MAIN database — then main is the copy source, not the old history DB).
 *   2. Copy Card rows into the target (PriceHistory carries an FK to Card).
 *   3. Copy PriceHistory + ClickEvent (batched, skipDuplicates → safe to re-run).
 *
 * If the exhausted source refuses reads, its tables are skipped with a loud log —
 * the site still switches to the new DB and history rebuilds from today.
 *
 * Usage (CI): npx tsx scripts/migrate-history.ts
 */
import { PrismaClient } from "@prisma/client";

const MAIN_URL = process.env.DATABASE_URL;
const OLD_URL = process.env.HISTORY_DATABASE_URL;
const NEW_URL = process.env.HISTORY_DATABASE_URL_2;

if (!NEW_URL) {
  console.error("HISTORY_DATABASE_URL_2 is not set — nothing to migrate to.");
  process.exit(1);
}
if (!MAIN_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const main = new PrismaClient({ datasourceUrl: MAIN_URL });
const target = new PrismaClient({ datasourceUrl: NEW_URL });
// The old history DB may not exist as a separate project (fallback setups).
const source = OLD_URL && OLD_URL !== MAIN_URL ? new PrismaClient({ datasourceUrl: OLD_URL }) : null;

type AnyClient = PrismaClient;

async function counts(label: string, c: AnyClient | null): Promise<{ ph: number; ce: number } | null> {
  if (!c) {
    console.log(`${label}: (not configured)`);
    return null;
  }
  try {
    const [ph, ce] = await Promise.all([c.priceHistory.count(), c.clickEvent.count()]);
    console.log(`${label}: PriceHistory=${ph.toLocaleString()} ClickEvent=${ce.toLocaleString()}`);
    return { ph, ce };
  } catch (e) {
    console.warn(`${label}: UNREADABLE (${(e as Error).message.split("\n")[0]})`);
    return null;
  }
}

async function copyCards() {
  const rows = await main.card.findMany();
  for (let i = 0; i < rows.length; i += 500) {
    await target.card.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
  }
  console.log(`Cards: ensured ${rows.length.toLocaleString()} rows in the target (FK for PriceHistory).`);
  return new Set(rows.map((r) => r.id));
}

async function copyPriceHistory(from: AnyClient, label: string, validCardIds: Set<string>) {
  let copied = 0;
  let skippedFk = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await from.priceHistory.findMany({
      take: 20_000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    // Rows for cards since deleted from the main DB can't satisfy the FK — skip them.
    const rows = batch.filter((r) => validCardIds.has(r.cardId));
    skippedFk += batch.length - rows.length;
    for (let i = 0; i < rows.length; i += 5_000) {
      await target.priceHistory.createMany({ data: rows.slice(i, i + 5_000), skipDuplicates: true });
    }
    copied += rows.length;
    console.log(`PriceHistory ← ${label}: ${copied.toLocaleString()} copied…`);
    if (batch.length < 20_000) break;
  }
  if (skippedFk) console.log(`PriceHistory ← ${label}: skipped ${skippedFk} rows for cards no longer in the main DB.`);
  return copied;
}

async function copyClickEvents(from: AnyClient, label: string) {
  let copied = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await from.clickEvent.findMany({
      take: 20_000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    for (let i = 0; i < batch.length; i += 5_000) {
      await target.clickEvent.createMany({ data: batch.slice(i, i + 5_000), skipDuplicates: true });
    }
    copied += batch.length;
    console.log(`ClickEvent ← ${label}: ${copied.toLocaleString()} copied…`);
    if (batch.length < 20_000) break;
  }
  return copied;
}

async function mainFn() {
  console.log("— Where does history live right now? —");
  const cMain = await counts("main (DATABASE_URL)", main);
  const cOld = await counts("old history (HISTORY_DATABASE_URL)", source);
  await counts("new history (HISTORY_DATABASE_URL_2)", target);

  const cardIds = await copyCards();

  // Copy from every source that actually holds rows: fallback-era history sits in
  // the MAIN database, split-era history in the old project. skipDuplicates makes
  // the union safe (the [cardId,country,day] unique key dedupes overlaps).
  let ph = 0;
  let ce = 0;
  if (cMain && (cMain.ph > 0 || cMain.ce > 0)) {
    if (cMain.ph > 0) ph += await copyPriceHistory(main, "main", cardIds);
    if (cMain.ce > 0) ce += await copyClickEvents(main, "main");
  }
  if (source && cOld && (cOld.ph > 0 || cOld.ce > 0)) {
    try {
      if (cOld.ph > 0) ph += await copyPriceHistory(source, "old-history", cardIds);
      if (cOld.ce > 0) ce += await copyClickEvents(source, "old-history");
    } catch (e) {
      console.warn(`Old history DB read failed mid-copy (transfer cap?): ${(e as Error).message.split("\n")[0]}`);
      console.warn("Whatever copied so far is kept; the site runs on the new DB either way.");
    }
  }

  console.log("— After migration —");
  await counts("new history (HISTORY_DATABASE_URL_2)", target);
  console.log(`Done. ${ph.toLocaleString()} PriceHistory + ${ce.toLocaleString()} ClickEvent rows copied.`);
}

mainFn()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([main.$disconnect(), target.$disconnect(), source?.$disconnect()]);
  });
