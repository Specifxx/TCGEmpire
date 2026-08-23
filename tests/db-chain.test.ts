import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

// The chains now live in ONE place (src/lib/db-chains.ts) and everything that
// runs in Node imports them. Only the two consumers that CANNOT import — this
// bash script and the workflow `env:` blocks — still restate them, so this file
// pins those to the shared list rather than to another copy.
const chainFrom = (_src: string, decl: string) => {
  const chains = read("src/lib/db-chains.ts");
  const name = decl === "OPERATIONAL_URL" ? "OPERATIONAL_VARS" : "HISTORY_VARS";
  const body = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(chains)?.[1] ?? "";
  assert.ok(body, `${name} declaration not found in db-chains.ts`);
  return [...body.matchAll(/"(\w+)"/g)].map((m) => m[1]);
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

test("db-history and db.ts resolve the operational database from ONE shared list", () => {
  // historyIsSplit compares the resolved history URL against the resolved
  // OPERATIONAL one. If db-history.ts's copy of that chain lags behind db.ts's,
  // it is answering about a different — usually dead — project. That is how this
  // list came to stop at RM3 while db.ts had moved on to RM5, and the failure it
  // guards (ensureHistoryCards() no-opping, then price-import silently dropping
  // every PriceHistory row on a Card foreign key) is swallowed into one warning
  // line, so nothing at runtime would have told us.
  // Previously these were two hand-maintained copies and they drifted (db-history
  // stopped at RM3 while db.ts had moved to RM5, silently no-opping
  // ensureHistoryCards). Now both import OPERATIONAL_VARS, so the only way to
  // regress is to reintroduce a local copy — which is what this asserts against.
  for (const f of ["src/lib/db.ts", "src/lib/db-history.ts"]) {
    const src = read(f);
    assert.match(src, /from "\.\/db-chains"/, `${f} must import the shared chains`);
    assert.ok(
      !/const OPERATIONAL_URL =\s*\n?\s*process\.env\./.test(src),
      `${f} must not re-declare the operational chain inline`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NO SCRIPT MAY KEEP ITS OWN OPERATIONAL CHAIN.
//
// db-chains.ts exists because these lists were copy-pasted into a dozen places
// and every rotation had to update all of them, and never did. Its header lists
// four production failures caused by exactly that. This is the fifth, and it
// happened AFTER that file was created:
//
//   scripts/repair-history-card-ids.ts declared
//     const OPERATIONAL_VARS = ["RM7", "RM8", "RM6", "DATABASE_URL_2", ...]
//
//   prepended on 2026-08-21, one day before the RM8 cutover. pick() returns the
//   first variable that is merely SET — not the first that ANSWERS — so on
//   2026-08-23 it selected RM7, a project that is dead and over its transfer
//   allowance, printed "Operational : RM7", and died on connect.
//
// The comment above that list even named the drift risk, then justified the copy
// as a "best-effort find ANY live operational database". That justification is
// what made it dangerous: the script re-keys history cardIds onto the live
// catalogue, so joining externalIds against a RETIRED catalogue does not degrade
// the result, it corrupts it — silently, with ON UPDATE CASCADE behind it.
//
// A script that needs the operational database needs THE operational database.
// ─────────────────────────────────────────────────────────────────────────────
test("no script declares its own operational-database chain", () => {
  const dir = join(process.cwd(), "scripts");
  const offenders: string[] = [];

  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    // A local array literal of operational variable NAMES. The canonical list is
    // imported, so a file that imports it has no such literal.
    for (const m of src.matchAll(/const\s+\w*(?:OPERATIONAL|MAIN)\w*(?:_VARS|_URLS)?\s*=\s*\[([^\]]*)\]/g)) {
      const body = m[1];
      if (!/["'](?:RM\d|DATABASE_URL)/.test(body)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`scripts/${f}:${line} — ${m[0].replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "import OPERATIONAL_VARS from src/lib/db-chains.ts instead — a hand-kept copy goes " +
      "stale at the next rotation and selects a dead project, because these chains fall " +
      "through on an UNSET variable, never an unreachable one:\n" + offenders.join("\n")
  );
});
