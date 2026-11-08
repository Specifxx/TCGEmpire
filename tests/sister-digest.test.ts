import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeed, type AlertFeed } from "../src/lib/sister-alerts/feed";
import {
  buildDigestEmail,
  computeDrops,
  digestHasSiteFailure,
  digestUnsubscribeHeaders,
  editionDue,
  readDrops,
  readSnapshot,
  runSisterDigest,
  snapshotOf,
  DIGEST_MAIL_CEILING,
  EDITION_EVERY_MS,
  MAX_DROPS,
} from "../src/lib/sister-alerts/digest";
import { SISTER_DAILY_MAIL_CAP } from "../src/lib/sister-alerts/mail-cap";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

// DECISIONS.md, "A weekly biggest-drops email for the sister sites" (2026-11-08).

const DAY = 86_400_000;
const now = new Date("2026-11-16T14:20:00Z");

const feedOf = (items: Record<string, { n: string; u: string; p: Record<string, number> }>, generatedAt = "2026-11-16T08:00:00Z"): AlertFeed =>
  parseFeed({ v: 1, site: "mtg", generatedAt, items, deals: [] }, { key: "mtg" });

test("the private tables never reach the public export", () => {
  for (const m of ["SisterDigest", "SisterDigestEdition"]) assert.ok(!(PUBLIC_MODELS as readonly string[]).includes(m));
});

test("drops: a real fall of 8–60% and at least 3.00, biggest share first, at most ten", () => {
  const prev = { a: { US: 10000, UK: 9000 }, b: { US: 10000 }, c: { US: 10000 }, d: { US: 10000 }, e: { US: 2000 }, f: { US: 10000 } };
  const feed = feedOf({
    a: { n: "Box A", u: "/{r}/p/a", p: { US: 8000, UK: 9500 } }, // −20% US, UK rose
    b: { n: "Box B", u: "/p/b", p: { US: 9500 } }, // −5%: too small a share
    c: { n: "Box C", u: "/p/c", p: { US: 3000 } }, // −70%: more likely a wrong listing
    d: { n: "Box D", u: "/p/d", p: { US: 6000 } }, // −40%
    e: { n: "Pack E", u: "/p/e", p: { US: 1750 } }, // −12.5% but only 2.50 off
    f: { n: "Gone F", u: "/p/f", p: {} }, // no price this week: not a drop
    g: { n: "New G", u: "/p/g", p: { US: 100 } }, // no price last week
  });
  const drops = computeDrops(prev, feed);
  assert.deepEqual(drops.US?.map((d) => d.id), ["d", "a"]);
  assert.deepEqual(drops.US?.[0], { id: "d", n: "Box D", u: "/p/d", was: 10000, now: 6000 });
  assert.equal(drops.UK, undefined);

  const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`x${i}`, { US: 10000 }]));
  const manyFeed = feedOf(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`x${i}`, { n: `X${i}`, u: "/x", p: { US: 9000 - i * 100 } }])));
  assert.equal(computeDrops(many, manyFeed).US?.length, MAX_DROPS);
});

test("the stored snapshot keeps prices of 5.00 or more and reads back safely", () => {
  const s = snapshotOf(feedOf({ a: { n: "A", u: "/a", p: { US: 499, UK: 500 } }, b: { n: "B", u: "/b", p: { US: 100 } } }));
  assert.deepEqual(s, { a: { UK: 500 } });
  assert.deepEqual(readSnapshot({ a: { US: 700, XX: 5, UK: -1 }, b: "junk" }), { a: { US: 700 } });
  assert.deepEqual(readSnapshot(null), {});
  assert.deepEqual(readDrops({ US: [{ id: "a", n: "A", u: "/a", was: 1000, now: 900 }, { id: "b", n: "B", u: "/b", was: 900, now: 1000 }], ZZ: [] }), { US: [{ id: "a", n: "A", u: "/a", was: 1000, now: 900 }] });
});

test("an edition is due about once a week", () => {
  assert.ok(editionDue(null, now));
  assert.ok(!editionDue(new Date(now.getTime() - 6 * DAY), now));
  assert.ok(editionDue(new Date(now.getTime() - EDITION_EVERY_MS), now));
  assert.ok(editionDue(new Date(now.getTime() - 7 * DAY + 60_000), now), "the cron's fixed hour still lands on day seven");
});

test("the weekly email links only to the site, escapes names, and stops with one click", () => {
  const drops = [
    { id: "a", n: "Box <b>A</b>", u: "/{r}/p/a", was: 10000, now: 8000 },
    { id: "b", n: "Box B", u: "/p/b", was: 5000, now: 4000 },
    { id: "c", n: "Box C", u: "/p/c", was: 3000, now: 2700 },
  ];
  const m = buildDigestEmail("mtg", "AU", drops, "tok");
  assert.match(m.subject, /biggest price drops on MTG Compare/);
  assert.ok(!m.html.includes("<b>A</b>"));
  assert.match(m.html, /mtgcompare\.app\/au\/p\/a\?utm_source=alert-email&amp;utm_medium=email&amp;utm_campaign=weekly-drops/);
  assert.match(m.html, /A\$80\.00/);
  assert.match(m.html, /down 20%/);
  assert.match(m.html, /stop=digest%3Amtg/);
  assert.ok(!/ebay\./i.test(m.html + m.text), "no eBay links in email (EPN)");
  assert.ok(!/amazon\./i.test(m.html + m.text));
  const h = digestUnsubscribeHeaders("tok", "mtg");
  assert.match(h["List-Unsubscribe"]!, /unsubscribe\?t=tok&digest=mtg>$/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(DIGEST_MAIL_CEILING < SISTER_DAILY_MAIL_CAP, "confirmations and alerts keep part of the day's mail");
});

function fakeDb(opts: { subs: Record<string, unknown>[]; addresses: { email: string; token: string; confirmed: boolean }[]; edition?: Record<string, unknown>; counter?: number }) {
  let edition = opts.edition ?? null;
  let counter = opts.counter ?? 0;
  const subUpdates: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const db = {
    sisterDigest: {
      findMany: async () => opts.subs,
      update: async ({ where, data }: { where: { email_site: { email: string } }; data: Record<string, unknown> }) => {
        subUpdates.push({ email: where.email_site.email, ...data });
        return {};
      },
    },
    sisterAlertAddress: {
      findMany: async ({ where }: { where: { email: { in: string[] } } }) =>
        opts.addresses.filter((a) => a.confirmed && where.email.in.includes(a.email)).map((a) => ({ email: a.email, token: a.token })),
    },
    sisterDigestEdition: {
      findMany: async () => (edition ? [{ site: edition.site, edition: edition.edition, builtAt: edition.builtAt }] : []),
      findUnique: async ({ select }: { select: Record<string, boolean> }) => {
        reads.push(Object.keys(select).join(","));
        return edition;
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        edition = create;
        return create;
      },
    },
    counter: { upsert: async () => ({ key: "k", value: ++counter }) },
  };
  return { db, subUpdates, reads, get edition() { return edition; } };
}

const sub = (email: string, extra: Record<string, unknown> = {}) => ({ email, site: "mtg", region: "US", lastEdition: null, ...extra });

test("the first week only stores the baseline; a week later each confirmed subscriber gets the edition once", async () => {
  const thisWeek = feedOf({
    a: { n: "Box A", u: "/p/a", p: { US: 8000 } },
    b: { n: "Box B", u: "/p/b", p: { US: 7000 } },
    c: { n: "Box C", u: "/p/c", p: { US: 9000 } },
  });
  const f = fakeDb({ subs: [sub("a@x.com"), sub("unconfirmed@x.com")], addresses: [{ email: "a@x.com", token: "t1", confirmed: true }, { email: "unconfirmed@x.com", token: "t2", confirmed: false }] });
  const sent: string[] = [];
  const send = async (to: string) => {
    sent.push(to);
    return true;
  };
  const s1 = await runSisterDigest({ db: f.db as never, now, fetchFeed: async () => thisWeek, send });
  assert.equal(s1.sites.mtg!.edition, "first");
  assert.equal(sent.length, 0, "no email without a week to compare against");
  assert.equal(s1.subscribers, 1, "an unconfirmed address is never emailed");

  // Seven days on: a week-old edition with last week's prices.
  const later = new Date(now.getTime() + 7 * DAY);
  const g = fakeDb({
    subs: [sub("a@x.com"), sub("unconfirmed@x.com")],
    addresses: [{ email: "a@x.com", token: "t1", confirmed: true }],
    edition: { site: "mtg", edition: "2026-11-16", builtAt: now, prices: { a: { US: 10000 }, b: { US: 10000 }, c: { US: 10000 } }, drops: {} },
  });
  const s2 = await runSisterDigest({ db: g.db as never, now: later, fetchFeed: async () => ({ ...thisWeek, generatedAt: later.toISOString() }), send });
  assert.equal(s2.sites.mtg!.edition, "built");
  assert.equal(s2.emailed, 1);
  assert.deepEqual(sent, ["a@x.com"]);
  assert.equal(g.subUpdates[0]!.lastEdition, "2026-11-23");
  assert.ok(!digestHasSiteFailure(s2));

  // The next day: the edition is current, the subscriber already has it, and the big blob is not read.
  const h = fakeDb({ subs: [sub("a@x.com", { lastEdition: "2026-11-23" })], addresses: [{ email: "a@x.com", token: "t1", confirmed: true }], edition: g.edition! });
  const s3 = await runSisterDigest({ db: h.db as never, now: new Date(later.getTime() + DAY), fetchFeed: async () => { throw new Error("must not fetch"); }, send });
  assert.equal(s3.sites.mtg!.edition, "current");
  assert.equal(s3.emailed, 0);
  assert.ok(!h.reads.includes("prices"), "the daily run never reads the prices blob");
});

test("fewer than three drops sends nothing; the digest stops at its share of the daily cap; a broken feed is loud", async () => {
  const edition = { site: "mtg", edition: "2026-11-16", builtAt: new Date(now.getTime() - DAY), prices: {}, drops: { US: [{ id: "a", n: "A", u: "/a", was: 1000, now: 800 }] } };
  const few = fakeDb({ subs: [sub("a@x.com")], addresses: [{ email: "a@x.com", token: "t", confirmed: true }], edition });
  const s = await runSisterDigest({ db: few.db as never, now, send: async () => true });
  assert.equal(s.skippedFewDrops, 1);
  assert.equal(s.emailed, 0);

  const three = { ...edition, drops: { US: [1, 2, 3].map((i) => ({ id: `p${i}`, n: `P${i}`, u: "/p", was: 1000, now: 800 })) } };
  const full = fakeDb({ subs: [sub("a@x.com"), sub("b@x.com"), sub("c@x.com")], addresses: ["a", "b", "c"].map((e) => ({ email: `${e}@x.com`, token: e, confirmed: true })), edition: three, counter: DIGEST_MAIL_CEILING - 1 });
  const sent: string[] = [];
  const s2 = await runSisterDigest({ db: full.db as never, now, send: async (to) => (sent.push(to), true) });
  assert.equal(s2.emailed, 1);
  assert.equal(s2.deferred, 2, "the rest wait for tomorrow");

  const broken = fakeDb({ subs: [sub("a@x.com")], addresses: [{ email: "a@x.com", token: "t", confirmed: true }] });
  const s3 = await runSisterDigest({ db: broken.db as never, now, fetchFeed: async () => { throw new Error("HTTP 500"); }, send: async () => true });
  assert.ok(digestHasSiteFailure(s3));
  assert.equal(broken.edition, null, "a failed feed writes nothing");
});

test("the routes keep the digest opt-in and its stop links", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const signup = read("src/app/api/sister-alerts/route.ts");
  assert.match(signup, /weekly: z\.boolean\(\)\.optional\(\)/);
  assert.match(signup, /if \(weekly === true\)/, "only a ticked box subscribes");
  const manage = read("src/app/api/sister-alerts/manage/route.ts");
  const get = manage.slice(manage.indexOf("export async function GET"), manage.indexOf("export async function POST"));
  assert.ok(!/\.(update|upsert|delete|deleteMany|create)\(/.test(get), "a GET never changes anything");
  const unsub = read("src/app/api/sister-alerts/unsubscribe/route.ts");
  assert.match(unsub, /sisterDigest\.deleteMany/);
  const cron = read("src/app/api/cron/sister-alerts/route.ts");
  assert.ok(cron.indexOf("runSisterAlerts({") < cron.indexOf("runSisterDigest({"), "alerts get the day's mail first");
});
