import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRISMA'S `distinct` DOES NOT REACH POSTGRES, AND NEITHER DOES THE `take` NEXT
// TO IT.
//
// `findMany({ distinct: [...] })` reads like SELECT DISTINCT ON. It is not.
// Prisma dedupes in the CLIENT, so the emitted SQL selects EVERY matching row —
// and when `take` is combined with `distinct`, the LIMIT is dropped too, because
// it has to bound the deduped array rather than the query. A call that looks
// capped at 7 rows can return the entire table.
//
// Captured from the Prisma query log on 2026-08-22 (Prisma 5.22), all three
// exactly as they were written in this repo:
//
//   findMany({ distinct: ["day"], select: { day: true }, take: 400 })
//     → SELECT "DemandSnapshot"."id", "DemandSnapshot"."day"
//       FROM "DemandSnapshot" WHERE 1=1 ORDER BY "id" ASC OFFSET $1
//
//   findMany({ where: { cardId }, select: { day: true }, distinct: ["day"],
//             take: MIN_HISTORY_DAYS })
//     → SELECT "PriceHistory"."id", "PriceHistory"."day" FROM "PriceHistory"
//       WHERE "cardId" = $1 ORDER BY "id" ASC OFFSET $2
//
//   findMany({ orderBy: { priceCents: "asc" },
//             distinct: ["cardId", "country", "isFoil"] })
//     → SELECT … FROM "RetailerPrice" WHERE … ORDER BY "priceCents" ASC OFFSET $n
//
// No DISTINCT. No LIMIT. The third one even carried a comment claiming it had
// been rewritten to push a DISTINCT ON down to Postgres.
//
// COST, measured on RM8 the same day (scripts/audit-egress.ts):
//   SELECT "DemandSnapshot"."id","day" FROM "DemandSnapshot"
//   222 calls · 3,621,086 rows · 16,311 rows/call
// The table held 17,148 rows. Each call dragged back ~1.8 MB to compute ONE
// integer under 400, and it was the single largest row-returning statement on
// the database. That table grows by one row per card per day, forever.
//
// This matters here more than in most codebases: nine Neon projects have been
// exhausted in sequence, each dying two to three days after cutover, and the
// site went down on 2026-08-22 when RM7 ran out mid-service.
//
// THE FIX IS ALWAYS TO MAKE POSTGRES DO IT:
//   • need a count?      SELECT COUNT(DISTINCT col)
//   • need the values?   GROUP BY col  (LIMIT now binds the query)
//   • need whole rows?   SELECT DISTINCT ON (a, b) … ORDER BY a, b, tiebreak
// All three are one $queryRaw. See lib/demand-snapshot.ts, lib/card-price-state.ts
// and app/stores/report/page.tsx for a worked example of each.
// ─────────────────────────────────────────────────────────────────────────────

test("no Prisma findMany uses client-side `distinct`", () => {
  const offenders: string[] = [];

  for (const file of walk(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      // The Prisma option is always an array literal of column names. A plain
      // `distinct: 0` / `distinct: items.length` (MyCollection's own stat) is a
      // different thing entirely and must not trip this.
      if (!/(^|[\s{,])distinct:\s*\[/.test(line)) return;
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*")) return; // the notes above
      offenders.push(`${relative(ROOT, file)}:${i + 1} — ${code}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "Prisma dedupes `distinct` in the client and drops the accompanying LIMIT, so these " +
      "select every matching row. Push it into Postgres (COUNT(DISTINCT …) / GROUP BY / " +
      "DISTINCT ON) via $queryRaw:\n" +
      offenders.join("\n")
  );
});
