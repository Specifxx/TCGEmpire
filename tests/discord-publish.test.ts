import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublish } from "../scripts/discord-publish";

test("publishes only unpublished webhook drops of the last day, oldest first", () => {
  const now = Date.parse("2026-11-23T22:10:00Z");
  const msgs = [
    { id: "5", timestamp: "2026-11-23T21:50:00Z", webhook_id: "w" },
    { id: "4", timestamp: "2026-11-23T21:49:00Z", webhook_id: "w", flags: 1 },
    { id: "3", timestamp: "2026-11-23T21:00:00Z" },
    { id: "2", timestamp: "2026-11-23T09:50:00Z", webhook_id: "w", flags: 4 },
    { id: "1", timestamp: "2026-11-21T21:50:00Z", webhook_id: "w" },
  ];
  assert.deepEqual(toPublish(msgs, now), ["2", "5"]);
});
