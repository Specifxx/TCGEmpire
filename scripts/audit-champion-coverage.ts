/**
 * WHICH CHAMPIONS HAVE CARDS BUT NO HUB?
 *
 * READ-ONLY. One grouped query, no writes. Never fails the run.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * /champions/[slug] hubs come from a curated allowlist (src/lib/champions.ts),
 * deliberately not from `split_part(name, ',', 1)` — see that file's header for
 * the Allay and Yi / Master Yi defects a heuristic ships. The cost of curation is
 * that nothing adds a name when a set releases: reveals and imports write
 * straight to the database, so there is no JSON file a unit test could diff
 * against. Vendetta shipped eight champions (Ambessa, Gangplank, Illaoi, Kayle,
 * Morgana, Nasus, Riven, Swain) that went weeks without a hub while
 * /champions/nasus 404'd and /api/cards?q=nasus returned eight printings.
 *
 * This runs the query that file's "ADDING A CHAMPION" note tells you to run,
 * subtracts every allowlisted prefix and a short list of known non-champions,
 * and prints what is left. A name here is a CANDIDATE, not an instruction: add
 * it to RAW only if it is a League champion (the printings' types help — a lone
 * Battlefield or a named Riftbound creature is not).
 *
 * Usage:
 *   npx tsx scripts/audit-champion-coverage.ts
 *
 * Run in CI via .github/workflows/maintenance.yml (task: audit-champion-coverage).
 * The report is appended to $GITHUB_STEP_SUMMARY when set.
 */
import { appendFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { CHAMPIONS } from "../src/lib/champions";

// Comma-named cards whose prefix is NOT a League champion. Observed 2026-09-25
// across all 1,434 printings: Allay (UNL creature), Masa (VEN unit — Master Yi's
// mentor, not a champion) and Heisho (a VEN Battlefield). Lowercase.
const NOT_CHAMPIONS = new Set(["allay", "masa", "heisho"]);

interface Row {
  prefix: string;
  printings: bigint;
  types: string[];
  sets: string[];
}

async function main() {
  // ~100 grouped rows of short strings: well inside the egress rules at the top
  // of src/lib/db.ts, and dispatch-only.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT trim(split_part(name, ',', 1)) AS prefix,
           count(*) AS printings,
           array_agg(DISTINCT type) AS types,
           array_agg(DISTINCT "setCode") AS sets
    FROM "Card"
    WHERE name LIKE '%,%'
    GROUP BY 1
    ORDER BY 2 DESC, 1`;

  const known = new Set(CHAMPIONS.flatMap((c) => c.prefixes.map((p) => p.toLowerCase())));
  const missing = rows.filter((r) => {
    const p = r.prefix.toLowerCase();
    return !known.has(p) && !NOT_CHAMPIONS.has(p);
  });

  const out: string[] = ["## Champion hub coverage", ""];
  out.push(`${rows.length} distinct name prefixes; ${CHAMPIONS.length} champions allowlisted.`, "");
  if (!missing.length) {
    out.push("Every comma-named prefix is an allowlisted champion or a known non-champion.");
  } else {
    out.push(
      `**${missing.length} prefix(es) with cards but no hub.** Add the champions to RAW in`,
      "src/lib/champions.ts; add anything else to NOT_CHAMPIONS in this script.",
      "",
      "| Prefix | Printings | Types | Sets |",
      "| --- | ---: | --- | --- |",
      ...missing.map(
        (r) => `| ${r.prefix} | ${Number(r.printings)} | ${r.types.join(", ")} | ${r.sets.join(", ")} |`,
      ),
    );
  }
  const text = out.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  // Warn, never fail: a missing hub is lost traffic, not a broken site.
  if (missing.length) {
    console.log(`::warning::${missing.length} card-name prefix(es) have no champion hub: ${missing.map((r) => r.prefix).join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error("::warning::audit-champion-coverage could not run:", e);
  })
  .finally(() => prisma.$disconnect());
