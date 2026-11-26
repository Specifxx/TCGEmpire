import { test } from "node:test";
import assert from "node:assert/strict";
import { checkText, ROOMS } from "../scripts/discord-say";

test("discord-say: text only, no pings, short, game rooms published", () => {
  assert.deepEqual(checkText("New Legacy reveal\\nhttps://riftcompare.com/sets/legacy"), { ok: true, text: "New Legacy reveal\nhttps://riftcompare.com/sets/legacy" });
  assert.equal(checkText("hi @everyone").ok, false);
  assert.equal(checkText("hi <@&123>").ok, false);
  assert.equal(checkText(" ").ok, false);
  assert.equal(checkText("x".repeat(1801)).ok, false);
  assert.equal(ROOMS.riftbound.publish, true);
  assert.equal(ROOMS.announcements.publish, false);
});
