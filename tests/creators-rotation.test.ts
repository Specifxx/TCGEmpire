import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREATORS,
  attachCreatorCodes,
  creatorOfTheWeek,
  featuredCreators,
  rotationWeek,
  type Creator,
} from "../src/lib/content/creators";

// Creator of the week rotates every Wednesday (Sydney), randomly but fairly, and
// creator codes come from the active Affiliate rows (2026-10-24, DECISIONS.md
// "Creator of the week rotates every Wednesday").

test("the week turns at 00:00 Wednesday, Sydney time", () => {
  // Tue 27 Oct 2026 23:59 AEDT (UTC+11) is 12:59 UTC; Wed 00:00 AEDT is 13:00 UTC.
  const tueLate = new Date("2026-10-27T12:59:00Z");
  const wedStart = new Date("2026-10-27T13:00:00Z");
  assert.equal(rotationWeek(wedStart), rotationWeek(tueLate) + 1);
  // Same week from Wednesday to the next Tuesday night.
  assert.equal(rotationWeek(new Date("2026-11-03T12:59:00Z")), rotationWeek(wedStart));
  assert.equal(rotationWeek(new Date("2026-11-03T13:00:00Z")), rotationWeek(wedStart) + 1);
});

test("everyone gets a week before anyone gets a second, and never two weeks running", () => {
  const slugs = CREATORS.map((c) => c.slug);
  const n = slugs.length;
  let prev: string | null = null;
  for (let w = -3 * n; w < 6 * n; w++) {
    const pick = creatorOfTheWeek(slugs, w)!;
    assert.ok(slugs.includes(pick));
    assert.notEqual(pick, prev, `week ${w} repeats ${pick}`);
    prev = pick;
  }
  for (let cycle = 0; cycle < 5; cycle++) {
    const picks = Array.from({ length: n }, (_, i) => creatorOfTheWeek(slugs, cycle * n + i));
    assert.equal(new Set(picks).size, n, `cycle ${cycle} covers every creator once`);
  }
  // Deterministic: the same week gives the same pick, in any input order.
  assert.equal(creatorOfTheWeek([...slugs].reverse(), 7), creatorOfTheWeek(slugs, 7));
  assert.equal(creatorOfTheWeek([], 3), null);
  assert.equal(creatorOfTheWeek(["solo"], 3), "solo");
});

test("featuredCreators badges exactly one creator, first, and nobody is pinned by hand", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const list = featuredCreators(CREATORS, now);
  assert.equal(list.filter((c) => c.ofTheWeek).length, 1);
  assert.equal(list[0].ofTheWeek, true);
  assert.equal(list[0].slug, creatorOfTheWeek(CREATORS.map((c) => c.slug), rotationWeek(now)));
  assert.ok(CREATORS.every((c) => c.ofTheWeek === undefined), "the data never pins a creator of the week");
  // The rest stay newest first.
  const rest = list.slice(1).map((c) => c.since);
  assert.deepEqual(rest, [...rest].sort().reverse());
});

const creator = (over: Partial<Creator>): Creator => ({ slug: "x", name: "X", blurb: "", links: [], since: "2026-10-01", ...over });

test("codes attach by affiliate name or code stem, only when unambiguous, and a typed code wins", () => {
  const list = [
    creator({ slug: "keishun", name: "Keishun" }),
    creator({ slug: "ripsbyjosh", name: "Josh", links: [{ platform: "Instagram", url: "u", handle: "@ripsbyjosh" }] }),
    creator({ slug: "deckdemon", name: "Deck Demon", links: [{ platform: "Instagram", url: "u", handle: "@deckdemon_" }] }),
    creator({ slug: "typed", name: "Typed", code: { code: "TYPED10", percentOff: 10 } }),
    creator({ slug: "nobody", name: "Nobody" }),
  ];
  const out = attachCreatorCodes(list, [
    { code: "KEISHUN20", name: "Keishun Tan", percentOff: 20 }, // code stem
    { code: "RIPS20", name: "ripsbyjosh", percentOff: 20 }, // name = handle
    { code: "DEMON20", name: "Deck Demon", percentOff: 15 }, // name = creator name
    { code: "OTHER20", name: "Typed", percentOff: 20 }, // typed code wins
  ]);
  const code = (slug: string) => out.find((c) => c.slug === slug)?.code;
  assert.deepEqual(code("keishun"), { code: "KEISHUN20", percentOff: 20 });
  assert.deepEqual(code("ripsbyjosh"), { code: "RIPS20", percentOff: 20 });
  assert.deepEqual(code("deckdemon"), { code: "DEMON20", percentOff: 15 });
  assert.deepEqual(code("typed"), { code: "TYPED10", percentOff: 10 });
  assert.equal(code("nobody"), undefined);
  // Two codes for one creator, or one code for two creators: nothing is guessed.
  const two = attachCreatorCodes([creator({ slug: "sam", name: "Sam" })], [
    { code: "SAM20", name: "x1", percentOff: 20 },
    { code: "SAM10", name: "x2", percentOff: 10 },
  ]);
  assert.equal(two[0].code, undefined);
  const shared = attachCreatorCodes([creator({ slug: "alex", name: "Alex" }), creator({ slug: "alexb", name: "Alex" })], [
    { code: "ALEX20", name: "Alex", percentOff: 20 },
  ]);
  assert.ok(shared.every((c) => !c.code));
});

test("/creators reads only active codes, and never the email", () => {
  const src = readFileSync(new URL("../src/lib/content/creators-server.ts", import.meta.url), "utf8");
  assert.match(src, /prisma\.affiliate\s*\.findMany\(\{ where: \{ active: true \}, select: \{ code: true, name: true, percentOff: true \}/);
  assert.doesNotMatch(src, /select: \{[^}]*email/, "the email is never selected");
});
