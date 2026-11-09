import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedOrigin, corsHeaders, SISTER_ALERT_SITES, sisterSite } from "../src/lib/sister-alerts/sites";
import { parseFeed, feedIsFresh, resolvePath, type AlertFeed } from "../src/lib/sister-alerts/feed";
import { evaluateAlert, MIN_GAP_MS, MAX_AGE_MS, MISSING_TTL_MS, suggestedTarget } from "../src/lib/sister-alerts/evaluate";
import { buildAlertEmail, buildConfirmEmail, fromFor, listUnsubscribeHeaders, money } from "../src/lib/sister-alerts/email";
import { pickDeal, runSisterAlerts, runHasSiteFailure } from "../src/lib/sister-alerts/run";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

// DECISIONS.md, "One price alert service for the sister sites" (2026-11-02).

const DAY = 86_400_000;
const now = new Date("2026-11-10T14:20:00Z");

test("only the sister sites' own origins may call the signup API", () => {
  assert.equal(allowedOrigin("https://mtgcompare.app")?.key, "mtg");
  assert.equal(allowedOrigin("https://www.figurecompare.com")?.key, "figure");
  assert.equal(allowedOrigin("http://mtgcompare.app"), null, "https only");
  assert.equal(allowedOrigin("https://mtgcompare.app.evil.com"), null);
  assert.equal(allowedOrigin("https://evil-mtgcompare.app"), null);
  assert.equal(allowedOrigin("https://riftcompare.com"), null, "RiftCompare has its own alerts");
  assert.equal(allowedOrigin("https://kaeyoung.com"), null, "KaeYoung is left out (owner, 2026-11-02)");
  assert.equal(allowedOrigin("https://opcompare.app"), null, "OP Compare has its own alerts");
  assert.equal(allowedOrigin(null), null);
  assert.equal(corsHeaders("https://evil.com")["Access-Control-Allow-Origin"], undefined);
  assert.equal(corsHeaders("https://ygocompare.com")["Access-Control-Allow-Origin"], "https://ygocompare.com");
});

test("the private tables never reach the public export", () => {
  assert.ok(!(PUBLIC_MODELS as readonly string[]).includes("SisterAlert"));
  assert.ok(!(PUBLIC_MODELS as readonly string[]).includes("SisterAlertAddress"));
});

const rawFeed = {
  v: 1,
  site: "mtg",
  generatedAt: "2026-11-10T08:00:00Z",
  items: {
    a1: { n: "Foundations Play Booster Box", u: "/us/sealed/foundations", p: { US: 9000, UK: 8000, XX: 5, AU: -3 } },
    bad: { n: "", u: "/x", p: { US: 1 } },
    evil: { n: "x", u: "https://evil.com", p: { US: 1 } },
  },
  deals: [
    { n: "Bloomburrow Bundle", u: "/us/sealed/bloomburrow-bundle", r: "US", p: 3999, ref: 5999, refLabel: "TCGplayer market" },
    { n: "No ref label", u: "/a", r: "US", p: 100, ref: 200 },
    { n: "Bad region", u: "/a", r: "ZZ", p: 100 },
  ],
};

test("a feed is validated: wrong site refused, bad items and deals dropped, never guessed", () => {
  const f = parseFeed(rawFeed, { key: "mtg" });
  assert.deepEqual(Object.keys(f.items), ["a1"]);
  assert.deepEqual(f.items.a1!.p, { US: 9000, UK: 8000 });
  assert.equal(f.deals.length, 2);
  assert.equal(f.deals[1]!.ref, undefined, "a reference is shown only with its label");
  assert.throws(() => parseFeed(rawFeed, { key: "dex" }), /not "dex"/);
  assert.throws(() => parseFeed({ ...rawFeed, v: 2 }, { key: "mtg" }), /version/);
  assert.ok(feedIsFresh(f, now));
  assert.ok(!feedIsFresh(f, new Date(now.getTime() + 5 * DAY)));
});

const base = { targetCents: 8500, lastNotifiedCents: null, lastNotifiedAt: null, missingSince: null, createdAt: new Date(now.getTime() - 10 * DAY) };

test("an alert fires at or below its target, once, then only on a further 5% drop", () => {
  assert.equal(evaluateAlert(base, 9000, now).kind, "hold");
  assert.deepEqual(evaluateAlert(base, 8500, now), { kind: "fire", priceCents: 8500 });
  const sent = { ...base, lastNotifiedCents: 8000, lastNotifiedAt: new Date(now.getTime() - 4 * DAY) };
  assert.equal(evaluateAlert(sent, 7800, now).kind, "hold", "under 5% further is quiet");
  assert.equal(evaluateAlert(sent, 7600, now).kind, "fire");
  const justSent = { ...sent, lastNotifiedAt: new Date(now.getTime() - MIN_GAP_MS + 1000) };
  assert.equal(evaluateAlert(justSent, 5000, now).kind, "hold", "never twice inside the gap");
  const v = evaluateAlert(sent, 9900, now);
  assert.ok(v.kind === "hold" && v.rearm, "back above target re-arms");
});

test("missing products and old alerts expire", () => {
  const v = evaluateAlert(base, null, now);
  assert.ok(v.kind === "hold" && v.missingSince?.getTime() === now.getTime());
  assert.deepEqual(evaluateAlert({ ...base, missingSince: new Date(now.getTime() - MISSING_TTL_MS - DAY) }, null, now), { kind: "expire", reason: "missing" });
  assert.deepEqual(evaluateAlert({ ...base, createdAt: new Date(now.getTime() - MAX_AGE_MS - DAY) }, 1, now), { kind: "expire", reason: "old" });
  assert.equal(suggestedTarget(13999), 12500);
});

test("the confirmation email carries no text from the form, and alerts carry unsubscribe, share and one sister deal", () => {
  const c = buildConfirmEmail("mtg", "tok123", 12500, "US");
  assert.match(c.subject, /MTG Compare/);
  assert.match(c.html, /api\/sister-alerts\/confirm\?t=tok123/);
  assert.match(c.html, /US\$125\.00/);
  const feeds = new Map<string, AlertFeed>([["dex", { ...parseFeed({ ...rawFeed, site: "dex" }, { key: "dex" }) }]]);
  const deal = pickDeal(sisterSite("mtg")!, "US", feeds, now);
  assert.equal(deal?.site.key, "dex");
  assert.equal(pickDeal(sisterSite("wargame")!, "US", feeds, now), null, "deals only come from the same group");
  const m = buildAlertEmail("mtg", [{ id: "x1", site: "mtg", name: "Foundations <b>Box</b>", path: "/us/sealed/f", region: "US", priceCents: 8000, targetCents: 8500 }], "tok123", deal);
  assert.match(m.subject, /Foundations <b>Box<\/b> is now US\$80\.00/);
  assert.ok(!m.html.includes("<b>Box</b>"), "names are escaped");
  assert.match(m.html, /Send this to a friend/);
  assert.match(m.html, /mailto:\?subject=/);
  assert.match(m.html, /A deal on DexCompare/);
  assert.match(m.html, /stop=x1/);
  assert.match(m.html, /stop=all/);
  assert.match(m.html, /utm_source=alert-email/);
  assert.ok(!/ebay\./i.test(m.html), "no eBay links in email (EPN)");
  assert.equal(listUnsubscribeHeaders("t")["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(fromFor(sisterSite("mtg")!, { EMAIL_FROM: "RiftCompare <noreply@riftcompare.com>" }), "MTG Compare alerts <noreply@riftcompare.com>");
  assert.equal(money(4999, "AU"), "A$49.99");
  assert.equal(resolvePath("/{r}/p/box", "UK"), "/uk/p/box");
  const regional = buildAlertEmail("mtg", [{ id: "x2", site: "mtg", name: "Box", path: "/{r}/p/box", region: "AU", priceCents: 100, targetCents: 200 }], "t", null);
  assert.match(regional.html, /mtgcompare\.app\/au\/p\/box\?utm_source/);
  assert.ok(!regional.html.includes("{r}"));
  assert.equal(money(4999, "UK"), "£49.99");
});

// A small in-memory stand-in for the four Prisma tables the run touches.
function fakeDb(alerts: Record<string, unknown>[], addresses: Record<string, unknown>[]) {
  const counters = new Map<string, number>();
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  const db = {
    sisterAlertAddress: {
      findMany: async ({ where }: { where: { confirmedAt: unknown } }) =>
        addresses.filter((a) => (where.confirmedAt === null ? a.confirmedAt == null && (a.createdAt as Date) < new Date(now.getTime() - 7 * DAY) : a.confirmedAt != null)),
      deleteMany: async () => ({ count: 0 }),
    },
    sisterAlert: {
      findMany: async () => alerts,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return {};
      },
      deleteMany: async ({ where }: { where: { id?: { in: string[] } } }) => {
        deleted.push(...(where.id?.in ?? []));
        return { count: 0 };
      },
      groupBy: async () => [],
    },
    priceAlert: { groupBy: async () => [] },
    sealedWatch: { groupBy: async () => [] },
    deckWatch: { findMany: async () => [] },
    counter: {
      upsert: async ({ where }: { where: { key: string } }) => {
        const v = (counters.get(where.key) ?? 0) + 1;
        counters.set(where.key, v);
        return { key: where.key, value: v };
      },
    },
  };
  return { db, updates, deleted };
}

test("the run sends one email per address and site, stamps only what was sent, and fails loudly on a broken feed", async () => {
  const alert = (id: string, productId: string, extra: Record<string, unknown> = {}) => ({
    id, email: "a@example.com", site: "mtg", productId, region: "US", targetCents: 9500, name: null, path: null,
    lastPriceCents: null, lastNotifiedCents: null, lastNotifiedAt: null, missingSince: null, createdAt: new Date(now.getTime() - DAY), ...extra,
  });
  const { db, updates } = fakeDb(
    [alert("1", "a1"), alert("2", "gone"), alert("3", "a1", { email: "unconfirmed@example.com" })],
    [{ email: "a@example.com", token: "tok", confirmedAt: new Date(), createdAt: new Date() }],
  );
  const sent: { to: string; subject: string; from: string }[] = [];
  const s = await runSisterAlerts({
    db: db as never,
    now,
    fetchFeed: async (site) => {
      if (site.key === "mtg") return parseFeed(rawFeed, site);
      if (site.key === "dex") return parseFeed({ ...rawFeed, site: "dex" }, site);
      throw new Error("not deployed");
    },
    send: async (to, subject, _html, extras) => {
      sent.push({ to, subject, from: extras.from });
      return true;
    },
  });
  assert.equal(s.alerts, 2, "an unconfirmed address's alerts are never checked");
  assert.equal(s.fired, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.subject, /Foundations Play Booster Box/);
  assert.match(sent[0]!.from, /^MTG Compare alerts </);
  const u1 = updates.find((u) => u.id === "1")!;
  assert.equal(u1.data.lastNotifiedCents, 9000);
  assert.equal(u1.data.name, "Foundations Play Booster Box");
  const u2 = updates.find((u) => u.id === "2")!;
  assert.ok(u2.data.missingSince instanceof Date);
  assert.ok(!runHasSiteFailure(s), "a failing deal-only feed is not a failure");

  const broken = fakeDb([alert("1", "a1")], [{ email: "a@example.com", token: "tok", confirmedAt: new Date(), createdAt: new Date() }]);
  const s2 = await runSisterAlerts({ db: broken.db as never, now, fetchFeed: async () => { throw new Error("HTTP 500"); }, send: async () => true });
  assert.ok(runHasSiteFailure(s2));
  assert.equal(broken.updates.length, 0, "a failed feed leaves the alert untouched");
});

test("the routes keep their safety rails", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const signup = read("src/app/api/sister-alerts/route.ts");
  assert.match(signup, /allowedOrigin\(origin\)/);
  assert.match(signup, /site !== fromSite\.key/, "a site adds alerts only for itself");
  assert.match(signup, /claimMailSlot/);
  assert.ok(!/productName|name:\s*parsed/.test(signup), "no product name from the form");
  for (const p of ["confirm", "manage"]) {
    const src = read(`src/app/api/sister-alerts/${p}/route.ts`);
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    assert.ok(!/\.(update|delete|deleteMany|create)\(/.test(get), `${p}: a GET never changes anything`);
  }
  assert.equal(SISTER_ALERT_SITES.length, 10);
  assert.equal(allowedOrigin("https://bandaicompare.com")?.key, "bandai");
  assert.equal(allowedOrigin("https://compareempire.com"), null, "Compare Empire has its own alerts");
});
