import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Rising Sealed said "Signals are still building" for weeks because every
// history cutover dumped Card/ClickEvent/PriceHistory and left
// SealedPriceHistory behind: nine projects held ONE sealed snapshot each.
// DECISIONS.md, "Rising Sealed: the history that every rotation dropped",
// 2026-09-24.
const wf = readFileSync(join(process.cwd(), ".github/workflows/maintenance.yml"), "utf8");

function step(name: string): string {
  const i = wf.indexOf(name);
  assert.ok(i >= 0, name);
  return wf.slice(i, wf.indexOf("      - name:", i + 10));
}

test("the current and next history cutovers carry SealedPriceHistory: dump, truncate and restore", () => {
  for (const name of [
    "Migrate the HISTORY database (HISTORY_DATABASE_URL_2 → HISTORY_DATABASE_URL_3) — 2026-09-22 cutover",
    "Migrate the HISTORY database (HISTORY_DATABASE_URL_3 → HISTORY_DATABASE_URL_4) via pg_dump/pg_restore",
  ]) {
    const s = step(name);
    assert.match(s, /-t 'public\."SealedPriceHistory"'/, `${name}: dump`);
    assert.match(s, /TRUNCATE [^;]*public\."SealedPriceHistory"/, `${name}: truncate`);
    assert.match(s, /pg_restore [^\n]*-t 'SealedPriceHistory'/, `${name}: restore`);
  }
});

test("the consolidation is additive and idempotent", () => {
  const src = readFileSync(join(process.cwd(), "scripts/consolidate-sealed-history.ts"), "utf8");
  assert.match(src, /createMany\(\{ data: rows, skipDuplicates: true \}\)/);
  assert.doesNotMatch(src, /deleteMany|TRUNCATE/);
  assert.match(step("Consolidate sealed price history into the live history project"), /scripts\/consolidate-sealed-history\.ts/);
});
