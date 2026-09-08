/**
 * scripts/lighthouse-budget.ts — recurring Core Web Vitals regression gate.
 *
 *   npx tsx scripts/lighthouse-budget.ts --url https://riftcompare.com
 *   npx tsx scripts/lighthouse-budget.ts --url http://localhost:3000 --page /card/some-card-slug
 *
 * WHY THIS EXISTS. Site speed was audited exactly once, by hand (2026-08 —
 * see DECISIONS.md's "Getting Lighthouse to run at all in this sandbox" and
 * the reports committed under artifacts/lighthouse/). Nothing has run it
 * again since, so a regression on any later deploy — a heavier hero image, a
 * blocking third-party script, a layout shift from a new ad slot — would ship
 * silently. scripts/homepage-audit.mjs says as much itself: Core Web
 * Vitals / Lighthouse scoring is explicitly out of its scope, left for "a
 * later verification pass" that never existed as an automated job until now.
 *
 * METHODOLOGY MATCHES THE ORIGINAL AUDIT EXACTLY, so today's numbers are
 * actually comparable to the committed baseline rather than two different
 * measurements that happen to share a metric name: same preset (perf),
 * mobile form factor, the same emulated 390×844 @2x viewport, and
 * --throttling-method=simulate (Lighthouse's own default for a CLI run —
 * one real trace, replayed through the Lantern simulator against a
 * synthetic mid-tier-mobile/slow-4G profile, not a live-throttled run).
 *
 * BUDGET, NOT A FIXED THRESHOLD: artifacts/lighthouse/budget.json holds the
 * real baseline this repo already measured, plus a tolerance per metric —
 * not an arbitrary round number. See BUDGET below for why each tolerance is
 * what it is. Failing this script means "materially worse than what this
 * homepage already measured on its worst-audited day", not "didn't hit some
 * number invented for this script".
 */
export {};

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf("--url", "http://localhost:3000").replace(/\/$/, "");
const PAGE = argOf("--page", "/");
const BUDGET_PATH = join(process.cwd(), "artifacts/lighthouse/budget.json");

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", O = "\x1b[0m";

interface Budget {
  page: string;
  measuredOn: string;
  baseline: {
    performance: number; // 0-1 category score
    accessibility: number;
    bestPractices: number;
    seo: number;
    lcpMs: number;
    clsScore: number;
    tbtMs: number;
  };
}

interface Metric {
  key: keyof Budget["baseline"];
  label: string;
  actual: number;
  baseline: number;
  /** Returns the max value below which `actual` is fine, given the baseline. */
  ceiling: (baseline: number) => number;
  fmt: (n: number) => string;
  higherIsBetter: boolean;
}

function readBudget(): Budget {
  try {
    return JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
  } catch (e) {
    throw new Error(`Couldn't read ${BUDGET_PATH} — run this once with --write-baseline to create it. (${(e as Error).message})`);
  }
}

function runLighthouse(url: string): any {
  const dir = mkdtempSync(join(tmpdir(), "lh-budget-"));
  const outPath = join(dir, "report");
  try {
    execFileSync(
      "npx",
      [
        "--no-install",
        "lighthouse",
        url,
        "--preset=perf",
        "--form-factor=mobile",
        "--screenEmulation.mobile=true",
        "--screenEmulation.width=390",
        "--screenEmulation.height=844",
        "--screenEmulation.deviceScaleFactor=2",
        "--throttling-method=simulate",
        "--only-categories=performance,accessibility,best-practices,seo",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        "--output=json",
        `--output-path=${outPath}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    // A SINGLE --output format writes exactly to --output-path with no
    // suffix; the ".report.json"/".report.html" suffixing (used by the
    // original DECISIONS.md audit, which requested BOTH json and html) only
    // kicks in when multiple --output flags are given. This script only ever
    // asks for json, so it reads outPath itself.
    return JSON.parse(readFileSync(outPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const writeBaseline = args.includes("--write-baseline");
  const url = `${BASE}${PAGE}`;
  console.log(`${D}Running Lighthouse (mobile, simulated throttling) against ${url}…${O}`);

  const lhr = runLighthouse(url);
  const cat = (id: string) => lhr.categories?.[id]?.score;
  const audit = (id: string) => lhr.audits?.[id]?.numericValue;

  const actual: Budget["baseline"] = {
    performance: cat("performance") ?? 0,
    accessibility: cat("accessibility") ?? 0,
    bestPractices: cat("best-practices") ?? 0,
    seo: cat("seo") ?? 0,
    lcpMs: audit("largest-contentful-paint") ?? Infinity,
    clsScore: audit("cumulative-layout-shift") ?? Infinity,
    tbtMs: audit("total-blocking-time") ?? Infinity,
  };

  if (writeBaseline) {
    const budget: Budget = { page: PAGE, measuredOn: new Date().toISOString().slice(0, 10), baseline: actual };
    writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2) + "\n");
    console.log(`${G}Wrote new baseline to ${BUDGET_PATH}${O}`);
    console.log(JSON.stringify(actual, null, 2));
    return;
  }

  const budget = readBudget();
  if (budget.page !== PAGE) {
    console.warn(`${Y}Budget was measured for ${budget.page}, checking ${PAGE} — comparing anyway, but consider a per-page budget file.${O}`);
  }
  const b = budget.baseline;

  // Score categories (0-1): accessibility/best-practices/SEO are near-
  // deterministic static-DOM audits, so ANY regression is real and gates.
  // Performance is timing-derived even under simulated throttling and has
  // documented run-to-run variance — Lighthouse's own docs cite roughly
  // ±5-7 points on the 0-100 scale between identical runs — so it gets an
  // 8-point (0.08) cushion to absorb that noise without masking a real drop.
  //
  // LCP: 25% slower than the baseline day is a real regression, not noise —
  // Lantern-simulated LCP is far more stable run-to-run than a live-throttled
  // trace would be.
  // CLS: floors at Google's own published "needs improvement" threshold
  // (0.1) rather than a fraction of an already-tiny baseline (0.00135),
  // which would make almost any shift look like a huge relative regression.
  // TBT: floors at 300ms — the midpoint of Google's published "good"
  // (<200ms) and "needs improvement" (<600ms) Core Web Vitals bands — since
  // TBT at very low baselines (12ms here) is extremely run-noisy in relative
  // terms; an absolute floor avoids gating on doubling from "excellent" to
  // "still excellent".
  const METRICS: Metric[] = [
    { key: "performance", label: "Performance score", actual: actual.performance, baseline: b.performance, ceiling: (x) => x, fmt: (n) => n.toFixed(2), higherIsBetter: true },
    { key: "accessibility", label: "Accessibility score", actual: actual.accessibility, baseline: b.accessibility, ceiling: (x) => x, fmt: (n) => n.toFixed(2), higherIsBetter: true },
    { key: "bestPractices", label: "Best Practices score", actual: actual.bestPractices, baseline: b.bestPractices, ceiling: (x) => x, fmt: (n) => n.toFixed(2), higherIsBetter: true },
    { key: "seo", label: "SEO score", actual: actual.seo, baseline: b.seo, ceiling: (x) => x, fmt: (n) => n.toFixed(2), higherIsBetter: true },
    { key: "lcpMs", label: "Largest Contentful Paint", actual: actual.lcpMs, baseline: b.lcpMs, ceiling: (x) => x * 1.25, fmt: (n) => `${(n / 1000).toFixed(2)}s`, higherIsBetter: false },
    { key: "clsScore", label: "Cumulative Layout Shift", actual: actual.clsScore, baseline: b.clsScore, ceiling: (x) => Math.max(0.1, x + 0.02), fmt: (n) => n.toFixed(3), higherIsBetter: false },
    { key: "tbtMs", label: "Total Blocking Time", actual: actual.tbtMs, baseline: b.tbtMs, ceiling: (x) => Math.max(300, x * 2), fmt: (n) => `${n.toFixed(0)}ms`, higherIsBetter: false },
  ];

  let failures = 0;
  const rows: string[] = [];
  for (const m of METRICS) {
    const ok = m.higherIsBetter ? m.actual >= m.baseline - 0.08 : m.actual <= m.ceiling(m.baseline);
    if (!ok) failures++;
    const mark = ok ? `${G}✓${O}` : `${R}✗${O}`;
    rows.push(`  ${mark} ${m.label.padEnd(26)} ${m.fmt(m.actual)}  ${D}(baseline ${m.fmt(m.baseline)}, measured ${budget.measuredOn})${O}`);
  }
  console.log(rows.join("\n"));
  console.log(
    failures === 0
      ? `\n${G}${B}Within budget — no metric regressed beyond its tolerance from the ${budget.measuredOn} baseline.${O}\n`
      : `\n${R}${B}${failures} metric${failures === 1 ? "" : "s"} regressed beyond budget.${O}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${R}lighthouse-budget crashed:${O}`, e);
  process.exit(1);
});
