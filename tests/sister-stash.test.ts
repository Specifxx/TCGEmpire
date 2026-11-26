import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeed, type AlertFeed } from "../src/lib/sister-alerts/feed";
import {
  buildStashEmail,
  movers,
  parseStashItems,
  pct,
  priceMemoryOf,
  readPriceMemory,
  runStashDigest,
  stashDue,
  stashHasSiteFailure,
  stashUnsubscribeHeaders,
  summarise,
  valueStash,
  STASH_EVERY_MS,
  STASH_MAX_ITEMS,
  STASH_SITES,
} from "../src/lib/sister-stash";
import { DIGEST_MAIL_CEILING } from "../src/lib/sister-alerts/digest";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";
import { SISTER_PREMIUM_SITES } from "../src/lib/sister-premium";
import { SISTER_ALERT_SITES } from "../src/lib/sister-alerts/sites";

// DECISIONS.md, "A signed-in member's collection follows them, and a weekly stash email" (2026-11-26).

const DAY = 86_400_000;
const now = new Date("2026-11-30T14:20:00Z");

const feedOf = (items: Record<string, { n: string; u: string; p: Record<string, number> }>, generatedAt = "2026-11-30T06:00:00Z"): AlertFeed =>
  parseFeed({ v: 1, site: "tcgprices", generatedAt, items, deals: [] }, { key: "tcgprices" });

const FEED = feedOf({
  box: { n: "Aetherdrift Play Booster Box", u: "/card/aetherdrift-play-booster-box", p: { US: 15000, AU: 26000 } },
  etb: { n: "Delta Reign Elite Trainer Box", u: "/card/delta-reign-etb", p: { US: 6000 } },
  tin: { n: "Some Tin", u: "/card/some-tin", p: {} },
  case: { n: "OP-13 Case", u: "/card/op13-case", p: { US: 90000 } },
});

test("the stash is private and only for sites that have both accounts and an alert feed", () => {
  assert.ok(!(PUBLIC_MODELS as readonly string[]).includes("SisterStash"));
  for (const key of STASH_SITES) {
    assert.ok(SISTER_PREMIUM_SITES.some((s) => s.key === key), `${key} signs in`);
    assert.ok(SISTER_ALERT_SITES.some((s) => s.key === key), `${key} publishes a feed`);
  }
});

test("a stored list is validated: junk dropped, quantities clamped, one row per product and market, a hard cap", () => {
  const got = parseStashItems([
    { id: "box", m: "US", q: 2, a: 14000, at: "2026-11-01T00:00:00Z", n: "Box <b>", h: "/card/box", img: "https://tcgplayer-cdn.tcgplayer.com/x.jpg" },
    { id: "box", m: "US", q: 5, a: 1 }, // the same product and market again: the first wins
    { id: "box", m: "AU", q: 500, a: -3 }, // another market is another row; qty clamped, a bad price is "unknown"
    { id: "etb", m: "XX", q: 1 }, // unknown market
    { id: "bad id!", m: "US", q: 1 },
    { id: "etb", m: "US", q: 0 }, // nothing owned
    { id: "etb", m: "US", q: 1, h: "//evil.example/x", img: "javascript:alert(1)" },
    null,
    "junk",
  ]);
  assert.equal(got.length, 3);
  assert.deepEqual(got[0], { id: "box", m: "US", q: 2, a: 14000, at: "2026-11-01T00:00:00.000Z", n: "Box b", h: "/card/box", img: "https://tcgplayer-cdn.tcgplayer.com/x.jpg" });
  assert.equal(got[1].q, 99);
  assert.equal(got[1].a, 0);
  assert.equal(got[2].h, undefined);
  assert.equal(got[2].img, undefined);
  assert.deepEqual(parseStashItems("nope"), []);
  const many = Array.from({ length: STASH_MAX_ITEMS + 20 }, (_, i) => ({ id: `p${i}`, m: "US", q: 1 }));
  assert.equal(parseStashItems(many).length, STASH_MAX_ITEMS);
});

test("valuing: names and links come from the site's feed; a gone product is left out; like-for-like changes", () => {
  const items = parseStashItems([
    { id: "box", m: "US", q: 2, a: 14000, at: "2026-11-01T00:00:00Z", n: "Something else entirely" },
    { id: "etb", m: "US", q: 1, a: 7000 },
    { id: "tin", m: "US", q: 1, a: 2000 }, // listed, but no US store has it today
    { id: "gone", m: "US", q: 1, a: 5000 }, // no longer in the feed
    { id: "box", m: "AU", q: 1, a: 0 }, // unknown price when added
  ]);
  const lines = valueStash(items, FEED, { "US:box": 14500, "US:etb": 6000 });
  assert.equal(lines.length, 4);
  assert.equal(lines[0].name, "Aetherdrift Play Booster Box");
  assert.equal(lines[0].path, "/card/aetherdrift-play-booster-box");
  const sums = summarise(lines);
  assert.deepEqual(
    sums.map((s) => s.m),
    ["US", "AU"],
  );
  const us = sums[0];
  assert.equal(us.now, 2 * 15000 + 6000);
  assert.equal(us.unpriced, 1);
  assert.equal(us.units, 4);
  assert.deepEqual(us.week, { from: 2 * 14500 + 6000, to: 2 * 15000 + 6000 });
  assert.deepEqual(us.added, { from: 2 * 14000 + 7000, to: 2 * 15000 + 6000 });
  assert.equal(sums[1].added, null);
  assert.equal(pct(us.week), 2.9);
  assert.equal(pct(null), null);
  assert.deepEqual(priceMemoryOf(lines), { "US:box": 15000, "US:etb": 6000, "AU:box": 26000 });
});

test("movers: by money moved, up and down, at most three each way", () => {
  const items = parseStashItems([
    { id: "box", m: "US", q: 2, a: 14000 },
    { id: "etb", m: "US", q: 1, a: 7000 },
    { id: "case", m: "US", q: 1, a: 90000 },
  ]);
  const lines = valueStash(items, FEED, {});
  const m = movers(lines, "added");
  assert.deepEqual(m.up.map((x) => [x.line.id, x.delta]), [["box", 2000]]);
  assert.deepEqual(m.down.map((x) => [x.line.id, x.delta, x.pct]), [["etb", -1000, -14.3]]);
  assert.deepEqual(movers(lines, "week"), { up: [], down: [] });
});

test("the email: real totals, the feed's names (escaped), the site's own links, a one-click stop that keeps the list", () => {
  const items = parseStashItems([
    { id: "box", m: "US", q: 2, a: 14000, n: "<script>stored name</script>" },
    { id: "etb", m: "US", q: 1, a: 7000 },
  ]);
  const evil = feedOf({ box: { n: 'Box <img src=x onerror="x">', u: "/card/box", p: { US: 15000 } }, etb: { n: "ETB", u: "/card/etb", p: { US: 6000 } } });
  const first = buildStashEmail("tcgprices", valueStash(items, evil, {}), "tok123", true)!;
  assert.ok(first);
  assert.match(first.subject, /^Your collection is up 2\.9% since you added it: US\$360\.00$/);
  assert.ok(!first.html.includes("stored name"), "the stored name never reaches the email");
  assert.ok(!first.html.includes("<img src=x"), "feed names are escaped");
  assert.ok(first.html.includes("https://tcgprices.app/card/box?utm_source=alert-email"));
  assert.ok(first.html.includes("utm_campaign=weekly-stash"));
  assert.ok(first.html.includes("/collection?"));
  assert.ok(first.html.includes(encodeURIComponent("stash:tcgprices")));
  assert.ok(!/ebay|amazon/i.test(first.html), "no marketplace link in the email");
  assert.match(first.text, /Stop the weekly email: /);

  const later = buildStashEmail("tcgprices", valueStash(items, evil, { "US:box": 15000, "US:etb": 6000 }), "tok123", false)!;
  assert.match(later.subject, /^Your TCG Prices collection this week: US\$360\.00$/);
  assert.ok(later.html.includes("No item in your collection changed price this week."));

  const down = buildStashEmail("tcgprices", valueStash(items, evil, { "US:box": 16000, "US:etb": 6000 }), "tok123", false)!;
  assert.match(down.subject, /down 5\.3% this week/);

  // Nothing priced today: no email.
  assert.equal(buildStashEmail("tcgprices", valueStash(parseStashItems([{ id: "tin", m: "US", q: 1 }]), FEED, {}), "t", false), null);
  assert.equal(buildStashEmail("nope", [], "t", false), null);

  const h = stashUnsubscribeHeaders("tok 1", "tcgprices");
  assert.match(h["List-Unsubscribe"], /unsubscribe\?t=tok%201&stash=tcgprices>$/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("due once a week, only while switched on", () => {
  assert.equal(stashDue(false, null, now), false);
  assert.equal(stashDue(true, null, now), true);
  assert.equal(stashDue(true, new Date(now.getTime() - 6 * DAY), now), false);
  assert.equal(stashDue(true, new Date(now.getTime() - STASH_EVERY_MS), now), true);
});

test("price memory reads back safely", () => {
  assert.deepEqual(readPriceMemory({ "US:a": 100, "US:b": -1, "US:c": "x", "US:d": 1.5 }), { "US:a": 100 });
  assert.deepEqual(readPriceMemory(null), {});
  assert.deepEqual(readPriceMemory([1]), {});
});

// ─── The run, against a fake database ─────────────────────────────────────────────────────────────────────────────────

type Stash = { email: string; site: string; items: unknown; weekly: boolean; lastSentAt: Date | null; lastPrices: unknown };

function fakeDb(stashes: Stash[], confirmed: Record<string, string>, counter = 0) {
  const updates: { email: string; data: Record<string, unknown> }[] = [];
  let c = counter;
  const db = {
    sisterStash: {
      findMany: async ({ where }: { where: { weekly: boolean; site: { in: string[] } } }) =>
        stashes.filter((s) => s.weekly === where.weekly && where.site.in.includes(s.site)).map((s) => ({ email: s.email, site: s.site, lastSentAt: s.lastSentAt })),
      findUnique: async ({ where }: { where: { email_site: { email: string; site: string } } }) => stashes.find((s) => s.email === where.email_site.email && s.site === where.email_site.site) ?? null,
      update: async ({ where, data }: { where: { email_site: { email: string } }; data: Record<string, unknown> }) => {
        updates.push({ email: where.email_site.email, data });
        return {};
      },
    },
    sisterAlertAddress: {
      findMany: async ({ where }: { where: { email: { in: string[] } } }) => where.email.in.filter((e) => confirmed[e]).map((e) => ({ email: e, token: confirmed[e] })),
    },
    counter: { upsert: async () => ({ key: "k", value: ++c }) },
  };
  return { db: db as never, updates };
}

const stash = (email: string, extra: Partial<Stash> = {}): Stash => ({
  email,
  site: "tcgprices",
  items: [
    { id: "box", m: "US", q: 1, a: 14000 },
    { id: "etb", m: "US", q: 1, a: 7000 },
  ],
  weekly: true,
  lastSentAt: null,
  lastPrices: null,
  ...extra,
});

test("the run: due, confirmed members get one email each and their prices are remembered; others are skipped", async () => {
  const sent: { to: string; subject: string; headers: Record<string, string>; from: string }[] = [];
  const { db, updates } = fakeDb(
    [
      stash("a@x.com", { items: [{ id: "box", m: "US", q: 1, a: 14000 }] }),
      stash("b@x.com", { lastSentAt: new Date(now.getTime() - 3 * DAY) }), // not due
      stash("c@x.com", { weekly: false }), // switched off
      stash("d@x.com"), // no confirmed address
      stash("e@x.com", { items: [{ id: "tin", m: "US", q: 1 }] }), // nothing priced: no email
      stash("f@x.com", { lastSentAt: new Date(now.getTime() - 8 * DAY), lastPrices: { "US:box": 16000, "US:etb": 6000 } }),
    ],
    { "a@x.com": "ta", "b@x.com": "tb", "e@x.com": "te", "f@x.com": "tf" },
  );
  const s = await runStashDigest({
    db,
    now,
    fetchFeed: async () => FEED,
    send: async (to, subject, _html, extras) => {
      sent.push({ to, subject, headers: extras.headers, from: extras.from });
      return true;
    },
  });
  assert.equal(s.due, 4);
  assert.deepEqual(
    sent.map((m) => m.to),
    ["a@x.com", "f@x.com"],
  );
  assert.equal(sent[0].subject, "Your collection is up 7.1% since you added it: US$150.00");
  assert.match(sent[1].subject, /down 4\.5% this week/);
  assert.match(sent[0].from, /^TCG Prices alerts </);
  assert.match(sent[0].headers["List-Unsubscribe"], /stash=tcgprices/);
  assert.equal(s.emailed, 2);
  assert.equal(s.empty, 1);
  assert.deepEqual(updates[0], { email: "a@x.com", data: { lastSentAt: now, lastPrices: { "US:box": 15000 } } });
  assert.equal(stashHasSiteFailure(s), false);
});

test("the run: the digest share of the mail cap defers the rest to tomorrow; a dry run sends and writes nothing", async () => {
  const many = Array.from({ length: 5 }, (_, i) => stash(`m${i}@x.com`));
  const tokens = Object.fromEntries(many.map((m) => [m.email, "t"]));
  const capped = fakeDb(many, tokens, DIGEST_MAIL_CEILING - 2);
  let sends = 0;
  const s = await runStashDigest({ db: capped.db, now, fetchFeed: async () => FEED, send: async () => (++sends, true) });
  assert.equal(sends, 2);
  assert.equal(s.deferred, 3);
  assert.equal(capped.updates.length, 2);

  const dry = fakeDb(many, tokens);
  const d = await runStashDigest({ db: dry.db, now, fetchFeed: async () => FEED, send: async () => assert.fail("dry run sent"), dryRun: true });
  assert.equal(d.emailed, 5);
  assert.equal(dry.updates.length, 0);
});

test("the run: a stale or failed feed sends nothing and fails the job; a failed send is counted and not marked sent", async () => {
  const stale = fakeDb([stash("a@x.com")], { "a@x.com": "t" });
  const s = await runStashDigest({ db: stale.db, now, fetchFeed: async () => feedOf({}, "2026-11-20T00:00:00Z"), send: async () => assert.fail("sent from a stale feed") });
  assert.equal(stashHasSiteFailure(s), true);
  assert.equal(s.emailed, 0);

  const failing = fakeDb([stash("a@x.com")], { "a@x.com": "t" });
  const f = await runStashDigest({ db: failing.db, now, fetchFeed: async () => FEED, send: async () => false });
  assert.equal(f.failed, 1);
  assert.equal(failing.updates.length, 0);
});

test("the API writes by compare-and-set on the revision, and stopping the email never deletes the list", () => {
  const route = readFileSync(new URL("../src/app/api/sister-premium/stash/route.ts", import.meta.url), "utf8");
  assert.match(route, /updateMany\(\{ where: \{ email, site: site\.key, rev: baseRev \}/);
  assert.match(route, /verifyPremiumSession\(body\?\.token, site\)/);
  assert.match(route, /STASH_SITES\.has\(site\.key\)/);
  for (const f of ["../src/app/api/sister-alerts/manage/route.ts", "../src/app/api/sister-alerts/unsubscribe/route.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/sisterStash\.delete/.test(src), `${f} must only switch the weekly email off`);
    assert.match(src, /sisterStash\.updateMany\(\{ where: \{ email: a\.email[^}]*\}, data: \{ weekly: false \} \}\)/);
  }
});
