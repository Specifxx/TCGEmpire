import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dayIndexToDate } from "../src/lib/history-store";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// src/lib/history-store.ts is the ONLY module that should read the daily
// PriceHistory export (see DECISIONS.md, "History off Neon"). It must never
// open a database connection — that's the entire point of it — and every
// fetch must fail closed (null), never throw, so a CDN hiccup degrades a
// chart to empty exactly like the Postgres reads it replaces always did.
// ─────────────────────────────────────────────────────────────────────────────

test("history-store.ts imports neither Prisma nor the history db client", () => {
  const src = read("src/lib/history-store.ts");
  const importLines = src.split("\n").filter((l) => /^\s*import /.test(l));
  assert.equal(importLines.length, 0, `expected zero import statements (pure fetch-based module), found:\n${importLines.join("\n")}`);
  assert.doesNotMatch(src, /from ["']@prisma\/client["']/);
  assert.doesNotMatch(src, /from ["']\.\/db-history["']/);
  assert.doesNotMatch(src, /from ["']\.\/db["']/);
  assert.doesNotMatch(src, /new PrismaClient/);
});

test("every fetch in history-store.ts is cache: no-store, so the caller's own day-scoped cache is authoritative", () => {
  const src = read("src/lib/history-store.ts");
  assert.match(src, /cache:\s*"no-store"/);
});

test("fetchHistoryJson's callers are exported and typed against the export script's own file shapes", () => {
  const src = read("src/lib/history-store.ts");
  assert.match(src, /export function getCardSeries/);
  assert.match(src, /export function getWindow/);
  assert.match(src, /export function getRecords/);
  assert.match(src, /export function getHistoryMeta/);
});

test("dayIndexToDate is the inverse of export-history.ts's dayIndex()", () => {
  const MS_PER_DAY = 86_400_000;
  const dayIdx = Math.floor(Date.UTC(2026, 8, 18) / MS_PER_DAY);
  const d = dayIndexToDate(dayIdx);
  assert.equal(d.getTime(), dayIdx * MS_PER_DAY);
  assert.equal(d.toISOString().slice(0, 10), "2026-09-18");
});

test("the base CDN URL points at the data branch of this repo, overridable by env", () => {
  const src = read("src/lib/history-store.ts");
  assert.match(src, /cdn\.jsdelivr\.net\/gh\//);
  assert.match(src, /@data/);
  assert.match(src, /process\.env\.HISTORY_DATA_BASE_URL/);
});
