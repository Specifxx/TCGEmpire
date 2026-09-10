/**
 * Closes the inbox items worked on 2026-09-10, and ONLY those — every row is
 * named by id, with the status it actually earned.
 *
 * WHY IDS AND NOT A SWEEP. "Mark everything as done" is one query, and it is the
 * wrong one: it would stamp "done" on submissions nobody looked at, and it would
 * tell a person who suggested a store that their store was added when it was
 * not. The queue's value is that its status means something. So this script
 * changes exactly the rows below, refuses to touch a row whose status has moved
 * since (someone else may have actioned it), and prints what it did.
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
// Three of the four are live. Each was verified before being wired up: robots.txt
// checked with the app's own robotsAllows(), collection handles confirmed to
// return products, shipping read off the store's own policy page.
const SUGGESTIONS: Close[] = [
  {
    id: "cmtvv7uh800011by93e0kcmpa",
    from: "pending",
    to: "added",
    what: "Alt F4",
    why: "live in retailers.ts as `altf4` — 911 singles + 28 sealed, also in STORES_WITH_POLICY",
  },
  {
    id: "cmtvv4fsx0000sdwxzp38zpt0",
    from: "pending",
    to: "added",
    what: "Card Brawlers",
    why: "live as `cardbrawlers` — free shipping over C$50 on singles, per the store's own page",
  },
  {
    id: "cmtvv6xty00001by9qvqw6ktz",
    from: "pending",
    to: "added",
    what: "Boutique Hobby Expert",
    why: "live as `hobbyexpert` — stock is under riftbound-origins/-copy/-promo-cards, NOT its empty `riftbound-singles` handle",
  },
  {
    // NOT "added". Saying otherwise would tell the person who suggested it that
    // their store is on the site, and produce a permanently empty store page for
    // every shopper who opened it.
    id: "cmtvv8q5000021by9oo042xvm",
    from: "pending",
    to: "rejected",
    what: "imaginaire.com",
    why: "Cloudflare returns 403 to every request, including a full browser UA — there is no feed to scrape",
  },
];

// ── Wrong-card report ────────────────────────────────────────────────────────
const REPORTS: Close[] = [
  {
    id: "cmtuou4vl0000zq34y41eqy02",
    from: "NEW",
    to: "FIXED",
    what: "/card/warwick-hunter-ogn-159a-298 showed a promo's price on a page claiming to be a Showcase",
    why: "root cause was a drifted promo-set regex in add-tcg-printings.ts; source fixed + pinned by tests, and 9 mis-filed cards repaired by fix-promo-as-variant.ts",
  },
];

// ── Feedback ─────────────────────────────────────────────────────────────────
// HIDDEN, not APPROVED: APPROVED publishes the text as a public review, and
// neither of these people ticked the consent box. Both are bug reports anyway.
const FEEDBACK: Close[] = [
  {
    id: "cmtvsjnb800004chyw1su7zpx",
    from: "NEW",
    to: "HIDDEN",
    what: "portfolio P&L wrong — duplicate copies of a card share one cost basis",
    why: "a collection row can now record a TOTAL as well as a per-copy price (lib/collection-cost.ts), so $770 across two copies and 20/20/25 across three are both expressible",
  },
  {
    id: "cmtu4c26z0000shkhor1f8lmo",
    from: "NEW",
    to: "HIDDEN",
    what: "Hobby Collectors Australia listings throwing off card prices",
    why: "they were Pokémon/One Piece singles: a mixed-game collection whose handle said 'riftbound', matched to our cards by collector NUMERATOR alone via the OGN default. Both holes closed in price-import.ts",
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
