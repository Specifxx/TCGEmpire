import { test } from "node:test";
import assert from "node:assert/strict";
import { previousMonth, safeHandle, topHuntersMessage } from "../scripts/discord-top-hunters";

test("the post covers the month before, across a year end", () => {
  assert.equal(previousMonth(new Date("2026-12-01T09:17:00Z")), "2026-11");
  assert.equal(previousMonth(new Date("2027-01-01T09:17:00Z")), "2026-12");
});

test("handles only, as plain text, never a ping or a link", () => {
  assert.equal(safeHandle("@everyone"), "everyone");
  assert.equal(safeHandle("**bold** <@123> [x](https://evil.example)"), "bold 123 x");
  const m = topHuntersMessage("2026-11", [
    { handle: "sniperfan", points: 12, contributions: 12 },
    { handle: "@here", points: 3 },
    { handle: "zero", points: 0 },
  ])!;
  assert.match(m.content, /^\*\*Top deal hunters, November 2026\*\*/);
  assert.match(m.content, /🥇 sniperfan: 12 points/);
  assert.match(m.content, /🥈 here: 3 points/);
  assert.doesNotMatch(m.content, /zero|@/);
  assert.match(m.content, /tcgprices\.app\/drops/);
  assert.deepEqual(m.allowed_mentions.parse, []);
});

test("an empty month posts nothing", () => {
  assert.equal(topHuntersMessage("2026-11", []), null);
  assert.equal(topHuntersMessage("2026-11", [{ handle: "a", points: 0 }]), null);
});
