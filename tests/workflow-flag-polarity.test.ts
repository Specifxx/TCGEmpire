import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

// ─────────────────────────────────────────────────────────────────────────────
// A SAFETY FLAG THAT SILENTLY SELECTS THE UNSAFE MODE.
//
// GitHub Actions' `&&` / `||` return an OPERAND, not a boolean, and the empty
// string is FALSY. So this, which reads like "dry run means don't fix":
//
//     FIX: ${{ inputs.dry_run && '' || '1' }}
//
// evaluates `true && ''` → `''` → falsy → falls through to `'1'`. The flag
// selects WRITE mode whether it is ticked or not, and nothing in the log says
// so beyond a quiet `FIX: 1`.
//
// Shipped exactly once, on audit-premium-vs-stripe (2026-08-22), and caught only
// because the job's own env dump was read line by line. It was harmless that
// time — the audit found nothing to change — which is precisely why it would
// have survived to a run where it mattered.
//
// THE RULE: in a ternary that chooses between "do the safe thing" and "do the
// dangerous thing", the TRUE branch must be the NON-EMPTY string. Write the
// condition so that ticking the box is what produces a value:
//
//     DRY_RUN: ${{ inputs.dry_run && '1' || '' }}   ✅ tick → '1'
//     FIX:     ${{ inputs.apply    && '1' || '' }}  ✅ tick → '1'
//     FIX:     ${{ inputs.dry_run  && '' || '1' }}  ❌ always '1'
// ─────────────────────────────────────────────────────────────────────────────

test("no workflow expression puts the EMPTY string on the true branch", () => {
  // `${{ <cond> && '' || '<anything>' }}` — the shape that always yields the
  // right-hand operand. Deliberately matches any condition, not just inputs.*:
  // the trap is in the operator semantics, not in what is being tested.
  const BAD = /\$\{\{[^}]*?&&\s*''\s*\|\|/g;
  const offenders: string[] = [];

  for (const f of FILES) {
    const src = readFileSync(join(DIR, f), "utf8");
    src.split("\n").forEach((line, i) => {
      // A comment explaining the trap is allowed to quote it; a live
      // expression is not. Anchored on the first non-space char being '#'.
      if (/^\s*#/.test(line)) return;
      if (BAD.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim()}`);
      BAD.lastIndex = 0;
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "these expressions always evaluate to their RIGHT-hand operand — the flag cannot select the left one:\n" +
      offenders.join("\n")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// A DUPLICATE KEY BREAKS DISPATCH ENTIRELY, AND LOCAL YAML TOOLS HIDE IT.
//
// Hit for real on 2026-09-22 adding the RM12 → RM3 cutover: an env block ended
// up with `P_RM12:` twice (the secret was already wired; only the probe call
// for it was missing). Python's yaml.safe_load, Node's js-yaml in its default
// mode and most editors all accept that silently — last key wins — so the file
// looked valid everywhere it was checked. GitHub is stricter, and the failure
// is total rather than partial:
//
//   failed to parse workflow: (Line: 3226, Col: 11): 'P_RM12' is already defined
//
// The whole workflow becomes undispatchable — not just the one job — which for
// maintenance.yml means every migration, probe and import in it is unavailable
// until someone notices. It cannot be caught by the YAML parse this repo
// already does, because that parse is exactly what hides it.
//
// So this checks for duplicates the way GitHub does, on the raw text: within a
// single mapping block (same indent, same parent), a key may appear once.
// ─────────────────────────────────────────────────────────────────────────────

test("no workflow defines the same YAML key twice in one block", () => {
  for (const f of FILES) {
    const lines = readFileSync(join(DIR, f), "utf8").split("\n");
    // indent -> (key -> line number) seen at that indent, since the last time
    // a shallower line or a new list item reset that scope.
    const seen = new Map<number, Map<string, number>>();
    const resetFrom = (indent: number) => {
      for (const d of [...seen.keys()]) if (d >= indent) seen.delete(d);
    };
    // Contents of a block scalar (`run: |`, `script: >`) are literal TEXT, not
    // YAML — a shell or Python body in there is full of `word:` lines that are
    // not keys at all. indexnow-submit.yml's embedded Python has two `try:`
    // blocks, which is what caught this. Track the indent that opened the
    // block; everything more-indented than its key belongs to it.
    let blockIndent: number | null = null;
    lines.forEach((line, i) => {
      const lineIndent = /^(\s*)/.exec(line)![1].length;
      if (blockIndent !== null) {
        if (line.trim() === "" || lineIndent > blockIndent) return;
        blockIndent = null;
      }
      // A LIST ITEM STARTS A FRESH MAPPING, and forgetting that is the obvious
      // way to write this check wrong: two steps in a `steps:` list each
      // legitimately carry their own `uses:`/`name:`/`with:`. Caught by
      // android-build.yml the first time this test ran. The marker's own
      // indent and everything deeper is a new scope.
      const item = /^(\s*)-\s/.exec(line);
      if (item) resetFrom(item[1].length);
      // `key: …`, either on its own line or directly after a `- ` marker.
      const m = /^(\s*)(?:-\s+)?([A-Za-z_][A-Za-z0-9_.-]*):(\s|$)/.exec(line);
      if (!m) return;
      // For `- uses: x` the key sits at the marker's indent + 2, which is the
      // mapping it actually belongs to.
      const indent = m[1].length + (item ? item[0].length - item[1].length : 0);
      const key = m[2];
      // Any key at a SHALLOWER indent starts a new parent block, so every
      // deeper scope's history is stale and must go.
      for (const d of [...seen.keys()]) if (d > indent) seen.delete(d);
      if (!seen.has(indent)) seen.set(indent, new Map());
      const atIndent = seen.get(indent)!;
      const prev = atIndent.get(key);
      assert.equal(
        prev,
        undefined,
        `${f}: key "${key}" is defined twice in the same block (lines ${prev} and ${i + 1}) — GitHub refuses to parse the whole workflow, making every job in it undispatchable`,
      );
      atIndent.set(key, i + 1);
      // `key: |`, `key: |-`, `key: >`, `key: >-` open a literal block.
      if (/:\s*[|>][-+]?\d*\s*$/.test(line)) blockIndent = indent;
    });
  }
});
