import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIGHTINGS_FORUM, sightingsLines, summariseSightings, type ForumTag } from "../src/lib/discord/sightings";

const TAGS: ForumTag[] = [
  { id: "p", name: "Pokémon" },
  { id: "us", name: "US" },
  { id: "store", name: "In store" },
  { id: "gone", name: "Sold out" },
  { id: "guide", name: "How to post", moderated: true },
];
const now = Date.parse("2026-12-10T00:00:00Z");
const at = (d: string) => ({ create_timestamp: `${d}T12:00:00Z` });

test("restock sightings: counts members' posts, never our how-to, and splits by tag", () => {
  const s = summariseSightings(
    [
      { id: "1", parent_id: SIGHTINGS_FORUM, owner_id: "bill", applied_tags: ["guide"], message_count: 4, thread_metadata: at("2026-11-26") },
      { id: "2", parent_id: SIGHTINGS_FORUM, owner_id: "a", applied_tags: ["p", "us", "store"], message_count: 3, fire: 5, thread_metadata: at("2026-12-08") },
      { id: "3", owner_id: "a", applied_tags: ["p", "us", "gone"], message_count: 1, fire: 1, thread_metadata: at("2026-11-28") },
      { id: "3", owner_id: "a", applied_tags: ["p"], thread_metadata: at("2026-11-28") }, // active and archived: once
      { id: "4", parent_id: "other-channel", owner_id: "b", applied_tags: ["p"], thread_metadata: at("2026-12-08") },
      { id: "5", parent_id: SIGHTINGS_FORUM, owner_id: "c", applied_tags: ["us"], thread_metadata: { create_timestamp: "2026-11-20T00:00:00Z" } },
    ],
    TAGS,
    now,
  );
  assert.deepEqual(s, { sightings: 2, last7: 1, posters: 1, replies: 4, fire: 6, soldOut: 1, byTag: { "Pokémon": 2, US: 2, "In store": 1 } });
  assert.match(sightingsLines(s)[0], /^Restock sightings: 2 \(1 in 7 days\) from 1 members; 4 replies, 6 fire, 1 marked sold out$/);
});

test("an empty forum reads as zero, not as an error", () => {
  assert.deepEqual(sightingsLines(summariseSightings([], TAGS, now)), ["Restock sightings: 0 (0 in 7 days) from 0 members; 0 replies, 0 fire, 0 marked sold out"]);
});

test("the stats job prints counts only, never a title or what a member wrote", () => {
  const lib = readFileSync("src/lib/discord/sightings.ts", "utf8");
  assert.doesNotMatch(lib, /\.name\b(?!\.toLowerCase)[^;]*thread|t\.name|content/);
  const script = readFileSync("scripts/discord-hub-stats.ts", "utf8");
  assert.match(script, /sightingsLines\(summariseSightings\(/);
  assert.doesNotMatch(script, /\.content\b/);
});
