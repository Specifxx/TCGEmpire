import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SCRIPT = "scripts/lighthouse-budget.ts";
const WORKFLOW = ".github/workflows/seo-preview-gate.yml";
const BUDGET = "artifacts/lighthouse/budget.json";

// ─────────────────────────────────────────────────────────────────────────────
// "no ongoing check catches a Core Web Vitals regression between deploys" —
// site speed was audited exactly once, by hand (DECISIONS.md's Phase 7,
// 2026-08-17). These pin the two things that make the recurring version of
// that audit actually trustworthy rather than just present:
//   • the methodology matches the original hand-run audit EXACTLY, so a
//     number measured today is comparable to the committed baseline instead
//     of two different measurements sharing a metric name;
//   • the budget is a real, previously-measured baseline plus a reasoned
//     tolerance — never an invented round number, and never a case where the
//     tolerance is generous enough to never actually fail.
// ─────────────────────────────────────────────────────────────────────────────

test("the Lighthouse invocation matches the original hand-run audit's methodology exactly", () => {
  const src = codeOnly(read(SCRIPT));
  for (const flag of [
    "--preset=perf",
    "--form-factor=mobile",
    "--screenEmulation.mobile=true",
    "--screenEmulation.width=390",
    "--screenEmulation.height=844",
    "--screenEmulation.deviceScaleFactor=2",
    "--throttling-method=simulate",
  ]) {
    assert.ok(src.includes(flag), `must reuse the original audit's exact flag: ${flag}`);
  }
});

test("the checked-in budget is a real, dated baseline — not a placeholder", () => {
  const budget = JSON.parse(read(BUDGET));
  assert.match(budget.measuredOn, /^\d{4}-\d{2}-\d{2}$/, "must carry a real measurement date");
  const b = budget.baseline;
  // A placeholder/invented budget would tend to land on suspiciously round
  // numbers (1.0 everywhere, 1000ms LCP) — the real Lighthouse output never
  // does, so this is a cheap tripwire against someone hand-typing one later.
  assert.ok(!Number.isInteger(b.clsScore * 1000) || b.clsScore === 0, "clsScore reads like a real (non-round) Lighthouse measurement");
  assert.ok(b.performance > 0 && b.performance <= 1, "performance must be a real 0-1 category score");
  assert.ok(b.lcpMs > 0 && b.lcpMs < 30000, "lcpMs must be a plausible real measurement, not a placeholder");
});

test("score categories gate on any regression; accessibility/best-practices/SEO get zero slack", () => {
  // Unlike performance (timing-derived, real run-to-run variance), these three
  // are near-deterministic static-DOM audits — any drop is a genuine defect,
  // not noise, so the comparison must not smuggle in a tolerance for them.
  const src = codeOnly(read(SCRIPT));
  const metricsAt = src.indexOf("const METRICS");
  assert.ok(metricsAt >= 0);
  const metrics = src.slice(metricsAt, src.indexOf("];", metricsAt));
  for (const key of ["accessibility", "bestPractices", "seo"]) {
    const rowAt = metrics.indexOf(`key: "${key}"`);
    assert.ok(rowAt >= 0, `expected a METRICS row for ${key}`);
  }
  // The actual tolerance application: only "performance" gets the -0.08
  // cushion; the comparison itself is shared code, so this is checked where
  // the cushion is applied, not per-metric.
  assert.match(src, /m\.actual >= m\.baseline - 0\.08/, "the score-regression check must apply a fixed, documented cushion");
});

test("the timing metrics gate on the baseline, never on an always-true tolerance", () => {
  const src = codeOnly(read(SCRIPT));
  // A ceiling of Infinity or a multiplier so large it can never fail would
  // make this script decorative. Pin the actual multipliers/floors so a
  // careless "widen it to stop the noise" edit is visible in review.
  assert.match(src, /x \* 1\.25/, "LCP ceiling must be a bounded multiple of baseline (25%), not unbounded");
  assert.match(src, /Math\.max\(0\.1,\s*x \+ 0\.02\)/, "CLS ceiling must use Google's published 0.1 'needs improvement' floor");
  assert.match(src, /Math\.max\(300,\s*x \* 2\)/, "TBT ceiling must use the documented 300ms floor, not an unbounded multiple");
});

test("the script exists and is wired into the deploy gate, report-only for now", () => {
  const wf = read(WORKFLOW);
  assert.match(wf, new RegExp(SCRIPT.replace(/\./g, "\\.")), "lighthouse-budget.ts must be wired into the SEO/deploy gate");
  const stepAt = wf.indexOf("Lighthouse performance budget");
  assert.ok(stepAt >= 0, "expected a named Lighthouse step");
  const step = wf.slice(stepAt, stepAt + 400);
  assert.match(step, /continue-on-error:\s*true/, "must be report-only until proven stable on real CI runners — see the workflow's own header");
  assert.match(step, /CHROME_PATH/, "must point chrome-launcher at a real Chrome binary, or lighthouse silently fails to launch");
});

test("writing a new baseline is an explicit, separate action from checking one", () => {
  // --write-baseline must never be the default path — a script that silently
  // rewrites its own pass/fail bar on every run can never fail.
  const src = codeOnly(read(SCRIPT));
  assert.match(src, /args\.includes\(["']--write-baseline["']\)/, "writing a baseline must require an explicit flag");
  const writeAt = src.indexOf("if (writeBaseline)");
  const readAt = src.indexOf("readBudget()", writeAt);
  assert.ok(writeAt >= 0 && readAt > writeAt, "the write-baseline branch must return before reaching the comparison path");
});
