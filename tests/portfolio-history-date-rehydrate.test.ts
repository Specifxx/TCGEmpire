import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/lib/premium.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Live /portfolio crash (2026-09-01), confirmed from the actual Vercel error:
// "TypeError: t.day.getTime is not a function". portfolioHistory() wraps its
// Prisma read in unstable_cache, whose return value is persisted as JSON — a
// real Date survives a cache MISS untouched, but a cache HIT replays it through
// a JSON round-trip first, which serialises Date -> ISO string with no way back
// (a plain string doesn't turn back into a Date on the way out). The `day: Date`
// return type is only true on a miss, so nothing caught this at compile time —
// getPortfolio's `h.day.getTime()` trusted a type that a warm cache silently
// broke. Pin the fix: re-hydrate `day` back into a real Date at the one place
// this cache is read, so it's true unconditionally rather than needing every
// future caller to remember the cache can lie.
// ─────────────────────────────────────────────────────────────────────────────

test("portfolioHistory re-hydrates `day` into a real Date after the cache read", () => {
  const code = codeOnly(read(SRC));
  const fnStart = code.indexOf("function portfolioHistory(");
  assert.ok(fnStart >= 0, "expected to find portfolioHistory");
  const fn = code.slice(fnStart, code.indexOf("\n}", fnStart) + 2);

  assert.match(fn, /unstable_cache/, "must still be the cached read");
  assert.match(
    fn,
    /\.then\(\(rows\)\s*=>\s*rows\.map\(\(r\)\s*=>\s*\(\{\s*\.\.\.r,\s*day:\s*new Date\(r\.day\)\s*\}\)\)\)/,
    "must re-wrap every row's day in `new Date(...)` after unstable_cache resolves"
  );
});

test("new Date(...) is safe whether the source is already a Date or a JSON-round-tripped string", () => {
  // Not a source-reading check — this is the actual runtime behaviour the fix
  // depends on: `new Date(x)` must produce an equivalent, valid Date for BOTH
  // representations unstable_cache can hand back.
  const real = new Date("2026-08-31T00:00:00.000Z");
  const asJson = JSON.parse(JSON.stringify({ day: real })).day; // what a cache hit hands back
  assert.equal(typeof asJson, "string", "sanity check: JSON round-tripping a Date really does produce a string");
  assert.equal(new Date(real).getTime(), real.getTime(), "re-wrapping an already-real Date must not change it");
  assert.equal(new Date(asJson).getTime(), real.getTime(), "re-wrapping the JSON string must recover the same instant");
});
