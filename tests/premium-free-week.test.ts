import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FREE_WEEK, freeWeekArm, freeWeekGrantFor, freeWeekOpen, freeWeekUntil } from "../src/lib/premium-free-week";

// The free Premium week test (owner, 2026-11-26; DECISIONS.md "A free Premium week for half of new accounts, as a test").

test("the window is 2 Dec to 16 Dec 2026, UTC, and closes by itself", () => {
  assert.equal(new Date(FREE_WEEK.start).toISOString(), "2026-12-02T00:00:00.000Z");
  assert.equal(new Date(FREE_WEEK.end).toISOString(), "2026-12-16T00:00:00.000Z");
  assert.equal(FREE_WEEK.days, 7);
  assert.equal(freeWeekOpen(FREE_WEEK.start - 1), false);
  assert.equal(freeWeekOpen(FREE_WEEK.start), true);
  assert.equal(freeWeekOpen(FREE_WEEK.end), false);
});

test("accounts split about 50/50 and keep their arm", () => {
  let b = 0;
  for (let i = 0; i < 4000; i++) if (freeWeekArm(`cm${i.toString(36)}x${(i * 7919).toString(36)}`) === "b") b++;
  assert.ok(b > 1800 && b < 2200, `arm b got ${b} of 4000`);
  assert.equal(freeWeekArm("abc"), freeWeekArm("abc"));
});

test("only arm b, only inside the window, gets the week", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `user${i}`);
  const b = ids.find((id) => freeWeekArm(id) === "b")!;
  const a = ids.find((id) => freeWeekArm(id) === "a")!;
  const mid = FREE_WEEK.start + 86_400_000;
  assert.equal(freeWeekGrantFor(b, mid), true);
  assert.equal(freeWeekGrantFor(a, mid), false);
  assert.equal(freeWeekGrantFor(b, FREE_WEEK.end + 1), false);
  assert.equal(freeWeekGrantFor(b, FREE_WEEK.start - 1), false);
});

test("extend-only: a later date an account already has is kept", () => {
  const now = FREE_WEEK.start;
  assert.equal(freeWeekUntil(now, null), now + 7 * 86_400_000);
  assert.equal(freeWeekUntil(now, now + 14 * 86_400_000), now + 14 * 86_400_000);
  assert.equal(freeWeekUntil(now, now - 1), now + 7 * 86_400_000);
});

test("no environment variable can switch it on or stretch it (the 2026-08-23 lesson)", () => {
  for (const f of ["src/lib/premium-free-week.ts", "src/lib/premium-free-week-server.ts"]) {
    assert.ok(!readFileSync(f, "utf8").includes("process.env"), `${f} reads the environment`);
  }
});

test("every place a new account is made grants it, and only for a new account", () => {
  const oauth = readFileSync("src/app/api/auth/oauth/[provider]/callback/route.ts", "utf8");
  assert.equal((oauth.match(/grantFreeWeekIfNew\(/g) ?? []).length, 3);
  assert.match(readFileSync("src/app/api/auth/email-link/consume/route.ts", "utf8"), /if \(result\.isNew\) await grantFreeWeekIfNew/);
  const sister = readFileSync("src/lib/sister-premium.ts", "utf8");
  assert.match(sister, /await grantFreeWeekIfNew\(created\.id\)/);
});

test("checkout lets only a free-week member start the card trial while entitled", () => {
  const route = readFileSync("src/app/api/premium/checkout/route.ts", "utf8");
  assert.match(route, /isPremium\(user\) && !user\.isAdmin && !\(await freeWeekMayCheckout\(user\)\)/);
  const server = readFileSync("src/lib/premium-free-week-server.ts", "utf8");
  assert.match(server, /if \(user\.isAdmin \|\| user\.stripeCustomerId\) return false;/);
});
