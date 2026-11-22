import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDormant, recapAudience, recapRows, type RecapUserRow } from "../src/lib/watch-recap";
import { buildWatchRecapEmail, MARKETING_ALLOWED, watchRecapSubject } from "../src/lib/email";

const NOW = Date.UTC(2026, 10, 22);
const D = 86_400_000;
const u = (id: string, o: Partial<RecapUserRow> = {}): RecapUserRow => ({
  id, email: `${id}@x.co`, displayName: id, isAdmin: false, createdAt: new Date(NOW - 90 * D),
  lastActiveAt: new Date(NOW - 60 * D), lastLoginAt: null, watchRecapSentAt: null, ...o,
});

test("dormant: older than 30 days and neither active nor signed in for 30 days", () => {
  assert.equal(isDormant(u("a"), NOW), true);
  assert.equal(isDormant(u("a", { createdAt: new Date(NOW - 10 * D) }), NOW), false);
  assert.equal(isDormant(u("a", { lastActiveAt: new Date(NOW - 5 * D) }), NOW), false);
  assert.equal(isDormant(u("a", { lastActiveAt: null, lastLoginAt: new Date(NOW - 5 * D) }), NOW), false);
  assert.equal(isDormant(u("a", { lastActiveAt: null }), NOW), true);
});

test("audience: dormant, with a watchlist, not opted out, not admin, newest first, never twice", () => {
  const rows = [
    u("old", { createdAt: new Date(NOW - 200 * D) }),
    u("new", { createdAt: new Date(NOW - 40 * D) }),
    u("nowatch"),
    u("admin", { isAdmin: true }),
    u("out"),
    u("sent", { watchRecapSentAt: new Date(NOW - D) }),
    u("active", { lastActiveAt: new Date(NOW - D) }),
  ];
  const watched = new Map(["old", "new", "admin", "out", "sent", "active"].map((id) => [id, ["c1"]]));
  const a = recapAudience(rows, watched, new Set(["out@x.co"]), NOW);
  assert.deepEqual(a.pending.map((r) => r.id), ["new", "old"]);
  assert.equal(a.alreadySent, 1);
  assert.equal(a.optedOut, 1);
});

test("rows: real prices only, change over 30 days, a stale or missing price is left out", () => {
  const cards = [
    { id: "up", slug: "up", name: "Up", setName: "S", imageUrl: null },
    { id: "down", slug: "down", name: "Down", setName: "S", imageUrl: null },
    { id: "young", slug: "young", name: "Young", setName: "S", imageUrl: null },
    { id: "stale", slug: "stale", name: "Stale", setName: "S", imageUrl: null },
    { id: "none", slug: "none", name: "None", setName: "S", imageUrl: null },
  ];
  const h: Record<string, { t: number; usdCents: number }[]> = {
    up: [{ t: NOW - 40 * D, usdCents: 1000 }, { t: NOW - D, usdCents: 1500 }],
    down: [{ t: NOW - 31 * D, usdCents: 2000 }, { t: NOW, usdCents: 1800 }],
    young: [{ t: NOW - 3 * D, usdCents: 500 }],
    stale: [{ t: NOW - 40 * D, usdCents: 500 }],
  };
  const rows = recapRows(cards, (id) => h[id] ?? [], NOW, "src=x");
  assert.deepEqual(rows.map((r) => [r.name, r.changePct]), [["Up", 50], ["Down", -10], ["Young", null]]);
  assert.equal(rows[0].now, "US$15.00");
  assert.equal(rows[0].then, "US$10.00");
  assert.ok(rows.every((r) => new URL(r.href).hostname === "riftcompare.com"));
});

test("the email: escaped, opt-out and one-click headers, only our links, and not let through the switch yet", () => {
  const e = buildWatchRecapEmail({
    displayName: "Bill Y", days: 30, watchlistUrl: "https://riftcompare.com/watching",
    unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=t",
    rows: [{ name: "<b>X</b>", setName: "S", href: "https://riftcompare.com/card/x", imageUrl: null, now: "$15.00", then: "$10.00", changePct: 50 }],
  });
  assert.match(e.html, /Hi Bill,/);
  assert.match(e.html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.match(e.html, /▲ 50%/);
  assert.match(e.text, /Don't email me announcements: https:\/\/riftcompare\.com\/announcements\/unsubscribe\?token=t/);
  assert.equal(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  for (const m of e.html.matchAll(/href="([^"]+)"/g)) assert.equal(new URL(m[1]).hostname, "riftcompare.com");
  assert.equal(watchRecapSubject([]), "Your watched cards, priced today");
  assert.ok(!MARKETING_ALLOWED.has("watch-recap"), "sends only once the owner lets this campaign through");
  const route = readFileSync("src/app/api/cron/watch-recap/route.ts", "utf8");
  assert.match(route, /if \(!secret\) return false;/);
  assert.match(route, /const dryRun = p\.get\("dry"\) !== "0";/);
  assert.match(route, /sendWatchRecapTest\(ownerEmail\(\)\)/);
});
