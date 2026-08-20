import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PRICE_HISTORY = "src/lib/price-history.ts";
const DB_HISTORY = "src/lib/db-history.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Guards against a real production incident: the daily price-history snapshot
// write is best-effort (wrapped in a try/catch in price-import.ts) and can fail
// silently for days at a time — a probe-history run found the live history
// project's freshest PriceHistory row was 11 days old, yet the homepage's
// Market Pulse widget kept confidently presenting that stale snapshot as
// "today's" prices and % moves, which read as flatly wrong numbers to a
// visitor (a card showing $6.00 with a +200% badge when its real live price
// was $4.90). Root cause: ensureHistoryCards (db-history.ts) used
// createMany({ skipDuplicates: true }), which silently drops a row that
// collides with ANY unique field (not just id) — exactly what happens for a
// card whose id changed in a catalogue rebuild but whose slug/externalId still
// belongs to a stale row in the history-only Card table — so the row needed to
// satisfy PriceHistory's FK never actually got inserted, the log claimed
// success anyway (it counted rows attempted, not rows written), and the very
// next write failed its FK check. Every day. Silently.
// ─────────────────────────────────────────────────────────────────────────────

test("computePriceMovers refuses to serve movers once the freshest snapshot is stale", () => {
  const src = read(PRICE_HISTORY);
  assert.match(src, /const STALE_HISTORY_MS = 3 \* 86400_000/, "expected a 3-day staleness threshold");
  // Scoped to the movers function specifically (not just "appears somewhere in
  // the file") — find its body and assert the guard lives inside it, after the
  // row fetch, before building per-card series.
  const fnMatch = src.match(/async function computePriceMovers[\s\S]*?\n}/);
  assert.ok(fnMatch, "expected to find computePriceMovers");
  assert.match(fnMatch![0], /if \(!rows\.length\) return empty;\s*\n\s*const latestRowDay[\s\S]*?Date\.now\(\) - latestRowDay > STALE_HISTORY_MS\) return empty;/, "movers must bail out on stale data, same as the existing empty-rows guard");
});

test("computeRecentlyUpdated refuses to serve updates once the freshest snapshot is stale", () => {
  const src = read(PRICE_HISTORY);
  const fnMatch = src.match(/async function computeRecentlyUpdated[\s\S]*?\n}/);
  assert.ok(fnMatch, "expected to find computeRecentlyUpdated");
  assert.match(
    fnMatch![0],
    /const latestDay = rows\.reduce[\s\S]*?Date\.now\(\) - latestDay > STALE_HISTORY_MS\) return \[\];/,
    "recently-updated must bail out on stale data, right after computing latestDay"
  );
});

test("ensureHistoryCards upserts by id instead of createMany+skipDuplicates", () => {
  // createMany({ skipDuplicates: true }) is the exact bug: it silently skips a
  // row that collides on ANY unique column, not just id, so "we copied N rows"
  // can be a lie. upsert-by-id either creates the row this specific FK needs,
  // or throws a diagnosable error instead of a silent no-op.
  const src = read(DB_HISTORY);
  const fnMatch = src.match(/export async function ensureHistoryCards[\s\S]*?\n}/);
  assert.ok(fnMatch, "expected to find ensureHistoryCards");
  const body = fnMatch![0];
  assert.ok(!/\.createMany\(/.test(body), "ensureHistoryCards must not CALL createMany (skipDuplicates hides the bug) — mentioning it in a comment is fine");
  assert.match(body, /dbHistory\.card\.upsert\(\{\s*where:\s*\{\s*id:\s*row\.id\s*\}/, "must upsert each row by id");
  // The log must reflect what actually happened (rows inserted vs rows
  // attempted) — the original bug was logging rows.length (input size) as if
  // it were the confirmed write count.
  assert.match(body, /let inserted = 0/, "must track the real insert count, not just log the input length");
  assert.match(body, /\$\{inserted\}\/\$\{missing\.length\}/, "the log must show inserted/attempted, not claim full success unconditionally");
});
