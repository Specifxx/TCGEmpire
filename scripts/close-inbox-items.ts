/**
 * Closes the inbox items worked on 2026-10-12, and ONLY those — every row is
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
    id: "cmukh81om0000rivowif71lqa",
    from: "NEW",
    to: "FIXED",
    what: "Fury Rune (VEN R01B promo), eBay US US$7.95",
    why: "a rune has no printed total, so numberMatches read \"R01b/<anything>\" as a stated match and another set's R01b (\"(R01b/299) Unleashed\", the UK's cheapest at £9.50 on 9 Oct) priced Vendetta's; a two-rune lot (R01b R05b) priced it in the EU. Both refused since 2026-10-12 (tests/wrong-card-reports.test.ts). The reported US$7.95 listing itself had already gone",
  },
];

const FEEDBACK: Close[] = [
  {
    id: "cmv0jpe1n0000y6rd2hl7u3n4",
    from: "NEW",
    to: "HIDDEN",
    what: "\"payment wouldnt go through with multiple cards for a membership\" (3/5, 2026-10-09)",
    why: "traced with payment-failures-report: an AU card's US$1.00 trial fee failed the bank's 3-D Secure three times, the bank then told Stripe not to retry, and Radar blocked a second card as highest risk after that burst. Checkout now uses Stripe Adaptive Pricing (local currency) from 2026-10-12",
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
