// The daily Search Console demand export for sister sites (scripts/sister-demand-export.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregate, SITES } from "../scripts/sister-demand-export.mjs";

test("page rows fold into one entry per path, with an impression-weighted position", () => {
  const out: Record<string, number[]> = aggregate([
    { keys: ["https://compareempire.com/phones/apple-iphone-17/"], clicks: 1, impressions: 10, position: 10 },
    { keys: ["https://compareempire.com/phones/apple-iphone-17#prices"], clicks: 0, impressions: 30, position: 20 },
    { keys: ["https://compareempire.com/"], clicks: 5, impressions: 5, position: 2 },
    { keys: ["not a url"], clicks: 9, impressions: 9, position: 1 },
  ]);
  assert.deepEqual(out["/phones/apple-iphone-17"], [1, 40, 17.5]);
  assert.deepEqual(out["/"], [5, 5, 2]);
  assert.equal(Object.keys(out).length, 2);
});

test("writes only aggregate page numbers, only to the demand branch, and is watched", () => {
  const src = readFileSync("scripts/sister-demand-export.mjs", "utf8");
  assert.match(src, /const BRANCH = "demand";/);
  assert.match(src, /dimensions: \["page"\]/);
  assert.doesNotMatch(src, /dimensions: \[[^\]]*"query"/, "never exports search queries");
  for (const s of SITES) assert.match(s.repo, /^Specifxx\//);
  assert.match(readFileSync("src/lib/ops/checks.ts", "utf8"), /file: "sister-demand\.yml"/);
});
