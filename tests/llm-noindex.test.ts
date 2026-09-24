import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /llm/* stays fetchable for AI agents but leaves the index (2026-09-24):
// 169 were "crawled – not indexed" duplicates of the card pages they mirror.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("every /llm/* response carries X-Robots-Tag: noindex", async () => {
  const config = (await import("../next.config.js")).default as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const rules = await config.headers();
  const llm = rules.find((r) => r.source === "/llm/:path*");
  assert.ok(llm, "expected a /llm/:path* header rule");
  assert.deepEqual(llm!.headers, [{ key: "X-Robots-Tag", value: "noindex" }]);
});

test("…and is NOT disallowed in robots.txt, so bots can still fetch it", () => {
  assert.doesNotMatch(read("src/app/robots.ts"), /disallow:[^\n]*\/llm/i);
});
