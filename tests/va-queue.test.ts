import test from "node:test";
import assert from "node:assert/strict";

// 2026-11-19: top_seen read 0 in Vercel. track() calls window.va?.(…), which does not exist until <Analytics /> mounts after the
// consent check, so an event sent on mount was dropped. trackEvent now sets up the library's own queue first.
test("an event sent before Vercel's script exists is queued, not dropped", async () => {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  g.window = {};
  const { vaQueue } = await import("../src/lib/analytics");
  vaQueue();
  const w = g.window as { va: (...a: unknown[]) => void; vaq?: unknown[][] };
  w.va("event", { name: "top_seen" });
  assert.deepEqual(w.vaq, [["event", { name: "top_seen" }]]);
  const before = w.va;
  vaQueue();
  assert.equal(w.va, before, "an existing va (the script's own) is never replaced");
  delete g.window;
});
