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
  // Snapshots are daily again since 2026-10-03, with no interval gate left —
  // but two things still make a healthy site's newest point older than a day:
  //   • the price guide and price-table read the rise predictor's
  //     WEEK-collapsed series, whose newest point is the week's cheapest day,
  //     up to 7 days back;
  //   • the site reads the files the last release bundled, up to ~2 days behind
  //     the newest snapshot.
  // A threshold that cannot outlast both switches those features off on a
  // healthy site, silently.
  assert.doesNotMatch(src, /export const HISTORY_MIN_INTERVAL_DAYS/, "a write-interval gate came back — re-derive this threshold against it");
  const WEEK_COLLAPSED_MAX_AGE_DAYS = 7;
  const RELEASE_LAG_DAYS = 2;
  assert.ok(
    staleDays > WEEK_COLLAPSED_MAX_AGE_DAYS + RELEASE_LAG_DAYS,
    `STALE_HISTORY_MS is ${staleDays} days, which a healthy week-collapsed series bundled a release late can exceed — the price guide's change columns would silently vanish`,
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

// ─────────────────────────────────────────────────────────────────────────────
// The incident's root cause is gone with the database (2026-10-03): the day's
// points are a file (lib/price-history-store.ts), so there is no Card foreign
// key for one stale card to violate, and no ensureHistoryCards() copy step to
// fail. What must stay true is the lesson: one bad card costs one card, never
// the day. tests/price-history-store.test.ts exercises the store itself.
// ─────────────────────────────────────────────────────────────────────────────

test("the snapshot write has no foreign key and no copy step to lose the day to", () => {
  const importer = read("src/lib/price-import.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(importer, /ensureHistoryCards|dbHistory/, "the snapshot no longer touches the history database");
  assert.match(importer, /writeCardHistoryDay\(day, points\)/);
  assert.doesNotMatch(read(DB_HISTORY), /export async function ensureHistoryCards/, "the card-copy step went with PriceHistory");
  // The store drops an invalid point and writes the rest, never the whole batch.
  const store = read("src/lib/price-history-store.ts");
  assert.match(store, /const clean = \[\.\.\.prices\]\.filter\(/);
});
