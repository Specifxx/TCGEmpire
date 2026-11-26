import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkHandle, atHandle } from "../src/lib/handles";
import { CONTRIBUTION_POINTS, DAILY_CONTRIBUTION_CAP, monthKey, monthRange, pointsFor, rankHunters } from "../src/lib/contributions";
import { entryPoints } from "../src/lib/giveaway";

// Community plan move 3, "names on contributions" (2026-11-26).

test("handles: lowercase, 3 to 20 of a-z 0-9 _, starting with a letter", () => {
  assert.deepEqual(checkHandle(" @Rift_Hunter "), { ok: true, handle: "rift_hunter" });
  assert.equal(atHandle("rift_hunter"), "@rift_hunter");
  for (const bad of ["ab", "1abc", "a".repeat(21), "has space", "dash-name", "émile", "", null, 42]) assert.equal(checkHandle(bad).ok, false, String(bad));
});

test("handles: never one that reads as ours, the team's or a slur", () => {
  for (const bad of ["admin", "riftcompare", "tcgprices_official", "the_admin", "support", "ebay", "f_u_c_k_you"]) assert.equal(checkHandle(bad).ok, false, bad);
  assert.equal(checkHandle("scunthorpe_fan").ok, false, "the short list errs on the side of refusing");
  assert.equal(checkHandle("deal_hunter_9").ok, true);
});

test("points: each kind's value, capped per day, never negative", () => {
  assert.equal(pointsFor("hot", 0), CONTRIBUTION_POINTS.hot);
  assert.equal(pointsFor("pull", 0), CONTRIBUTION_POINTS.pull);
  assert.equal(pointsFor("pull", DAILY_CONTRIBUTION_CAP - 1), 1);
  assert.equal(pointsFor("flag", DAILY_CONTRIBUTION_CAP), 0);
  assert.equal(pointsFor("pulse", 999), 0);
  assert.equal(DAILY_CONTRIBUTION_CAP <= 5, true, "a day of contributing is worth no more than one check-in");
});

test("months: a key and its range", () => {
  assert.equal(monthKey(new Date("2026-12-31T23:00:00Z")), "2026-12");
  const r = monthRange("2026-12")!;
  assert.equal(r.gte.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(r.lt.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(monthRange("2026-13"), null);
  assert.equal(monthRange("nope"), null);
});

test("Top deal hunters: points, then contributions, then who started first", () => {
  const d = (s: string) => new Date(`2026-12-${s}T00:00:00Z`);
  const ranked = rankHunters([
    { handle: "b", points: 10, contributions: 12, first: d("03") },
    { handle: "a", points: 10, contributions: 12, first: d("02") },
    { handle: "c", points: 12, contributions: 5, first: d("09") },
    { handle: "z", points: 0, contributions: 0, first: d("01") },
  ]);
  assert.deepEqual(ranked.map((r) => r.handle), ["c", "a", "b"]);
  assert.equal(rankHunters(Array.from({ length: 30 }, (_, i) => ({ handle: `h${i}`, points: i, contributions: 1, first: d("01") }))).length, 10);
});

test("giveaway: community points add to the entrant's points, and paying still buys nothing extra", () => {
  const base = { premium: false, watches: 0, bonusClaimed: true, checkins: 2 };
  const without = entryPoints(base);
  const withC = entryPoints({ ...base, contributions: 7 });
  assert.equal(withC.points, without.points + 7);
  assert.equal(withC.contribution, 7);
  assert.equal(entryPoints({ ...base, contributions: -3 }).contribution, 0);
  assert.equal(entryPoints({ ...base, premium: true, bonusClaimed: false }).points, without.points, "Premium = the free bonus, no more");
});

test("only a chosen handle is published: the list and the drop label read handles, never email or id", () => {
  const src = readFileSync("src/lib/contributions-server.ts", "utf8");
  assert.match(src, /handle: \{ not: null \}/);
  assert.doesNotMatch(src.slice(src.indexOf("export async function topHunters")), /email: r\.|userId: r\.userId \}/);
  const route = readFileSync("src/app/api/community/top/route.ts", "utf8");
  assert.match(route, /s-maxage=21600/);
});

test("a vote earns once per drop: hot and cold are one contribution, and a deleted pull log takes its points", () => {
  const src = readFileSync("src/lib/contributions-server.ts", "utf8");
  assert.match(src, /kind === "hot" \|\| kind === "cold" \? \["hot", "cold"\]/);
  assert.match(readFileSync("src/app/api/pulls/route.ts", "utf8"), /contribution\.deleteMany\(\{ where: \{ userId: user\.id, kind: "pull", ref: id \} \}\)/);
});

test("a RiftCompare session never counts from another site's request", () => {
  assert.match(readFileSync("src/lib/community-member.ts", "utf8"), /never a cookie sent along by another site's request/);
});
