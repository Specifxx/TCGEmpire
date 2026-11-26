import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// DECISIONS.md 2026-11-26 "Stray files stay out of pull requests".
const live = (p: string) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

test("the scan evals never push to the branch that triggered them", () => {
  for (const f of [".github/workflows/scan-eval.yml", ".github/workflows/singles-scan-eval.yml"]) {
    const wf = live(f);
    assert.doesNotMatch(wf, /HEAD:\$\{?\{?\s*(GITHUB_REF_NAME|github\.ref_name|github\.head_ref)/, f);
    assert.match(wf, /HEAD:refs\/heads\/scan-eval-results/, f);
  }
});

test("the stray-paths guard refuses research, probe and eval output, and keeps deletions allowed", () => {
  const wf = live(".github/workflows/stray-paths.yml");
  assert.match(wf, /pull_request:/);
  assert.match(wf, /select\(\.status != "removed"\)/);
  const deny = wf.match(/deny='([^']+)'/)?.[1];
  assert.ok(deny, "deny pattern");
  const files = [
    "research/eu-shop-directory.json",
    "probe/results.json",
    "scripts/scan-eval/results/summary.md",
    "scripts/scan-eval/results-singles/pokemon.json",
    "qa-state.json",
    "repo.bundle",
    ".env.local",
    "src/lib/match.ts",
    "scripts/scan-eval/run.ts",
    ".env.example",
    "docs/research-notes.md",
  ];
  const hits = execSync(`grep -E '${deny}' | grep -vE '\\.env\\.example$' || true`, { input: files.join("\n") + "\n" })
    .toString()
    .trim()
    .split("\n");
  assert.deepEqual(hits, files.slice(0, 7));
});
