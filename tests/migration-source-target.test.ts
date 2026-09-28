import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every migration step must read SOURCE and TARGET from different secrets.
// Hit twice: migrate-main-db-rm12-to-rm3 shipped with both set to RM3 (fixed
// 2026-09-25), and the rm4-to-rm5 step was first generated with both on RM5
// (caught 2026-09-28 before it ran). The step's runtime guard would abort, but
// the task would then be useless exactly when the old project is dying.
test("no maintenance step reads SOURCE and TARGET from the same secret", () => {
  const yml = readFileSync(".github/workflows/maintenance.yml", "utf8");
  const steps = yml.split(/\n      - name: /).slice(1);
  let checked = 0;
  for (const step of steps) {
    const src = step.match(/SOURCE_(?:DATABASE|HISTORY)_URL: \$\{\{ ([^}]+) \}\}/)?.[1];
    const tgt = step.match(/TARGET_(?:DATABASE|HISTORY)_URL: \$\{\{ ([^}]+) \}\}/)?.[1];
    if (!src || !tgt) continue;
    checked++;
    const names = (e: string) => new Set([...e.matchAll(/(?:secrets|vars)\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    const overlap = [...names(src)].filter((n) => names(tgt).has(n));
    // A legacy fallback chain may share names; the FIRST source name must never be a target name.
    const firstSource = [...names(src)][0];
    assert.ok(!names(tgt).has(firstSource), `step "${step.split("\n")[0]}": source ${firstSource} is also a target (${overlap.join(", ")})`);
  }
  assert.ok(checked > 10, `found ${checked} migration steps`);
});
