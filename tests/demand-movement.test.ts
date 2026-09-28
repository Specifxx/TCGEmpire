import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chartMovement, compareDemand, movementFor, rankBy, type DemandCounts } from "../src/lib/demand-movement";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// /admin/demand's leaderboard shows Billboard-style movement (2026-09-28): each
// card's rank in the chosen window against its rank in the equal-length period
// before it, both ranked by the same rule.
// ─────────────────────────────────────────────────────────────────────────────

const r = (cardId: string, searches: number, views = 0): DemandCounts => ({ cardId, searches, views });

test("movementFor: up, down, held and new", () => {
  assert.deepEqual(movementFor(3, 7), { kind: "up", by: 4, prev: 7 });
  assert.deepEqual(movementFor(7, 3), { kind: "down", by: 4, prev: 3 });
  assert.deepEqual(movementFor(5, 5), { kind: "same", by: 0, prev: 5 });
  assert.deepEqual(movementFor(1, undefined), { kind: "new" });
});

test("the previous period is ranked across EVERY active card, not just the displayed top N", () => {
  const prev = Array.from({ length: 80 }, (_, i) => r(`c${i + 1}`, 1000 - i)); // c1 = #1 … c80 = #80
  const moves = chartMovement(["c73", "c1", "c2"], prev, "searches");
  assert.deepEqual(moves.get("c73"), { kind: "up", by: 72, prev: 73 }, "#73 → #1 is ▲72, not NEW");
  assert.deepEqual(moves.get("c1"), { kind: "down", by: 1, prev: 1 });
  assert.deepEqual(moves.get("c2"), { kind: "down", by: 1, prev: 2 });
});

test("NEW means no activity on THIS measure last period, even with activity on the other", () => {
  const prev = [r("viewed-only", 0, 40), r("searched", 5, 1)];
  const moves = chartMovement(["viewed-only", "searched"], prev, "searches");
  assert.deepEqual(moves.get("viewed-only"), { kind: "new" });
  assert.deepEqual(moves.get("searched"), { kind: "down", by: 1, prev: 1 });
  // …while on the views chart the same card has a rank to move from.
  assert.deepEqual(chartMovement(["viewed-only"], prev, "views").get("viewed-only"), { kind: "same", by: 0, prev: 1 });
});

test("ties rank the same way every time, so they can't show phantom movement", () => {
  const rows = [r("b", 5, 1), r("a", 5, 1), r("c", 5, 2)];
  assert.deepEqual([...rows].sort(compareDemand("searches")).map((x) => x.cardId), ["c", "a", "b"], "then views, then id");
  assert.deepEqual([...rankBy(rows, "searches")], [["c", 1], ["a", 2], ["b", 3]]);
  // Identical periods → every card held.
  const order = [...rows].sort(compareDemand("searches")).map((x) => x.cardId);
  for (const m of chartMovement(order, rows, "searches").values()) assert.equal(m.kind, "same");
});

test("views chart ranks by views first", () => {
  assert.deepEqual([...rankBy([r("x", 9, 1), r("y", 1, 9)], "views")], [["y", 1], ["x", 2]]);
});

test("/admin/demand ranks both periods with compareDemand and renders the movement", () => {
  const page = read("src/app/admin/demand/page.tsx");
  assert.match(page, /getDemandWindow\(range\.days, \{ previous: true \}\)/);
  assert.match(page, /\.sort\(compareDemand\("searches"\)\)/);
  assert.match(page, /\.sort\(compareDemand\("views"\)\)/);
  assert.match(page, /chartMovement\(bySearch\.map\(\(r\) => r\.cardId\), previous\.rows, "searches"\)/);
  assert.match(page, /chartMovement\(byView\.map\(\(r\) => r\.cardId\), previous\.rows, "views"\)/);
  assert.match(page, /<CardTable rows=\{topSearched\} metric="searchCount" moves=\{searchMoves\} \/>/);
  assert.match(page, /<CardTable rows=\{topViewed\} metric="viewCount" moves=\{viewMoves\} \/>/);
  // Movement never appears on the all-time fallback: there is no previous period to rank.
  assert.match(page, /const previous = windowUsable \? demandWindow\?\.previous \?\? null : null;/);

  const snap = read("src/lib/demand-snapshot.ts");
  assert.match(snap, /previousWindowOrThrow\(days, baseline\.day, baseRows\)/, "the previous period reuses the baseline rows already read");
});
