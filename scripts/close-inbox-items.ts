/**
 * Closes the inbox items worked on 2026-09-15, and ONLY those — every row is
 * named by id, with the status it actually earned.
 *
 * WHY IDS AND NOT A SWEEP. "Mark everything as done" is one query, and it is the
 * wrong one: it would stamp "done" on submissions nobody looked at, and it would
 * tell a person who suggested a store that their store was added when it was
 * not. The queue's value is that its status means something. So this script
 * changes exactly the rows below, refuses to touch a row whose status has moved
 * since (someone else may have actioned it), and prints what it did.
 *
 * THE LISTS ARE REPLACED EACH PASS, not appended to. A row closed in an earlier
 * pass only ever prints "already X" here, and carrying a growing archive of them
 * makes the one thing this script is about — what was just worked — harder to
 * read. The record of previous passes lives in DECISIONS.md and in git history.
 *
 * DRY RUN BY DEFAULT — pass --apply to write.
 *
 * WHAT EACH STATUS MEANS HERE
 *   added     the store is live in src/lib/retailers.ts
 *   rejected  looked at, deliberately not added, reason recorded below
 *   FIXED     the reported defect was traced, fixed and verified
 *   HIDDEN    feedback actioned; not a public review (nobody consented to that)
 *
 * Usage:  npx tsx scripts/close-inbox-items.ts            # report only
 *         npx tsx scripts/close-inbox-items.ts --apply
 */
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

type Close = { id: string; from: string; to: string; what: string; why: string };

// ── Store suggestions ────────────────────────────────────────────────────────
// None pending this pass.
const SUGGESTIONS: Close[] = [];

// ── Wrong-price / wrong-card reports ─────────────────────────────────────────
// cmtx3yed0 (sealed OGN "Booster Case" priced off a single box on eBay US) is
// STILL OPEN and deliberately absent: nothing has been changed about how sealed
// listings are classified, so closing it would be a lie about work that has not
// happened.
const REPORTS: Close[] = [];

// ── Feedback ─────────────────────────────────────────────────────────────────
// HIDDEN, not APPROVED: APPROVED publishes the text as a public review, and the
// submitter did not tick the consent box. It is a feature request anyway.
const FEEDBACK: Close[] = [
  {
    id: "cmu24pck90000tizoma4sqcka",
    from: "NEW",
    to: "HIDDEN",
    what: "portfolio ignores shipping — the cheapest copy is often one far-off store, and $50 of postage never shows",
    why: "/portfolio now carries a 'Replacement cost, delivered' panel: the Best-Basket optimiser run over the whole collection, postage charged once per store and free over a store's threshold, shown against the item-price headline",
  },
];

async function close(
  label: string,
  rows: Close[],
  read: (id: string) => Promise<{ status: string } | null>,
  write: (id: string, status: string) => Promise<unknown>,
) {
  console.log("");
  console.log(`── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  for (const r of rows) {
    const row = await read(r.id);
    if (!row) {
      console.log(`  SKIP  ${r.what}\n        row ${r.id} no longer exists`);
      continue;
    }
    if (row.status === r.to) {
      console.log(`  DONE  ${r.what} — already ${r.to}`);
      continue;
    }
    if (row.status !== r.from) {
      // Someone else moved it. Their judgement is newer than this script's.
      console.log(`  SKIP  ${r.what}\n        expected status ${r.from}, found ${row.status} — leaving it alone`);
      continue;
    }
    console.log(`  ${APPLY ? "SET " : "(dry)"} ${r.what}: ${r.from} → ${r.to}`);
    console.log(`        ${r.why}`);
    if (APPLY) await write(r.id, r.to);
  }
}

async function main() {
  console.log(APPLY ? "CLOSING INBOX ITEMS (writing)" : "CLOSING INBOX ITEMS (dry run — pass --apply to write)");

  await close(
    "STORE SUGGESTIONS",
    SUGGESTIONS,
    (id) => prisma.storeSuggestion.findUnique({ where: { id }, select: { status: true } }),
    (id, status) => prisma.storeSuggestion.update({ where: { id }, data: { status } }),
  );
  await close(
    "PRICE / CARD REPORTS",
    REPORTS,
    (id) => prisma.priceReport.findUnique({ where: { id }, select: { status: true } }),
    (id, status) => prisma.priceReport.update({ where: { id }, data: { status } }),
  );
  await close(
    "FEEDBACK",
    FEEDBACK,
    (id) => prisma.feedback.findUnique({ where: { id }, select: { status: true } }),
    (id, status) => prisma.feedback.update({ where: { id }, data: { status } }),
  );

  console.log("");
  console.log(
    APPLY
      ? "Done. Re-run scripts/audit-inbox.ts to confirm the queue."
      : "Nothing written. Re-run with --apply.",
  );
}

main()
  .catch((e) => {
    console.error("close-inbox-items failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
