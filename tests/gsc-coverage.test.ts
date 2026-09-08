import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const WORKFLOW = ".github/workflows/gsc-coverage.yml";

// ─────────────────────────────────────────────────────────────────────────────
// "research keywords... ask your last five customers what they searched" —
// gsc-coverage.yml already pulls real Search Console query data daily but,
// before this, did nothing with it beyond a top-10 list: no consumer turned
// it into a prioritized content backlog. This adds a "content opportunities"
// section — real queries with real impressions that aren't converting well
// (weak ranking position, or CTR well under the position they DO rank at) —
// which is the site's own real search-demand data doing the job that Reddit
// advice was reaching for. These pin the workflow is still valid inline JS,
// the opportunity math behaves as designed against synthetic rows (this
// script has no live GSC credentials available to test against — see the
// workflow's own "until then this workflow no-ops" note), and the section is
// actually wired into the emitted output.
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the `node <<'JS' ... JS` heredoc body out of the workflow's run: block. */
function extractEmbeddedScript(): string {
  const wf = read(WORKFLOW);
  const m = /node <<'JS'\n([\s\S]*?)\n {10}JS\n/.exec(wf);
  assert.ok(m, "expected a `node <<'JS'` heredoc in the workflow");
  // De-indent by the heredoc's own 10-space YAML indentation.
  return m![1]
    .split("\n")
    .map((l) => (l.startsWith(" ".repeat(10)) ? l.slice(10) : l))
    .join("\n");
}

test("the embedded GSC script is still valid, syntactically-checkable JavaScript", () => {
  const js = extractEmbeddedScript();
  const dir = mkdtempSync(join(tmpdir(), "gsc-check-"));
  const file = join(dir, "gsc.js");
  writeFileSync(file, js);
  // Throws (and fails the test) on a syntax error; a heredoc embedded in YAML
  // has no other build step to catch one before it ships.
  execFileSync(process.execPath, ["--check", file]);
});

test("the wider query pull exists, separate from the top-10 list, for the opportunity section", () => {
  const js = extractEmbeddedScript();
  assert.match(js, /byQueryFull\s*=\s*await q\(at,\{startDate:start,endDate:end,dimensions:\["query"\],rowLimit:250\}\)/,
    "expected a wider (250-row) query pull distinct from the top-10 byQuery fetch");
});

test("the opportunity heuristic is documented as approximate, not presented as exact", () => {
  const wf = read(WORKFLOW);
  assert.ok(wf.includes("Content opportunities"), "expected the content-opportunities section");
  assert.match(wf, /APPROXIMATE[\s\S]{0,20}industry averages, not an exact model/, "the CTR-by-position benchmark must be labelled approximate, not fact");
  assert.match(wf, /LEADS to investigate[\s\S]{0,120}not certainties/, "the section must be framed as leads, not settled conclusions");
});

test("the opportunity math correctly separates weak-ranking and low-CTR queries from queries that are already working", () => {
  // Runs the ACTUAL extracted opportunity logic (not a reimplementation)
  // against synthetic rows, so a future edit to the real thresholds is
  // caught here rather than only in production the next time it runs.
  const js = extractEmbeddedScript();
  const filterAt = js.indexOf("const MIN_IMPR");
  const sliceEndAt = js.indexOf(".slice(0, 20);", filterAt);
  assert.ok(filterAt >= 0 && sliceEndAt > filterAt, "expected the opportunity filter/map/sort pipeline");
  const logic = js.slice(filterAt, sliceEndAt + ".slice(0, 20);".length);

  const rows = [
    // Ranks #1 with a strong CTR — already working, must not be flagged.
    { keys: ["riftbound card prices"], impressions: 500, clicks: 150, ctr: 0.3, position: 1.0 },
    // Real demand, but buried on page 2 — a genuine weak-ranking opportunity.
    { keys: ["best rengar deck riftbound"], impressions: 80, clicks: 1, ctr: 0.0125, position: 15.0 },
    // Ranks #4 but converts far below what #4 should — a genuine low-CTR opportunity.
    { keys: ["cheapest riftbound booster box"], impressions: 200, clicks: 4, ctr: 0.02, position: 4.0 },
    // Below the impression floor — must be excluded even with a terrible position.
    { keys: ["obscure long tail query"], impressions: 5, clicks: 0, ctr: 0, position: 20.0 },
  ];

  const harness = `
    const byQueryFull = { rows: ${JSON.stringify(rows)} };
    ${logic}
    console.log(JSON.stringify(opportunities.map(o => o.query)));
  `;
  const dir = mkdtempSync(join(tmpdir(), "gsc-opp-"));
  const file = join(dir, "harness.js");
  writeFileSync(file, harness);
  const out = execFileSync(process.execPath, [file], { encoding: "utf8" });
  const flagged: string[] = JSON.parse(out);

  assert.ok(flagged.includes("best rengar deck riftbound"), "a real-demand query stuck on page 2 must be flagged");
  assert.ok(flagged.includes("cheapest riftbound booster box"), "a top-10 query converting far below its position's norm must be flagged");
  assert.ok(!flagged.includes("riftbound card prices"), "a query already ranking #1 with a strong CTR must not be flagged");
  assert.ok(!flagged.includes("obscure long tail query"), "a query under the impression floor must be excluded regardless of position");
});
