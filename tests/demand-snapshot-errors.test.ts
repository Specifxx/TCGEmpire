import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// A failed demand read must never be CACHED as "no demand" (2026-09-25).
//
// lib/demand-snapshot.ts's readers are guarded: on any error they return an
// empty Map, 0, or an empty window. That is right for a page that merely shows
// demand, and a trap inside an unstable_cache callback, which stores whatever
// the callback returns. Two callbacks called them:
//   • computeRiseInputs (Rising Cards' day-keyed inputs) — one blip cached "no
//     velocity" for the day: the strongest ranking signal silently dropped out
//     and /admin/rising said "warming up — 0 days";
//   • computeTopDemand (the /movers "Most searched this week" strip, the
//     /tools/demand redirect target) — an empty window fell back to an
//     all-time ranking with windowUsable:false, cached, and the strip vanished
//     for the day.
// Both now use *OrThrow readers and catch OUTSIDE their caches; the guarded
// velocity and day-count forms had no other caller and are gone. These pins are
// structural because the functions under test talk to Postgres, and no test in
// this repo may reach a database.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const body = (src: string, fn: string) => {
  const at = src.search(new RegExp(`(?:export )?async function ${fn}\\(`));
  assert.ok(at >= 0, `expected function ${fn}`);
  const end = src.indexOf("\n}\n", at);
  return src.slice(at, end < 0 ? undefined : end + 2);
};

const SNAP = code(read("src/lib/demand-snapshot.ts"));

test("each demand reader has a throwing variant with no catch in it", () => {
  for (const fn of ["getDemandVelocityOrThrow", "getDemandWindowOrThrow", "demandSnapshotDaysOrThrow"]) {
    assert.doesNotMatch(body(SNAP, fn), /\bcatch\b/, `${fn} must let a failed read reject`);
  }
  // The window's own day count goes through the throwing form too — otherwise
  // a failed COUNT would still read as "no snapshots yet" inside the window.
  assert.match(body(SNAP, "getDemandWindowOrThrow"), /await demandSnapshotDaysOrThrow\(\)/);
});

test("only the display-only window read keeps a guarded form, and it wraps the throwing one", () => {
  const b = body(SNAP, "getDemandWindow");
  assert.match(b, /try \{\s*return await getDemandWindowOrThrow\(/, "getDemandWindow must delegate to getDemandWindowOrThrow");
  assert.match(b, /\bcatch\b/, "the uncached /admin/demand leaderboard degrades instead of failing");
  // No swallowing form of the two reads a cache callback needs is left to reach for.
  assert.doesNotMatch(SNAP, /export async function getDemandVelocity\(|export async function demandSnapshotDays\(/);
});

test("Rising Cards' cached inputs use the throwing readers", () => {
  const inputs = body(code(read("src/lib/rise-predictor.ts")), "computeRiseInputs");
  assert.match(inputs, /getDemandVelocityOrThrow\(ids\)/);
  assert.match(inputs, /demandSnapshotDaysOrThrow\(\)/);
  assert.doesNotMatch(inputs, /\bgetDemandVelocity\(|\bdemandSnapshotDays\(/, "a guarded read inside the cache callback would cache its empty fallback");
  assert.doesNotMatch(inputs, /\bcatch\b/);
});

test("the Most-searched ranking's cached callback uses the throwing window read", () => {
  const demand = code(read("src/lib/demand.ts"));
  const compute = body(demand, "computeTopDemand");
  assert.match(compute, /await getDemandWindowOrThrow\(days\)/);
  assert.doesNotMatch(compute, /\bgetDemandWindow\(/, "the guarded window would turn a failure into a cached all-time fallback");
  assert.match(compute, /catch \(err\) \{[\s\S]{0,160}throw err;/, "and anything that does fail is rethrown, not stored");
  assert.doesNotMatch(demand, /import \{[^}]*\bgetDemandWindow\b[^}]*\} from "\.\/demand-snapshot"/);
});
