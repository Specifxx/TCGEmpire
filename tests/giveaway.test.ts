import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENT_GIVEAWAY as G, entryCounts, giveawayState, notifyOnCount } from "../src/lib/giveaway";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

test("giveaway window: upcoming, open, closed", () => {
  assert.equal(giveawayState(G, new Date(Date.parse(G.opensAt) - 1000)), "upcoming");
  assert.equal(giveawayState(G, new Date(Date.parse(G.opensAt) + 1000)), "open");
  assert.equal(giveawayState(G, new Date(Date.parse(G.closesAt) + 1000)), "closed");
  assert.equal(entryCounts(G, new Date(Date.parse(G.closesAt) + 1)), false);
});

test("closes 14 Dec 2026 at 23:59 Sydney time", () => {
  assert.equal(G.closesAt, "2026-12-14T12:59:59Z");
});

test("owner is emailed on the first entry and every 50th only", () => {
  assert.equal(notifyOnCount(1), true);
  assert.equal(notifyOnCount(2), false);
  assert.equal(notifyOnCount(50), true);
  assert.equal(notifyOnCount(51), false);
});

test("entries are private and one per account", () => {
  assert.ok(!(PUBLIC_MODELS as readonly string[]).some((m) => m.toLowerCase().includes("giveaway")));
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model GiveawayEntry \{[\s\S]*?@@unique\(\[giveaway, userId\]\)/);
});

test("the public page reads no session or database", () => {
  const page = readFileSync("src/app/giveaway/page.tsx", "utf8");
  assert.doesNotMatch(page, /@\/lib\/db|getCurrentUser|cookies\(|headers\(/);
  assert.match(page, /No purchase necessary/);
  assert.match(page, /void/);
});
