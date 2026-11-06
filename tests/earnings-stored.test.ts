import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapLimit } from "../src/lib/earnings/core";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// 2026-11-06 (owner: "admin/earnings now takes 10 minutes to load"). DECISIONS.md,
// "The earnings dashboard reads a stored copy".

test("mapLimit keeps input order and never runs more than the limit at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([5, 1, 4, 2, 3, 0], 3, async (n, i) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n * 3));
    inFlight--;
    return `${i}:${n}`;
  });
  assert.deepEqual(out, ["0:5", "1:1", "2:4", "3:2", "4:3", "5:0"]);
  assert.ok(peak <= 3 && peak > 1, `peak ${peak}`);
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
});

test("mapLimit rejects when one item fails", async () => {
  await assert.rejects(mapLimit([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom");
    return n;
  }), /boom/);
});

test("the dashboard reads the stored copy; only Refresh and the cron ask the APIs", () => {
  const src = read("src/lib/earnings/sources.ts");
  assert.match(src, /readStored<SourceResult>\(STORED_SOURCES\)/);
  assert.match(src, /if \(!fresh && kept && Array\.isArray\(kept\.days\)\) return/);
  // No API window walk is sequential again.
  assert.doesNotMatch(src, /for \(const \[from, to\] of windows\(/);
  assert.doesNotMatch(read("src/lib/earnings/costs.ts"), /for \(const \[\w+, \w+\] of windows\(/);
  const cron = read("src/app/api/cron/earnings-refresh/route.ts");
  assert.match(cron, /loadEarnings\(true\)/);
  assert.match(cron, /loadCosts\(true\)/);
  assert.match(cron, /CRON_SECRET/);
  const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
  assert.deepEqual(crons.filter((c) => c.path === "/api/cron/earnings-refresh").map((c) => c.schedule), ["40 */3 * * *"]);
});
