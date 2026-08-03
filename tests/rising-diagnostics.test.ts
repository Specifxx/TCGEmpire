import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// The Rising tool reported "0 with price history" while 400 cards each HAD a
// price series — they just had 3 daily points against a MIN_POINTS of 5, so the
// qualifying filter dropped every one. The stat was labelled from `qualifying`,
// which counts cards deep enough to SCORE, not cards with any history at all.
//
// The cost of that mislabel was real: it read as "the importer is broken" and
// sent us hunting a healthy pipeline. (The underlying data gap was separate —
// the RH5→RH6 history cutover on 2026-07-31 left the old rows behind, since
// recovered with the migrate-history top-up.)
//
// These guards keep the two states distinguishable in the UI forever.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PREDICTOR = "src/lib/rise-predictor.ts";
const ADMIN = "src/app/admin/rising/page.tsx";
const PUBLIC = "src/app/tools/rising/page.tsx";

test("analysis exposes any-history and depth, not just the qualifying count", () => {
  const src = read(PREDICTOR);
  for (const field of ["withAnyHistory", "deepestSeries", "minPointsRequired"]) {
    assert.ok(src.includes(`${field}:`), `RiseAnalysis must carry ${field}`);
  }
  // Every return path has to populate them, or the UI reads undefined and the
  // empty state silently picks the wrong branch again.
  const returns = src.split("return {").length - 1;
  const withAny = src.split("withAnyHistory").length - 1;
  assert.ok(
    withAny >= returns - 1,
    `every RiseAnalysis return must set withAnyHistory (${returns} returns, ${withAny} mentions)`,
  );
});

test("withAnyHistory is derived from the series map, not the qualifying rows", () => {
  const src = read(PREDICTOR);
  assert.ok(
    src.includes("const withAnyHistory = seriesById.size"),
    "withAnyHistory must count cards with ANY series, i.e. seriesById.size",
  );
  assert.ok(
    /deepestSeries[\s\S]{0,200}seriesById\.values\(\)/.test(src),
    "deepestSeries must be measured across the actual series",
  );
});

test("no page labels the qualifying count as 'with price history'", () => {
  // The exact regression: `sub={`${analysis.qualifying} with price history`}`.
  for (const p of [ADMIN, PUBLIC]) {
    const src = read(p);
    assert.ok(
      !/qualifying\}\s*with price history/.test(src),
      `${p} must not describe the qualifying count as "with price history"`,
    );
  }
});

test("the empty state distinguishes 'nothing recorded' from 'not deep enough yet'", () => {
  for (const p of [ADMIN, PUBLIC]) {
    const src = read(p);
    assert.ok(
      src.includes("analysis.withAnyHistory"),
      `${p} empty state must branch on whether ANY history exists`,
    );
    // And when history does exist, it must say how far off the threshold is
    // rather than implying the importer is down.
    assert.ok(
      src.includes("minPointsRequired") && src.includes("deepestSeries"),
      `${p} must report the threshold and current depth`,
    );
  }
});

test("admin page no longer blames the importer when data is arriving", () => {
  const src = read(ADMIN);
  const old = "Signals appear once the daily importer has";
  assert.ok(
    !src.includes(old),
    "the unconditional 'the daily importer has recorded…' copy must not return — it was shown while the importer was working fine",
  );
});
