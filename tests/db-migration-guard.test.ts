import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const YML = readFileSync(join(ROOT, ".github/workflows/maintenance.yml"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// `pg_restore --clean` recreates every object FROM THE DUMP, so a database
// migration necessarily installs the SOURCE project's schema onto the target —
// which is OLDER than the repo's the moment any schema change lands after the
// source stopped receiving deploys.
//
// 2026-08-20 is the worked example. A commit adding Card.lowestPriceCentsDe
// merged seven seconds before the RM6→RM7 cutover commit. Vercel pushed the new
// column to RM7; the migration's restore then dropped it again, leaving deployed
// code selecting a column that no longer existed. It was re-added only because
// an unrelated `prisma db push` happened to run afterwards — luck, not design.
//
// The migration step must therefore END by pushing the repo's schema at the
// target. This is a source-level assertion because the failure is silent: the
// migration reports success, every row count matches, and the break surfaces
// later as a 500 on whichever page selects the missing column.
// ─────────────────────────────────────────────────────────────────────────────

// Each `- name:` block is one workflow step; slicing on that boundary keeps an
// assertion about one step from being satisfied by a different step's text.
function stepsOf(src: string): { name: string; body: string }[] {
  const parts = src.split(/\n      - name: /).slice(1);
  return parts.map((p) => ({ name: p.slice(0, p.indexOf("\n")).trim(), body: p }));
}

// DERIVED FROM db-chains.ts, never hard-coded. This constant said "RM7" through
// the 2026-08-22 rotation onto RM8, so it silently kept asserting against the
// step for a project that was no longer live — the same staleness this whole
// file exists to catch, reproduced in the test itself.
const CURRENT_OP = /export const OPERATIONAL_VARS = \[\s*"(\w+)"/.exec(
  readFileSync(join(ROOT, "src/lib/db-chains.ts"), "utf8")
)?.[1];
assert.ok(CURRENT_OP, "could not read the head of OPERATIONAL_VARS from db-chains.ts");
const CURRENT_MIGRATION = `Migrate main (operational) database to ${CURRENT_OP}`;

test("the CURRENT migration step re-pushes the schema after restoring", () => {
  const step = stepsOf(YML).find((s) => s.name === CURRENT_MIGRATION);
  assert.ok(step, `expected a "${CURRENT_MIGRATION}" step`);
  // Aimed at the target, and specifically at its DIRECT endpoint: over Neon's
  // PgBouncer host `prisma db push` introspects an empty schema and aborts with
  // P1014 "The underlying table for model `Card` does not exist" even when the
  // restore just verified that table row-for-row (seen 2026-08-22, run
  // 32555324191). DIRECT_TARGET_URL is TARGET_DATABASE_URL minus "-pooler".
  assert.match(
    step!.body,
    /DIRECT_TARGET_URL="\$\{TARGET_DATABASE_URL\/-pooler\/\}"/,
    "derive a direct (non-pooled) URL — a pooled push fails P1014 against a freshly restored database"
  );
  assert.match(
    step!.body,
    /DATABASE_URL="\$DIRECT_TARGET_URL" npx prisma db push/,
    "the restore leaves the SOURCE's older schema behind — push the repo's schema at the target before anyone deploys"
  );
  // Prisma reads DATABASE_URL and nothing else; aiming it at the target is the
  // whole point, so a bare `prisma db push` here would migrate the wrong project.
  assert.ok(
    !/\n\s*npx prisma db push[^\n]*\n/.test(step!.body.replace(/DATABASE_URL="\$DIRECT_TARGET_URL" npx prisma db push[^\n]*/g, "")),
    "every db push in this step must be aimed explicitly at the target"
  );
});

test("a failed schema re-push fails the migration job loudly", () => {
  const step = stepsOf(YML).find((s) => s.name === CURRENT_MIGRATION)!;
  // Silently continuing would hand over a target whose schema is older than the
  // code about to be deployed against it — the exact 2026-08-20 failure.
  assert.match(step.body, new RegExp(`::error::schema push against ${CURRENT_OP} FAILED`), "expected a loud error on push failure");
  assert.match(step.body, /Do NOT deploy until this succeeds/, "the error must say what not to do next");
});

test("row-count verification is enumerated from the database, not hand-listed", () => {
  const step = stepsOf(YML).find((s) => s.name === CURRENT_MIGRATION)!;
  // A hand-maintained list cannot mention a table added since it was written.
  // After the 2026-08-20 migration the three newest tables (opt-out records and
  // store-health snapshots) were restored but never verified, because they were
  // not in the nine names someone typed out.
  // Scope to the VERIFICATION block. Earlier in the same step a fixed list is
  // fine and deliberate: the pre-flight "what the target holds BEFORE we replace
  // it" snapshot and the dump-completeness check both name specific tables on
  // purpose, and neither claims to cover everything.
  const verify = step.body.slice(step.body.indexOf("== Verifying row counts"));
  assert.ok(verify.length > 0, "expected a row-count verification block");
  assert.match(verify, /FROM pg_tables WHERE schemaname='public'/, "enumerate the source's tables");
  assert.ok(
    !/for T in 'public\."User"'/.test(verify),
    "the hard-coded nine-table list silently skips every table added since it was written"
  );
  // The two whose DATA is deliberately not copied must still be excluded, or
  // every run would report a false mismatch.
  assert.match(step.body, /tablename NOT IN \('PriceHistory','ClickEvent'\)/, "history-project tables are dump-excluded");
  assert.match(step.body, /could not enumerate source tables/, "an empty enumeration must fail, not silently verify nothing");
});
