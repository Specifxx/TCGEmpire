/**
 * Link existing email-keyed price alerts to the accounts that own them.
 *
 * PriceAlert shipped account-free — the wishlist pop-up collects an email and
 * nothing else — so every row predating the user-account migration has
 * userId = NULL. This matches each unlinked row's address against User.email.
 *
 * Exact lowercase equality is correct, not a shortcut: PriceAlert.email is stored
 * trimmed and lowercased (the zod schema on the subscribe route enforces it) and
 * every User.email write path lowercases too.
 *
 * IDEMPOTENT BY CONSTRUCTION: it only ever selects rows that are still unlinked,
 * so a second run finds nothing. Safe to re-run by hand and safe to leave in a
 * deploy pipeline.
 *
 * Rows whose address has no account stay NULL forever, and that is the CORRECT
 * end state rather than a failure — they are valid email-only subscriptions, the
 * drop cron keeps serving them, and the unsubscribe link keeps working. Anyone
 * who later registers with that address gets them adopted at sign-in by
 * claimAlertsForUser() in src/lib/alerts.ts.
 *
 * Honours DRY_RUN=1 (maintenance.yml sets it from the dry_run input).
 *
 * Usage: npx tsx scripts/backfill-alert-user-ids.ts
 */
import { prisma } from "../src/lib/db";

const DRY = !!process.env.DRY_RUN;
const BATCH = 500;

async function main() {
  const unlinked = await prisma.priceAlert.findMany({
    where: { userId: null },
    select: { email: true },
    distinct: ["email"],
  });

  const total = await prisma.priceAlert.count();
  const linkedAlready = await prisma.priceAlert.count({ where: { NOT: { userId: null } } });
  console.log(
    `PriceAlert rows: ${total} total, ${linkedAlready} already linked to an account, ` +
      `${unlinked.length} distinct unlinked address(es).`,
  );
  if (unlinked.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const emails = unlinked.map((r) => r.email);
  let matchedAddresses = 0;
  let linkedRows = 0;

  for (let i = 0; i < emails.length; i += BATCH) {
    const slice = emails.slice(i, i + BATCH);
    const users = await prisma.user.findMany({
      where: { email: { in: slice } },
      select: { id: true, email: true },
    });
    matchedAddresses += users.length;

    for (const u of users) {
      const n = await prisma.priceAlert.count({ where: { email: u.email, userId: null } });
      if (n === 0) continue;
      if (DRY) {
        console.log(`  DRY_RUN — would link ${n} row(s) for ${u.email}`);
        linkedRows += n;
        continue;
      }
      const res = await prisma.priceAlert.updateMany({
        where: { email: u.email, userId: null },
        data: { userId: u.id },
      });
      linkedRows += res.count;
    }
  }

  console.log(
    `${DRY ? "DRY_RUN: would link" : "Linked"} ${linkedRows} row(s) across ${matchedAddresses} ` +
      `matched account(s). ${unlinked.length - matchedAddresses} address(es) have no account — ` +
      `left as email-only subscriptions, which is expected.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
