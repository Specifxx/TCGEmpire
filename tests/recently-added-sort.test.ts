import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCardOrderBy } from "../src/lib/cards";

// ─────────────────────────────────────────────────────────────────────────────
// "Recently Added" sort, on both /browse (cards) and /sealed.
//
// The two sides needed genuinely different plumbing, which is the whole reason
// this is worth testing rather than trusting by inspection:
//
//   - Card.createdAt already existed and is stable (cards are always
//     update/create, never wiped and rewritten), so the card side is "add a
//     switch case".
//   - SealedListing rows ARE wiped and rewritten wholesale every scrape
//     (deleteMany + createMany — see importSealed()), so a naive `createdAt`
//     column there would reset to "now" for every still-listed product on
//     every run — the opposite of what "recently added" means. That's why
//     SealedGroupFirstSeen exists as a separate, write-once table.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("buildCardOrderBy('new') sorts by createdAt descending", () => {
  assert.deepEqual(buildCardOrderBy("new"), [{ createdAt: "desc" }]);
});

test("buildCardOrderBy is unaffected for existing sort values", () => {
  // Light regression check: adding a case above `case "number": default:` must
  // not have disturbed the existing switch or its fallthrough default.
  assert.deepEqual(buildCardOrderBy(undefined), [{ setCode: "asc" }, { collectorNumber: "asc" }]);
  assert.deepEqual(buildCardOrderBy("name"), [{ name: "asc" }]);
});

test("SortSelect offers Recently Added on /browse", () => {
  const src = read("src/components/SortSelect.tsx");
  assert.match(src, /\{ value: "new", label: "Recently Added" \}/);
});

test("SealedGroupFirstSeen is a separate table, keyed by groupKey+country, never touched after insert", () => {
  const schema = read("prisma/schema.prisma");
  const start = schema.indexOf("model SealedGroupFirstSeen");
  assert.ok(start > 0, "SealedGroupFirstSeen model must exist");
  const block = schema.slice(start, schema.indexOf("}", start) + 1);
  assert.match(block, /groupKey\s+String/);
  assert.match(block, /country\s+String/);
  assert.match(block, /firstSeenAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(block, /@@id\(\[groupKey, country\]\)/);
});

test("recordSealedFirstSeen writes once per group via skipDuplicates, and runs after cleanup", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /export async function recordSealedFirstSeen/);
  assert.match(
    src,
    /prisma\.sealedGroupFirstSeen\.createMany\(\{\s*data:\s*pairs,\s*skipDuplicates:\s*true\s*\}\)/,
    "must skip rows that already have a firstSeenAt — the whole point is that date never moving",
  );
  // Ordering: cleanupStaleSealed must run BEFORE recordSealedFirstSeen, or a row
  // about to be deleted as invalid gets a permanent (and wrong) tracking entry.
  const cleanupAt = src.indexOf("await cleanupStaleSealed();");
  const recordAt = src.indexOf("await recordSealedFirstSeen();");
  assert.ok(cleanupAt > 0 && recordAt > cleanupAt, "recordSealedFirstSeen must run after cleanupStaleSealed");
});

test("recordSealedFirstSeen pushes the dedup into Postgres, not Prisma's client-side `distinct`", () => {
  // tests/prisma-client-side-distinct.test.ts bans `findMany({ distinct: [...] })`
  // repo-wide (it drops the SQL DISTINCT and the LIMIT both — see that file's
  // header for the 2026-08-22 incident). Pin the GROUP BY form specifically here
  // too, since this function is new precisely because that ban exists.
  const src = read("src/lib/sealed-import.ts");
  const fnStart = src.indexOf("export async function recordSealedFirstSeen");
  const fnBody = src.slice(fnStart, src.indexOf("\n}", fnStart));
  assert.doesNotMatch(fnBody, /distinct:\s*\[/, "must not use Prisma's client-side distinct");
  assert.match(fnBody, /\$queryRaw/);
  assert.match(fnBody, /GROUP BY "groupKey", "country"/);
});

test("getAllSealedGroups reads first-seen and stamps it once per group, keyed by market", () => {
  const src = read("src/lib/sealed-import.ts");
  assert.match(src, /const firstSeen = await getSealedFirstSeen\(\);/);
  assert.match(src, /firstSeenAt: firstSeen\.get\(`\$\{r\.groupKey\}\|\$\{country\}`\) \?\? null,/);
});

test("SealedGroup declares firstSeenAt so callers get it type-safely", () => {
  const src = read("src/lib/sealed-import.ts");
  const start = src.indexOf("export interface SealedGroup");
  const end = src.indexOf("listings: {", start);
  assert.match(src.slice(start, end), /firstSeenAt: Date \| null;/);
});

test("SealedSort offers Recently Added, and /sealed sorts nulls last (not first)", () => {
  const sortSrc = read("src/components/SealedSort.tsx");
  assert.match(sortSrc, /\{ value: "new", label: "Recently Added" \}/);

  const pageSrc = read("src/app/sealed/page.tsx");
  assert.match(pageSrc, /sort === "new"/);
  // Pin the exact comparator so a future edit can't silently flip which side
  // "unknown" lands on — re-implemented below and checked against real data,
  // not just matched textually, since a sign error would still match a loose regex.
  const comparatorSrc = /\(b\.firstSeenAt\?\.getTime\(\) \?\? -1\) - \(a\.firstSeenAt\?\.getTime\(\) \?\? -1\)/;
  assert.match(pageSrc, comparatorSrc);

  type G = { firstSeenAt: Date | null };
  const compare = (a: G, b: G) => (b.firstSeenAt?.getTime() ?? -1) - (a.firstSeenAt?.getTime() ?? -1);
  const older = { firstSeenAt: new Date("2026-01-01") };
  const newer = { firstSeenAt: new Date("2026-08-01") };
  const unknown = { firstSeenAt: null };
  const sorted = [older, unknown, newer].sort(compare);
  assert.deepEqual(sorted, [newer, older, unknown], "newest first, unknown (null) last");
});
