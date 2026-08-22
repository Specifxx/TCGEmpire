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
