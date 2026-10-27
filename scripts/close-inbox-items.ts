/**
 * Closes the inbox items worked on 2026-10-27, and ONLY those — every row is
 * named by id (a contact message, which has no id in the audit, by its exact
 * date and subject), with the status it actually earned.
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
 *   added     the store is live in src/lib/retailers.ts or src/lib/sealed-stores.ts
 *   rejected  looked at, deliberately not added, reason recorded below
 *   FIXED     the reported defect was traced, fixed and verified
 *   HIDDEN    feedback actioned; not a public review (nobody consented to that)
 *   ARCHIVED  a contact message that was answered in the product: contact
 *             messages have no status column, so archiving one is the same
 *             delete the /admin/messages button does (owner, 2026-10-15)
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
const REPORTS: Close[] = [
  {
    id: "cmvp949350000322wbt970mgx",
    from: "NEW",
    to: "FIXED",
    what: "Kayn, Unleashed (Heartsteel Signature) RAD 182*/167, TCGplayer CA: we said CA$157.55, they said CA$875",
    why: "every Rare, Epic and Showcase TCGplayer row quoted market price, because TCGplayer marks no Riftbound product foilOnly and the printing filter wanted a Normal listing (DECISIONS.md, 2026-10-26; #171). Verified in the 2026-10-27 snapshot: Kayn's US row is the cheapest English NM listing, $490.00 (CA$671.30), not market ($388.66)",
  },
];

const FEEDBACK: Close[] = [];

// ── Contact messages ─────────────────────────────────────────────────────────
// Named by the exact UTC day and subject the audit prints; the script refuses
// to act unless exactly one row matches both.
type ArchiveContact = { day: string; subject: string; what: string; why: string };
const CONTACT: ArchiveContact[] = [];

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
  console.log(`── CONTACT MESSAGES ${"─".repeat(42)}`);
  for (const c of CONTACT) {
    const start = new Date(`${c.day}T00:00:00Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await prisma.contactMessage.findMany({
      where: { subject: c.subject, createdAt: { gte: start, lt: end } },
      select: { id: true },
      take: 2,
    });
    if (rows.length !== 1) {
      console.log(`  SKIP  ${c.what}\n        ${rows.length ? "more than one" : "no"} message matches — leaving it alone`);
      continue;
    }
    console.log(`  ${APPLY ? "SET " : "(dry)"} ${c.what}: → ARCHIVED (deleted)`);
    console.log(`        ${c.why}`);
    if (APPLY) await prisma.contactMessage.deleteMany({ where: { id: rows[0].id } });
  }

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
