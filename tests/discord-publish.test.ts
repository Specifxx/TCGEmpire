import { test } from "node:test";
import assert from "node:assert/strict";
import { byGameChannel, copyMessage, GAME_CHANNEL, OTHER_GAMES_CHANNEL, toPublish } from "../scripts/discord-publish";

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

test("a drop's posts are copied to each game's channel, other games to #more-tcgs, never with a ping", () => {
  const e = (game: string, title: string) => ({ title, footer: { text: `Sealed Sniper · ${game} · Booster Box · tcgprices.app` } });
  const groups = byGameChannel([e("Pokémon", "a"), e("Magic", "b"), e("Pokémon", "c"), e("Gundam", "d"), e("Digimon", "e"), { title: "no footer" }]);
  assert.deepEqual(groups.get(GAME_CHANNEL["Pokémon"])?.embeds.map((x) => x.title), ["a", "c"]);
  assert.deepEqual(groups.get(GAME_CHANNEL.Magic)?.embeds.map((x) => x.title), ["b"]);
  assert.deepEqual(groups.get(OTHER_GAMES_CHANNEL)?.games, ["Gundam", "Digimon"]);
  assert.equal(groups.size, 3);
  const m = copyMessage(groups.get(OTHER_GAMES_CHANNEL)!);
  assert.match(m.content, /^\*\*Sealed Sniper:\*\* 2 Gundam \/ Digimon deals/);
  assert.deepEqual(m.allowed_mentions.parse, []);
});
