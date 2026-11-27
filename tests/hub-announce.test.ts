import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROOMS, readPost, telegramPlain } from "../scripts/hub-announce";

test("every prepared hub post fits Discord and carries at most 4 media files under 10 MB", () => {
  const root = "social/hub-posts";
  for (const id of fs.readdirSync(root)) {
    const { text, files } = readPost(`${root}/${id}`);
    assert.ok(text.length <= 2000, id);
    assert.doesNotMatch(text, /@everyone|@here/, "never a mass ping");
    assert.ok(files.length <= 4);
    for (const f of files) assert.ok(fs.statSync(f).size < 10 * 1024 * 1024, f);
  }
});

test("Telegram gets plain text", () => {
  assert.equal(telegramPlain("**Hi** [site](https://x.example) <https://y.example>"), "Hi site: https://x.example https://y.example");
});

test("only #announcements pins; #sealed-sniper posts unpinned", () => {
  assert.equal(ROOMS.announcements.pin, true);
  assert.equal(ROOMS["sealed-sniper"].pin, false);
  assert.equal(ROOMS["sealed-sniper"].id, "1573082997203275887");
});
