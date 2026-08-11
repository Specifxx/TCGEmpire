// ─────────────────────────────────────────────────────────────────────────────
// RESTORE ACCOUNT + MARKETPLACE DATA FROM AN OLDER DATABASE INTO THE CURRENT ONE
// ─────────────────────────────────────────────────────────────────────────────
// After the RM4 → RM5 cutover on 2026-08-10, RM5 served cards and prices but
// User / SellerProfile / MarketplaceListing / Order came up empty. The cause is
// not mysterious: RM4 stopped answering BEFORE migrate-main-db-rm5 could drain
// it, so RM5's tables were created empty by `prisma db push` and then filled
// from the PUBLIC sources only — RiftScribe and the store importers. Those
// sources know about cards. They know nothing about accounts, listings, orders,
// collections or support tickets, and no amount of re-running them brings those
// back.
//
// This script copies exactly those tables from whichever older database still
// answers, into the current one.
//
// WHY THIS EXISTS RATHER THAN pg_restore. The maintenance workflow's
// migrate-main-db-rm5 task does a full `pg_restore --clean`, which drops and
// replaces EVERY table — including the Card/RetailerPrice catalogue RM5 has
// since rebuilt correctly, and including the rune-price fix. That is the right
// tool for a planned cutover and the wrong one for a rescue. This copies only
// the tables that cannot regenerate themselves, and it does so ADDITIVELY:
//
//   * Nothing is ever deleted or overwritten. Every write is createMany with
//     skipDuplicates, so a row that already exists in the target wins. Anyone
//     who signed up on RM5 after the cutover keeps their account.
//   * Tables are copied PARENT FIRST (User before SellerProfile before
//     MarketplaceOffer), so foreign keys are satisfied without needing to
//     disable triggers — which Neon would not grant us anyway.
//   * A child row whose parent is missing is SKIPPED, not force-inserted. That
//     matters because Card rows differ between the two databases: a listing
//     pointing at a card RM5 doesn't have would fail the FK and abort the batch.
//   * Nothing is written until the source has been read successfully, so a
//     source that dies mid-read leaves the target exactly as it was.
//
// It is safe to run twice: the second run reports every row as a duplicate and
// changes nothing.
//
// USAGE
//   SOURCE_DATABASE_URL=<older project>  TARGET_DATABASE_URL=<current project> \
//     tsx scripts/restore-accounts.ts [--dry-run]
//
// Run it via the maintenance workflow's `restore-accounts-into-rm5` task, which
// picks SOURCE from the `source` input and pins TARGET to RM5.

import { PrismaClient } from "@prisma/client";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL ?? "";
const TARGET_URL = process.env.TARGET_DATABASE_URL ?? "";
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

if (!SOURCE_URL) throw new Error("SOURCE_DATABASE_URL is not set — nothing to restore FROM.");
if (!TARGET_URL) throw new Error("TARGET_DATABASE_URL is not set — nothing to restore INTO.");
if (SOURCE_URL === TARGET_URL) {
  // The single most damaging mistake available here, and the easiest to make:
  // both variables default through the same chain in lib/db.ts.
  throw new Error("SOURCE and TARGET are the SAME database — refusing to run.");
}

const source = new PrismaClient({ datasourceUrl: SOURCE_URL });
const target = new PrismaClient({ datasourceUrl: TARGET_URL });

// The tables that cannot rebuild themselves, PARENT FIRST. Card and
// RetailerPrice are deliberately absent: the target's copies are newer, and the
// card catalogue regenerates from RiftScribe and the store importers anyway.
//
// `parents` names the foreign keys that must already exist in the TARGET for a
// row to be insertable. Anything else is dropped with a count, never forced.
type Table = {
  model: keyof PrismaClient & string;
  label: string;
  parents?: { field: string; of: string }[];
};

// The FK field names and the ORDER below are both taken from schema.prisma
// rather than guessed, and tests/restore-accounts.test.ts re-derives them from
// the schema on every run so a future migration cannot silently invalidate
// this list. Two things that are easy to get wrong and are wrong-looking-right:
// Order's FKs are buyerId/sellerId (not userId), and Order ALSO points
// optionally at Listing and BuyOrder — so those two must be copied BEFORE it.
const TABLES: Table[] = [
  // No foreign keys at all — safe first.
  { model: "user", label: "User" },
  { model: "supportTicket", label: "SupportTicket" },
  { model: "counter", label: "Counter" },
  { model: "newsletterSubscriber", label: "NewsletterSubscriber" },
  { model: "trialRedemption", label: "TrialRedemption" },
  // Straight children of User.
  { model: "sellerProfile", label: "SellerProfile", parents: [{ field: "userId", of: "User" }] },
  { model: "authToken", label: "AuthToken", parents: [{ field: "userId", of: "User" }] },
  { model: "notification", label: "Notification", parents: [{ field: "userId", of: "User" }] },
  { model: "gameScore", label: "GameScore", parents: [{ field: "userId", of: "User" }] },
  // The old peer-to-peer listing tables, which Order may point back at.
  { model: "listing", label: "Listing", parents: [{ field: "sellerId", of: "User" }, { field: "cardId", of: "Card" }] },
  { model: "buyOrder", label: "BuyOrder", parents: [{ field: "buyerId", of: "User" }, { field: "cardId", of: "Card" }] },
  // Orders and their thread.
  { model: "order", label: "Order", parents: [{ field: "buyerId", of: "User" }, { field: "sellerId", of: "User" }, { field: "listingId", of: "Listing" }, { field: "buyOrderId", of: "BuyOrder" }] },
  { model: "orderMessage", label: "OrderMessage", parents: [{ field: "orderId", of: "Order" }, { field: "senderId", of: "User" }] },
  // The current marketplace.
  { model: "marketplaceListing", label: "MarketplaceListing", parents: [{ field: "sellerId", of: "User" }, { field: "cardId", of: "Card" }] },
  { model: "marketplaceOffer", label: "MarketplaceOffer", parents: [{ field: "listingId", of: "MarketplaceListing" }, { field: "buyerId", of: "User" }, { field: "sellerId", of: "User" }] },
  { model: "marketplaceReview", label: "MarketplaceReview", parents: [{ field: "orderId", of: "Order" }, { field: "buyerId", of: "User" }, { field: "sellerId", of: "User" }] },
  // Personal data hanging off cards.
  { model: "collectionCard", label: "CollectionCard", parents: [{ field: "userId", of: "User" }, { field: "cardId", of: "Card" }] },
  { model: "priceAlert", label: "PriceAlert", parents: [{ field: "cardId", of: "Card" }, { field: "userId", of: "User" }] },
];

// Which ids exist in the TARGET, per table. Loaded once from the target, then
// EXTENDED as each table is copied — including in a dry run, where nothing is
// actually written. Without that, a dry run reports the true answer for User and
// then "missing parent" for every single child, because it is checking them
// against a target that will never gain the parents it is about to copy. That is
// not a harmless cosmetic difference: a dry run whose whole purpose is to tell
// you what a rescue would recover would report that it would recover nothing.
const targetIds = new Map<string, Set<string>>();

/** Every table that something later in TABLES points at. */
const PARENT_LABELS = new Set(TABLES.flatMap((t) => t.parents?.map((p) => p.of) ?? []));

async function loadTargetIds(label: string): Promise<Set<string>> {
  const cached = targetIds.get(label);
  if (cached) return cached;
  const model = TABLES.find((t) => t.label === label)?.model ?? (label === "Card" ? "card" : null);
  if (!model) throw new Error(`no model mapping for parent table ${label}`);
  const rows: { id: string }[] = await (target as any)[model].findMany({ select: { id: true } });
  const set = new Set(rows.map((r) => r.id));
  targetIds.set(label, set);
  return set;
}

// ── CARD IDs ARE NOT STABLE ACROSS A CUTOVER ────────────────────────────────
// The single thing most likely to make this rescue quietly recover nothing
// useful. Card.id is a cuid minted when the row is created, and RM5's Card table
// was not copied from RM4 — it was REBUILT from RiftScribe by cards-sync, which
// upserts on externalId and therefore minted brand-new ids for all 1,429 rows.
// So the cardId on every marketplace listing, collection entry and price alert
// in the source points at an id that does not exist in the target: the parent
// check would drop all 57 listings and all 617 collection cards, we would
// "successfully" restore the users alone, and the marketplace would still be
// empty.
//
// externalId is the stable identity — it is what cards-sync itself upserts on —
// with setCode + collectorNumber as a fallback for rows that predate it. Build
// source-id → target-id once and rewrite every cardId through it. If the two
// databases DO happen to share ids the map is the identity function and this
// costs one query.
const cardIdMap = new Map<string, string>();
let cardMapBuilt = false;

type CardKeyRow = { id: string; externalId: string | null; setCode: string; collectorNumber: string };

async function buildCardIdMap(): Promise<{ mapped: number; unmatched: number }> {
  const select = { id: true, externalId: true, setCode: true, collectorNumber: true };
  const [src, dst] = await Promise.all([
    source.card.findMany({ select }) as Promise<CardKeyRow[]>,
    target.card.findMany({ select }) as Promise<CardKeyRow[]>,
  ]);
  const byExternal = new Map<string, string>();
  const byNumber = new Map<string, string>();
  for (const c of dst) {
    if (c.externalId) byExternal.set(c.externalId, c.id);
    byNumber.set(`${c.setCode}|${c.collectorNumber}`, c.id);
  }
  let unmatched = 0;
  for (const c of src) {
    const hit =
      (c.externalId ? byExternal.get(c.externalId) : undefined) ?? byNumber.get(`${c.setCode}|${c.collectorNumber}`);
    if (hit) cardIdMap.set(c.id, hit);
    else unmatched++;
  }
  cardMapBuilt = true;
  return { mapped: cardIdMap.size, unmatched };
}

/** The columns the TARGET actually has for a table, so drift can be projected away. */
const targetColumnCache = new Map<string, Set<string>>();
async function targetColumns(label: string): Promise<Set<string>> {
  const cached = targetColumnCache.get(label);
  if (cached) return cached;
  const rows = await target.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    label
  );
  const set = new Set(rows.map((r) => r.column_name));
  targetColumnCache.set(label, set);
  return set;
}

/**
 * Read a table out of the source, tolerating SCHEMA DRIFT.
 *
 * This is not a theoretical concern, it is the normal case. Every rescue source
 * is a database that was abandoned weeks or months ago, and the schema has moved
 * since. Prisma's findMany() selects every column the CURRENT schema declares,
 * so a single column added after the source was retired makes the whole table
 * unreadable — "The column `PriceAlert.userId` does not exist in the current
 * database", and with it every price alert in the rescue. So: try the typed read
 * first, and fall back to `SELECT *`, which returns whatever the source really
 * has. The projection in copy() then keeps only the columns the target knows.
 */
async function readRows(t: Table): Promise<{ rows: Record<string, unknown>[]; drifted: boolean }> {
  try {
    return { rows: await (source as any)[t.model].findMany(), drifted: false };
  } catch {
    const rows = await source.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM public."${t.label}"`);
    return { rows, drifted: true };
  }
}

const BATCH = 500;

async function copy(t: Table): Promise<string> {
  const pad = t.label.padEnd(20);
  let rows: Record<string, unknown>[];
  let drifted = false;
  try {
    ({ rows, drifted } = await readRows(t));
  } catch (e) {
    // A table the source genuinely does not have is not worth aborting a rescue
    // for — report it and carry on with the tables that do exist.
    return `${pad} source read FAILED — ${String((e as Error).message).split("\n").filter(Boolean)[0]?.slice(0, 90) ?? "unknown error"}`;
  }
  if (!rows.length) return `${pad} source has 0 rows — nothing to copy`;

  // Drop any column the target doesn't have (drift in the other direction).
  const cols = await targetColumns(t.label);
  if (cols.size) {
    rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => cols.has(k))));
  }

  // Rewrite every card reference from the source's ids to the target's BEFORE
  // the parent check runs, or the check rejects rows that are perfectly good.
  let remapped = 0;
  const cardFields = (t.parents ?? []).filter((p) => p.of === "Card").map((p) => p.field);
  if (cardFields.length) {
    for (const r of rows) {
      for (const f of cardFields) {
        const v = r[f];
        if (typeof v !== "string") continue;
        const to = cardIdMap.get(v);
        if (to && to !== v) {
          r[f] = to;
          remapped++;
        }
      }
    }
  }

  let skipped = 0;
  if (t.parents?.length) {
    const parentSets = await Promise.all(t.parents.map((p) => loadTargetIds(p.of)));
    const before = rows.length;
    rows = rows.filter((r) =>
      t.parents!.every((p, i) => {
        const v = r[p.field];
        // A nullable FK that is null is fine — it points at nothing by design.
        return v == null || parentSets[i].has(v as string);
      })
    );
    skipped = before - rows.length;
  }

  // Record what this table now contributes, so its own children resolve — in a
  // dry run too, where these rows are the only thing that will ever "exist".
  // Only for tables something later actually points at: loadTargetIds selects
  // `id`, and Counter has no id column at all.
  if (PARENT_LABELS.has(t.label)) {
    const own = await loadTargetIds(t.label);
    for (const r of rows) if (typeof r.id === "string") own.add(r.id);
  }

  const note = `${drifted ? " [read raw: source schema is older]" : ""}${remapped ? `, ${remapped} card refs remapped` : ""}${skipped ? `, ${skipped} skipped (missing parent)` : ""}`;
  if (DRY_RUN) return `${pad} would copy ${String(rows.length).padStart(6)}${note}`;

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await (target as any)[t.model].createMany({ data: batch, skipDuplicates: true });
    written += res.count;
  }
  const dup = rows.length - written;
  return `${pad} wrote ${String(written).padStart(6)}${dup ? `, ${dup} already present` : ""}${note}`;
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN — reading only, nothing will be written.\n" : "Restoring account/marketplace tables.\n");

  // Prove BOTH ends answer before writing anything at all.
  const srcUsers = await source.user.count();
  const dstUsers = await target.user.count();
  console.log(`source User rows: ${srcUsers}`);
  console.log(`target User rows: ${dstUsers}`);
  if (srcUsers === 0) {
    console.log("\nThe source holds no users — it is not a useful restore source. Nothing written.");
    return;
  }

  const cards = await buildCardIdMap();
  console.log(`card id map: ${cards.mapped} of ${cards.mapped + cards.unmatched} source cards matched in the target${cards.unmatched ? ` (${cards.unmatched} unmatched — rows pointing at those are skipped)` : ""}`);
  if (!cardMapBuilt) throw new Error("card id map was not built — refusing to copy card-linked rows blind");
  console.log("");

  for (const t of TABLES) console.log(await copy(t));

  console.log("");
  console.log(`target User rows after: ${await target.user.count()}`);
  console.log(`target MarketplaceListing rows after: ${await target.marketplaceListing.count()}`);
  console.log(`target Order rows after: ${await target.order.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
