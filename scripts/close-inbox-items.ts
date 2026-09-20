/**
 * Closes the inbox items worked on 2026-09-20, and ONLY those — every row is
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
const SUGGESTIONS: Close[] = [
  {
    id: "cmu98sx8x0000kshf3adwtcdi",
    from: "pending",
    to: "added",
    what: "Quack Opens (AU) — suggested by the owner, 986 Riftbound products on Shopify",
    why: "live in src/lib/retailers.ts as `quackopens`. Probed before adding: /collections/riftbound/products.json returns 200 with ?country=AU and 986 products, robots.txt allows it, and the $10 flat single-card rate comes off their own published policy page. freeOverCents is 0 — they publish three flat rates and no free tier, and inventing one would route Best Basket onto postage they never waive",
  },
];

// ── Wrong-price / wrong-card reports ─────────────────────────────────────────
// All three sealed reports, each traced to the REAL stored listing title with
// scripts/diagnose-sealed.ts rather than guessed at. FIXED means the code that
// admitted the listing has changed and the change was verified against that
// exact title; the published row itself clears on the next sealed import.
const REPORTS: Close[] = [
  {
    id: "cmu8pg1ad00003tn5ykacg2n9",
    from: "NEW",
    to: "FIXED",
    what: "UNL|Booster Box, eBay AU, A$156 — 'Unleashed Slim Booster Box (CHN)'",
    why: "FOREIGN_LANG listed `cn` but not `chn`, and \\bcn\\b does not match CHN — so an all-English title from an AU-located seller passed every language guard and cleared the price floor. `chn` added (lib/scrape-http.ts), which closes the same hole for singles and every store feed at once; `slim` is excluded as a SKU we do not track",
  },
  {
    id: "cmu8pgyda00005bdhczg58ije",
    from: "NEW",
    to: "FIXED",
    what: "SFD|Booster Box, eBay AU, A$123.56 — reported as 'Chinese version'",
    why: "the real title is 'Riftbound League Of Legends Spiritforged Jumbo Booster Box Factory Sealed' — it names no language at all, so the fix is the claim the title does support: a Jumbo box is a different SKU from the Booster Box we price. `jumbo` excluded alongside `slim` (lib/ebay.ts). A$123.56 against a real AU market of A$215-320",
  },
  {
    id: "cmtx3yed00000145e6hae74jy",
    from: "NEW",
    to: "FIXED",
    what: "OGN|Booster Case, eBay US, US$469 — 'Its actually just a single box, not a case'",
    why: "exactly right. The listing is 'x1 Riftbound: Origins Booster Box New & Sealed English FRESHLY FROM A CASE', and SEALED_TYPE_KW's Booster Case keyword was a bare /\\bcase\\b/. Two fixes: the keyword now requires the word to describe the product, and the importer no longer stamps the searched-for productType onto a listing whose own title classifies as something else (SELF_TYPED in lib/sealed-import.ts). classifySealed also learned the bare phrase 'Booster Case', which it did not recognise at all",
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
