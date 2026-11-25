import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armOf, changeSince, sparkPath, todayItems, TODAY_MAX } from "../src/lib/your-cards-today";

// "Your cards today" (2026-11-18, retention job C): an account's watched cards on the home page, browser-only, a 50/50 test.
test("newest distinct cards, at most TODAY_MAX", () => {
  const cards = [{ id: "a" }, { id: "a" }, ...Array.from({ length: 12 }, (_, i) => ({ id: `c${i}` }))];
  const out = todayItems(cards);
  assert.equal(out.length, TODAY_MAX);
  assert.equal(out[0].id, "a");
  assert.equal(new Set(out.map((c) => c.id)).size, out.length);
});

test("change since the last look is null without both prices", () => {
  assert.equal(changeSince(undefined, 500), null);
  assert.equal(changeSince(500, null), null);
  assert.equal(changeSince(500, 450), -50);
});

test("the arm is drawn once and kept", () => {
  assert.deepEqual(armOf("on"), { arm: "on", store: null });
  assert.deepEqual(armOf(null, () => 0.1), { arm: "on", store: "on" });
  assert.deepEqual(armOf("junk", () => 0.9), { arm: "off", store: "off" });
});

test("a sparkline needs two points and stays inside its box", () => {
  assert.equal(sparkPath([5]), "");
  const pts = sparkPath([1, 3, 2], 64, 20).split(" ").map((p) => p.split(",").map(Number));
  assert.equal(pts.length, 3);
  for (const [x, y] of pts) assert.ok(x >= 0 && x <= 64 && y >= 0 && y <= 20);
});

test("browser-only, per user, bounded, and never in the server HTML of the home page", () => {
  const strip = readFileSync(new URL("../src/components/home/YourCardsToday.tsx", import.meta.url), "utf8");
  assert.match(strip, /^"use client";/);
  assert.match(strip, /if \(!on \|\| !items\?\.length\) return null;/);
  const route = readFileSync(new URL("../src/app/api/alerts/today/route.ts", import.meta.url), "utf8");
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /take: 40,/);
  assert.match(route, /where: \{ userId: user\.id \}/);
  assert.ok(!/_count/.test(route), "no per-card store-count subquery");
});
