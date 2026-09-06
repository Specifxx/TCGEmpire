import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/lib/premium.ts";

// ─────────────────────────────────────────────────────────────────────────────
// A live /portfolio crash (2026-09-01): CollectionCard.card is a required
// relation, but a stale cardId that no longer resolves — a database restore or
// migration that didn't carry every row across in lockstep, or a card removed
// some other way — means Prisma's non-null type for `card` can still lie at
// runtime. getPortfolio() used to map straight over every row and dereference
// `r.card.name` etc. unconditionally, so ONE bad row 500'd the entire page for
// every other holding the visitor had. Pin the fix: filter before use.
// ─────────────────────────────────────────────────────────────────────────────

test("getPortfolio filters out rows whose Card relation didn't resolve, before using them", () => {
  const code = codeOnly(read(SRC));
  const fnStart = code.indexOf("export async function getPortfolio");
  assert.ok(fnStart >= 0, "expected to find getPortfolio");
  const fn = code.slice(fnStart, code.indexOf("\nexport ", fnStart + 1));

  assert.match(fn, /const validRows\s*=\s*rows\.filter\(\(r\)\s*=>\s*r\.card\s*!=\s*null\)/, "must filter rows with a missing card before use");

  // Every downstream consumer (cardIds, the holdings map, the daily-series
  // loop) must read the FILTERED list, not the raw one — filtering rows and
  // then still mapping over the original `rows` would defeat the guard.
  assert.doesNotMatch(fn, /\brows\.map\(/, "the holdings map must not iterate the unfiltered rows");
  assert.doesNotMatch(fn, /for \(const r of rows\)/, "the daily-series loop must not iterate the unfiltered rows");
  assert.match(fn, /validRows\.map\(/, "the holdings map must iterate validRows");
  assert.match(fn, /for \(const r of validRows\)/, "the daily-series loop must iterate validRows");
});
