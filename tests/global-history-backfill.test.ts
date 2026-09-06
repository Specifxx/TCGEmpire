import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SCRIPT = "scripts/backfill-global-history.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-09-05 GLOBAL history consolidation (see tests/history-source-
// consolidation.test.ts) means every reader now filters PriceHistory to
// country=GLOBAL_HISTORY_COUNTRY. Without a backfill, every existing per-market
// row becomes invisible the moment the read side deploys — this script exists
// to carry that history across instead of letting it silently disappear. These
// tests pin its safety invariants by source inspection (the same style every
// other one-off history-DB script in this repo uses — see db-chain.test.ts's
// "no script declares its own operational chain" for the precedent), since
// exercising it for real needs a live history database this suite doesn't have.
// ─────────────────────────────────────────────────────────────────────────────

test("dry run by default, matching every other maintenance-dispatched script's DRY_RUN idiom", () => {
  const code = codeOnly(read(SCRIPT));
  assert.match(code, /const APPLY = process\.env\.DRY_RUN !== "1"/, "must default to NOT applying — DRY_RUN unset must never write or delete");
});

test("retired market codes are excluded from the minimum, never guessed at with a wrong currency", () => {
  const code = codeOnly(read(SCRIPT));
  // currencyOf() falls back to DEFAULT_COUNTRY's currency for an unknown code
  // rather than throwing (see tests/retired-market-safety.test.ts) — silent,
  // not safe. A retired code like NZ must be excluded from the USD candidate
  // list entirely, not converted through that wrong-currency fallback.
  assert.match(code, /if \(!\(r\.country in COUNTRIES\)\) \{/, "expected a guard excluding rows whose country isn't a current real market");
  assert.match(code, /skippedRetiredMarket\+\+/, "expected the skip to be counted/reported, not silent");
});

test("a retired-market row is still queued for deletion (dead weight) even though it's excluded from the minimum", () => {
  const code = codeOnly(read(SCRIPT));
  // g.oldRowIds.push must happen for EVERY non-GLOBAL row, unconditionally —
  // before the retired-market check, not gated behind it — or an NZ row would
  // never get cleaned up in phase 2.
  const pushIdx = code.indexOf("g.oldRowIds.push(r.id)");
  const guardIdx = code.indexOf("if (!(r.country in COUNTRIES))");
  assert.ok(pushIdx >= 0 && guardIdx >= 0, "expected both the unconditional push and the retired-market guard");
  assert.ok(pushIdx < guardIdx, "oldRowIds must be pushed BEFORE the retired-market check, so a retired-market row still gets cleaned up");
});

test("phase 1 (populate) never recomputes or rewrites a (card, day) group that already has a GLOBAL row", () => {
  const code = codeOnly(read(SCRIPT));
  assert.match(code, /if \(g\.hasGlobal\) \{ skippedAlreadyGlobal\+\+; continue; \}/, "an existing GLOBAL row must short-circuit before any write for that group");
});

test("phase 2 (delete) never deletes a group's old rows unless a GLOBAL replacement already exists", () => {
  const code = codeOnly(read(SCRIPT));
  // This is the one invariant that actually prevents data loss: deleting old
  // rows for a group with no GLOBAL replacement yet would leave that (card,
  // day) with NOTHING — worse than not running phase 2 at all.
  assert.match(
    code,
    /if \(!g\.hasGlobal\) \{ groupsMissingGlobal\+\+; continue; \}/,
    "a group missing its GLOBAL replacement must be skipped, not have its old rows deleted anyway"
  );
  assert.match(code, /idsToDelete\.push\(\.\.\.g\.oldRowIds\)/, "the actual deletion must only run past that guard");
});

test("--delete-old is a separate, explicit CLI flag — populate and delete never run in the same invocation", () => {
  const code = codeOnly(read(SCRIPT));
  assert.match(code, /const DELETE_OLD = process\.argv\.includes\("--delete-old"\)/);
  assert.match(code, /if \(!DELETE_OLD\) \{/, "the populate phase's write logic must be gated behind the flag being ABSENT");
});

test("maintenance.yml wires both phases as separate dispatchable tasks, both history-var-scoped", () => {
  const yml = read(".github/workflows/maintenance.yml");
  assert.match(yml, /- backfill-global-history #/, "expected the populate task in the task menu");
  assert.match(yml, /- backfill-global-history-delete-old #/, "expected the delete-old task in the task menu");
  assert.match(
    yml,
    /if: inputs\.task == 'backfill-global-history'[\s\S]{0,300}run: npx tsx scripts\/backfill-global-history\.ts\n/,
    "the populate step must invoke the script with no extra flag"
  );
  assert.match(
    yml,
    /if: inputs\.task == 'backfill-global-history-delete-old'[\s\S]{0,300}run: npx tsx scripts\/backfill-global-history\.ts --delete-old/,
    "the delete-old step must pass --delete-old"
  );
});
