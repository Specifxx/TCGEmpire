/**
 * WHAT IS ACTUALLY IN ONE SEALED PRODUCT GROUP?
 *
 * READ-ONLY. One query, no writes, no eBay quota spent.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * A wrong-price report against a SEALED product names a groupKey and a price and
 * nothing else — PriceReport has no title column for sealed, because a sealed
 * listing has no id of its own (it is identified by groupKey + retailer +
 * country). So the one thing needed to act on the report — WHAT THE LISTING SAID
 * — is the one thing the report cannot carry.
 *
 * Everything else is a dead end: /sealed renders the product tile, not the
 * listing title, and eBay serves 403 to any scripted fetch of an /itm/ page. The
 * titles exist in exactly one place, SealedListing.title, and until now nothing
 * could read them without an admin session.
 *
 * Written for three reports that landed together (2026-09-19/2026-09-11):
 *   • SFD|Booster Box, eBay AU, A$123.74 — "Chinese version"
 *   • UNL|Booster Box, eBay AU, A$156.22 — "Unleashed Slim Booster Box (CHN)"
 *   • OGN|Booster Case, eBay US, US$469.07 — "Its actually just a single box"
 * The first two are a language leak and the third a classification error, and
 * each fix is a regex — which is precisely the kind of change that must be made
 * against a real title rather than an imagined one. This file's whole purpose is
 * to make the real titles readable.
 *
 * Usage:  npx tsx scripts/diagnose-sealed.ts                 # every group
 *         GROUP='UNL|Booster Box' npx tsx scripts/diagnose-sealed.ts
 *         GROUP=UNL npx tsx scripts/diagnose-sealed.ts       # substring match
 *
 * Reads the CLASSIFIER back over every title too, so a row whose stored
 * productType disagrees with what classifySealed() says today is flagged: that
 * is a mis-typed listing, and it is how a single box ends up filed as a case.
 */
import { prisma } from "../src/lib/db";
import { classifySealed } from "../src/lib/sealed-import";

const GROUP = process.env.GROUP ?? "";

const rule = (t: string) => {
  console.log("");
  console.log("═".repeat(78));
  console.log(t);
  console.log("═".repeat(78));
};

async function main() {
  const rows = await prisma.sealedListing.findMany({
    where: GROUP ? { groupKey: { contains: GROUP } } : {},
    orderBy: [{ groupKey: "asc" }, { country: "asc" }, { priceCents: "asc" }],
    select: {
      groupKey: true, title: true, productType: true, setCode: true,
      retailer: true, retailerName: true, priceCents: true, url: true,
      country: true, inStock: true, lastSeen: true,
    },
  });

  rule(`SEALED LISTINGS${GROUP ? ` matching "${GROUP}"` : ""} — ${rows.length}`);
  if (!rows.length) {
    console.log("(none — check the GROUP filter, or the importer has not run)");
    return;
  }

  let lastKey = "";
  const mismatches: typeof rows = [];
  for (const r of rows) {
    if (r.groupKey !== lastKey) {
      lastKey = r.groupKey;
      console.log("");
      console.log(`── ${r.groupKey} ${"─".repeat(Math.max(0, 58 - r.groupKey.length))}`);
    }
    // The classifier is the thing under suspicion for the "case that is really a
    // box" report, so run it and print BOTH answers rather than trusting either.
    const now = classifySealed(r.title);
    const flag = now === r.productType ? "" : `  ⚠ classifySealed says "${now}"`;
    console.log(
      `  ${r.country}  ${(r.priceCents / 100).toFixed(2)}  ${r.inStock ? "in " : "OOS"}  ` +
        `${r.retailer.padEnd(12)} ${r.lastSeen.toISOString().slice(0, 10)}${flag}`,
    );
    console.log(`      ${r.title}`);
    console.log(`      ${r.url}`);
    if (now !== r.productType) mismatches.push(r);
  }

  rule(`STORED productType DISAGREES WITH classifySealed() — ${mismatches.length}`);
  if (!mismatches.length) console.log("(none — every row types the same way today as when it was written)");
  for (const r of mismatches) console.log(`- ${r.groupKey} · ${r.retailer} · ${r.title}`);

  rule("END");
}

main()
  .catch((e) => {
    console.error("diagnose-sealed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
