import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tagLintProblems } from "../src/lib/tag-lint";

test("every eBay and TCGplayer link builder is tagged in every market, and no bare link is hard-coded", () => {
  assert.deepEqual(tagLintProblems(), []);
});

test("the build runs the tag lint first", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts.build, /^tsx scripts\/tag-lint\.ts && /);
});
