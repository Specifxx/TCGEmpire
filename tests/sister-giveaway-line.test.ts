import { test } from "node:test";
import assert from "node:assert/strict";
import { sisterGiveawayLine } from "../src/lib/sister-alerts/email";

// The sister sites' alert and weekly emails carry their own giveaway in the footer while it is open (owner, 2026-11-23).
test("sister giveaway line: the site's own giveaway while open, nothing for other sites or after the close", () => {
  const open = new Date("2026-11-25T00:00:00Z");
  const dex = sisterGiveawayLine("dex", open);
  assert.ok(dex);
  assert.match(dex!.html, /https:\/\/dexcompare\.io\/giveaway\?utm_source=email/);
  assert.match(dex!.text, /Delta Reign/);
  assert.match(sisterGiveawayLine("mtg", open)!.text, /mtgcompare\.app\/giveaway/);
  assert.equal(sisterGiveawayLine("gundam", open), null);
  assert.equal(sisterGiveawayLine("dex", new Date("2026-12-15T00:00:00Z")), null);
});
