import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWatchDigestEmail, changePct, pickDigestRows, watchDigestArm, type DigestRow } from "../src/lib/watch-digest";

const row = (name: string, start: number | null, now: number): DigestRow => ({ name, setName: "Origins", href: `/card/${name}`, currency: "USD", startCents: start, nowCents: now });

test("the arm is fixed by the user id and splits accounts roughly in half", () => {
  assert.equal(watchDigestArm("abc"), watchDigestArm("abc"));
  let offer = 0;
  for (let i = 0; i < 2000; i++) if (watchDigestArm(`user-${i}`) === "offer") offer++;
  assert.ok(offer > 900 && offer < 1100, `offer arm ${offer} of 2000`);
});

test("cheaper cards come first, biggest drop first; unpriced watches are left out", () => {
  const picked = pickDigestRows([row("a", 1000, 1100), row("b", 1000, 800), row("c", 1000, 950), row("d", null, 500), row("e", 1000, 0)]);
  assert.deepEqual(picked.rows.map((r) => r.name), ["b", "c", "a", "d"]);
  assert.equal(picked.cheaper, 2);
  assert.equal(changePct(row("x", 1000, 800)), -20);
  assert.equal(changePct(row("x", null, 800)), null);
});

test("the email names the drops, links the card pages without affiliate tags, and carries a stop link", () => {
  const m = buildWatchDigestEmail(pickDigestRows([row("Jinx", 2000, 1500), row("Vi", 1000, 1000)]), 2, "https://riftcompare.com/watch-digest/stop?t=tok");
  assert.match(m.subject, /1 of your watched cards is cheaper this week/);
  assert.match(m.text, /Jinx \(Origins\): US\$15\.00, -25% since you started watching/);
  assert.match(m.html, /watch-digest\/stop\?t=tok/);
  assert.doesNotMatch(m.html, /ebay|campid|tcgplayer\.pxf/i);
});

test("opt-in only: the control arm is refused, the stop route mutates on POST only, and the run is idempotent per edition", () => {
  const api = readFileSync("src/app/api/watch-digest/route.ts", "utf8");
  assert.match(api, /watchDigestArm\(user\.id\) !== "offer"/);
  const stop = readFileSync("src/app/api/watch-digest/stop/route.ts", "utf8");
  assert.doesNotMatch(stop, /export (async )?function GET|export const GET/);
  const lib = readFileSync("src/lib/watch-digest.ts", "utf8");
  assert.match(lib, /lastEditionKey !== edition/);
  assert.doesNotMatch(lib, /marketing: true/);
  const page = readFileSync("src/app/watching/page.tsx", "utf8");
  assert.match(page, /digestArm === "offer" && <WatchDigestToggle/);
});
