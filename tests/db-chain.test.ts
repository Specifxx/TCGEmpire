import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The database resolution chain, asserted in the two places that must agree.
// ─────────────────────────────────────────────────────────────────────────────
// This repo rotates Neon projects often — RM3→RM4 for the operational database,
// _2→_3→_4→RH5→RH6→RH7 for history — because each one exhausts its monthly
// network-transfer allowance in days. Every rotation has to be applied to the
// APP's chain (src/lib/db.ts, src/lib/db-history.ts) and to the BUILD's chain
// (scripts/build-db-push.sh), and the two have drifted apart twice already:
//
//   • 2026-07-31 — build-db-push.sh's history chain still named only the two
//     OLDEST projects, in reverse precedence, so deploys pushed the schema into
//     an exhausted project the app never read (or silently pushed nothing) while
//     reporting success. A new column 500'd in production behind a green deploy.
//   • 2026-08-04 — the RM3→RM4 and RH6→RH7 cutovers updated the chains but not
//     the "you fell back to a dead project" warnings, which kept hard-coding the
//     previous generation. Every production deploy then printed a ::warning::
//     naming the CURRENT database as the exhausted one.
//
// Both are silent-by-construction: the build stays green either way. These are
// source-level assertions precisely because nothing at runtime catches them.

const chainFrom = (src: string, decl: string) => {
  const body = new RegExp(`const ${decl} =([\\s\\S]*?);`).exec(src)?.[1] ?? "";
  assert.ok(body, `${decl} declaration not found`);
  return [...body.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]);
};

// The build script assigns the winning variable's NAME to SOURCE/HIST_SOURCE in
// each branch, so reading those assignments in order recovers its chain exactly.
const branchesOf = (block: string, varName: string) =>
  [...block.matchAll(new RegExp(`(?<![_\\w])${varName}="(\\w+)"`, "g"))].map((m) => m[1]);

const SH = read("scripts/build-db-push.sh");
const HIST_MARKER = "# History database";
assert.ok(SH.includes(HIST_MARKER), "build-db-push.sh no longer has a history section");
const SH_OP = SH.slice(0, SH.indexOf(HIST_MARKER));
const SH_HIST = SH.slice(SH.indexOf(HIST_MARKER));

test("the build pushes schema to the same operational database the app reads", () => {
  // If these diverge, `prisma db push` writes the new column to one project while
  // the deployed code queries another. The build goes green; the page 500s.
  assert.deepEqual(branchesOf(SH_OP, "SOURCE"), chainFrom(read("src/lib/db.ts"), "OPERATIONAL_URL"));
});

test("the build pushes schema to the same history database the app reads", () => {
  const app = chainFrom(read("src/lib/db-history.ts"), "HISTORY_URL");
  const build = branchesOf(SH_HIST, "HIST_SOURCE");
  // The app's chain ends in a bare DATABASE_URL — "history tables live in the
  // operational database". The build script handles that case by pushing nothing
  // extra (the operational push above already covered those tables), so its chain
  // is deliberately the app's chain minus that final entry, not a mismatch.
  assert.deepEqual(app.at(-1), "DATABASE_URL", "history chain should still end at the operational DB");
  assert.deepEqual(build, app.slice(0, -1));
});

test("a deploy with ONLY the current variable set still pushes schema", () => {
  // The early-exit gate lists the operational variables explicitly. A rotation
  // that adds a project to lib/db.ts but not to this gate makes the gate exit 0
  // on every deploy — logging a benign "skipping" while shipping code against an
  // un-migrated database.
  const gate = /\[ -z "((?:\$\{\w+:-\})+)" \]/.exec(SH_OP)?.[1] ?? "";
  assert.ok(gate, "the operational-database gate was not found");
  const gated = [...gate.matchAll(/\$\{(\w+):-\}/g)].map((m) => m[1]);
  assert.deepEqual(gated, chainFrom(read("src/lib/db.ts"), "OPERATIONAL_URL"));
});

test("the 'you fell back to a dead project' warnings name the CURRENT project", () => {
  // A warning that fires on every healthy deploy is worse than no warning: it
  // teaches you to scroll past the one line that says which database this build
  // actually wrote to.
  const op = /^CURRENT_OP="(\w+)"$/m.exec(SH)?.[1];
  const hist = /^CURRENT_HIST="(\w+)"$/m.exec(SH)?.[1];
  assert.equal(op, chainFrom(read("src/lib/db.ts"), "OPERATIONAL_URL")[0]);
  assert.equal(hist, chainFrom(read("src/lib/db-history.ts"), "HISTORY_URL")[0]);
  // And the app's own startup warnings compare against the same head, so all
  // three diagnostics agree on what "current" means.
  assert.match(read("src/lib/db.ts"), new RegExp(`OPERATIONAL_URL_SOURCE !== "${op}"`));
  assert.match(read("src/lib/db-history.ts"), new RegExp(`HISTORY_URL_SOURCE !== "${hist}"`));
});

test("db-history's idea of the operational database matches db.ts's", () => {
  // historyIsSplit compares the resolved history URL against the resolved
  // OPERATIONAL one. If db-history.ts's copy of that chain lags behind db.ts's,
  // it is answering about a different — usually dead — project. That is how this
  // list came to stop at RM3 while db.ts had moved on to RM5, and the failure it
  // guards (ensureHistoryCards() no-opping, then price-import silently dropping
  // every PriceHistory row on a Card foreign key) is swallowed into one warning
  // line, so nothing at runtime would have told us.
  assert.deepEqual(
    chainFrom(read("src/lib/db-history.ts"), "OPERATIONAL_URL"),
    chainFrom(read("src/lib/db.ts"), "OPERATIONAL_URL")
  );
});
