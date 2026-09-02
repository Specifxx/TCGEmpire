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
  // The threshold MUST outlast one snapshot cycle, or the feature switches itself
  // off during normal operation. Asserting a literal "3 days" encoded the old
  // daily cadence: once writes went weekly, a 3-day threshold would have judged
  // every healthy week stale and silently returned empty movers forever.
  //
  // So assert the relationship, not the number — this stays correct whatever the
  // cadence becomes, and still fails if someone sets a threshold that cannot
  // survive its own write interval.
  const staleMatch = /const STALE_HISTORY_MS = (\d+) \* 86400_000/.exec(src);
  assert.ok(staleMatch, "expected STALE_HISTORY_MS in days");
  const staleDays = Number(staleMatch![1]);
  // Canonical home is price-history.ts itself (2026-09-02) — shared with
  // sealed-import.ts's own weekly writer; price-import.ts now imports it
  // rather than defining it locally (see that constant's own comment for why:
  // price-import.ts already imports FROM sealed-import.ts, so defining this
  // in either writer would have closed a real import cycle).
  const intervalMatch = /export const HISTORY_MIN_INTERVAL_DAYS = (\d+)/.exec(src);
  assert.ok(intervalMatch, "expected HISTORY_MIN_INTERVAL_DAYS in price-history.ts");
  const interval = Number(intervalMatch![1]);
  assert.ok(
    staleDays > interval,
    `STALE_HISTORY_MS is ${staleDays} days but snapshots are written every ${interval} — a healthy week would read as stale and movers would silently vanish`,
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// The SECOND act of the same incident. Switching to upsert-by-id made the bug
// visible but not fixed: Card also has unique `slug` and `externalId`, so a
// stale row holding this card's slug under a different id makes the CREATE half
// of the upsert throw P2002. That throw escaped ensureHistoryCards and aborted
// the whole snapshot, so NO card got a point. Confirmed in the 2026-08-20 07:30
// import log — "Unique constraint failed on the fields: (`slug`)" followed by
// "Price-history snapshot failed" — with the history table frozen at
// 2026-08-09 for eleven days while every run still reported success.
// ─────────────────────────────────────────────────────────────────────────────

test("a stale duplicate slug cannot abort the whole snapshot", () => {
  const src = read(DB_HISTORY);
  const fnMatch = src.match(/export async function ensureHistoryCards[\s\S]*?\n\}/);
  const body = fnMatch![0];
  // Per-row isolation: one unusable card must cost one card, not the batch.
  assert.match(body, /try \{[\s\S]*?await dbHistory\.card\.upsert/, "each row's upsert must be attempted independently");
  assert.match(src, /function isUniqueConflict/, "expected a P2002 check by CODE, not by message text");
  assert.match(src, /=== "P2002"/, "unique-constraint detection must key off the Prisma error code");
  // The repair: free the contested unique value from the stale row rather than
  // deleting it (deleting cascades away that row's price history).
  assert.match(body, /for \(const field of \["slug", "externalId"\] as const\)/, "must free BOTH of Card's unique columns");
  assert.match(body, /updateMany\(\{[\s\S]*?id: \{ not: row\.id \}[\s\S]*?\}\)/, "must clear the value on the OTHER row, never this one");
  assert.ok(!/dbHistory\.card\.delete/.test(body), "must not delete the stale row — its PriceHistory would cascade away");
});

test("the snapshot skips uncopyable cards instead of losing the day", () => {
  const src = read("src/lib/price-import.ts");
  // ensureHistoryCards reports what actually landed; the caller must use it,
  // because the write is a single createMany and one bad FK rejects every row.
  assert.match(src, /const writable = await ensureHistoryCards\(/, "the caller must capture what actually landed");
  assert.match(src, /if \(writable && !writable\.has\(c\.id\)\) continue;/, "rows for uncopyable cards must be dropped before the batch write");
  // null means single-database setup — filtering there would drop everything.
  const dbh = read(DB_HISTORY);
  assert.match(dbh, /Promise<Set<string> \| null>/, "must distinguish 'nothing to filter' from 'nothing is writable'");
  assert.match(dbh, /if \(!historyIsSplit \|\| cardIds\.length === 0\) return null;/, "a single-DB setup must return null, not an empty set");
});
