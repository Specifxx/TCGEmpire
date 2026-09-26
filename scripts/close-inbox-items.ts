/**
 * Closes the inbox items worked on 2026-09-24, and ONLY those — every row is
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
const SUGGESTIONS: Close[] = [];

// ── Wrong-price / wrong-card reports ─────────────────────────────────────────
// The 2026-09-24 pass closed the Azir/Jax report and left the Vi eBay report
// open pending its next chase pass. diagnose-card (2026-09-26) now shows
// ebay_us pricing Vi, Piltover Enforcer's overnumbered at US$104.68 — the
// US$1.99 row from the 187/229 mismatch is gone — so it closes here too.
//
// One new report this pass: Falling Star (OGN 029/298), GG Legends US$0.49.
// diagnose-card showed the listing as "Falling Star [Gothic]" — every other
// store prices this card US$10-22, and "Gothic" is not a Riftbound set,
// condition, or print-variant word. cleanProductName() in price-import.ts
// discards bracket contents outright, so that one signal never reached the
// matcher. Fixed the same way as foreignTotal: a bracket note that matches
// none of our own vocabulary, on a title with no collector number to
// corroborate it, is now evidence of a different product, not noise to
// ignore. tests/price-import.test.ts pins the exact title.
const REPORTS: Close[] = [
  {
    id: "cmueqk03f0001nq05zyyoonim",
    from: "NEW",
    to: "FIXED",
    what: "Vi, Piltover Enforcer (UNL 229/219, Overnumbered), eBay US$1.99 in six markets",
    why: "fixed 2026-09-24 (numberMatches no longer reads a bare number that touches someone else's slash); verified 2026-09-26 via diagnose-card — ebay_us now prices the overnumbered chase at US$104.68, and the US$1.99 row is gone",
  },
  {
    id: "cmugzoyfm000014j323g337b7",
    from: "NEW",
    to: "FIXED",
    what: "Falling Star (OGN 029/298), GG Legends US$0.49",
    why: "the listing was \"Falling Star [Gothic]\", a different, non-Riftbound product filed under our card by name alone. resolveCardId now refuses a bare name match whose bracket note names nothing in our own vocabulary",
  },
];

// ── Feedback ─────────────────────────────────────────────────────────────────
// Nothing to close: all three rows in the queue are already HIDDEN, and all
// three were genuinely actioned rather than merely hidden — verified in code
// this pass, not assumed from the status:
//   • shipping missing from the portfolio → /portfolio's "Replacement cost,
//     delivered" panel
//   • duplicates cannot carry different purchase prices → CollectionCard
//     .costBasisIsTotal (prisma/schema.prisma), whose comment quotes the report
//   • "Hobby Collectors Australia is throwing off card prices" → the foreignTotal
//     guard in resolveCardId (lib/price-import.ts), whose comment quotes it too
const FEEDBACK: Close[] = [];

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
