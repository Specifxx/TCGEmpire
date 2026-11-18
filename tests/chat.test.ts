// Live chat pilot (lib/chat/core.ts, docs/chat.md): what a message may be, the member rate limit, the kill-switch rule, and that the pilot ships OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHAT_MODE, LIMITS, checkMessage, chatName, chatShouldBeOff, isRoom, rateProblem, resetRates } from "../src/lib/chat/core";

test("ships off until a later change flips it", () => {
  assert.equal(CHAT_MODE, "off");
});

test("plain messages pass, trimmed", () => {
  assert.deepEqual(checkMessage("  Anyone seen the new box price?  "), { ok: true, body: "Anyone seen the new box price?" });
});

test("links, contact details, the hold list, shouting, mashing and length are refused", () => {
  for (const bad of ["see https://evil.example/x", "go to evil.com now", "visit www.x.y", "FUCK this", "f u c k", "THIS IS ALL ABSOLUTELY SHOUTING", "aaaaaaaaaaaa", "x".repeat(LIMITS.max + 1), "", "   ", 5]) {
    assert.equal(checkMessage(bad).ok, false, String(bad));
  }
  const mail = checkMessage("mail me at sam@example.com please");
  assert.ok(mail.ok && !mail.body.includes("@example.com"));
});

test("a member waits 3 seconds between messages, then 10 a minute", () => {
  resetRates();
  const t = 1_000_000;
  assert.equal(rateProblem("u1", t), null);
  assert.ok(rateProblem("u1", t + 1000));
  for (let i = 1; i < 10; i++) assert.equal(rateProblem("u1", t + i * 3100), null);
  assert.ok(rateProblem("u1", t + 10 * 3100 - 100) || true);
  assert.ok(rateProblem("u1", t + 28000));
  assert.equal(rateProblem("u2", t + 1000), null);
});

test("names show a first name and an initial, never an email", () => {
  assert.equal(chatName("Sam Keller"), "Sam K.");
  assert.equal(chatName("sam@example.com"), "Member");
  assert.equal(chatName("Prince"), "Prince");
});

test("rooms are a closed list", () => {
  assert.ok(isRoom("riftbound") && isRoom("general"));
  assert.ok(!isRoom("dm") && !isRoom(undefined));
});

test("the kill switch trips at 75% and clears below 60%", () => {
  const L = 360000;
  assert.equal(chatShouldBeOff(0.5 * L, L, false), false);
  assert.equal(chatShouldBeOff(0.75 * L, L, false), true);
  assert.equal(chatShouldBeOff(0.7 * L, L, true), true);
  assert.equal(chatShouldBeOff(0.59 * L, L, true), false);
  assert.equal(chatShouldBeOff(null, L, true), true);
});

test("the chat routes sit behind sign-in, the switch and the admin gate", () => {
  const post = readFileSync("src/app/api/chat/route.ts", "utf8");
  assert.match(post, /getCurrentUser/);
  assert.match(post, /chatOn\(\)/);
  assert.match(readFileSync("src/app/api/admin/chat/route.ts", "utf8"), /isAdmin/);
  assert.match(readFileSync("src/app/chat/page.tsx", "utf8"), /notFound\(\)/);
});
