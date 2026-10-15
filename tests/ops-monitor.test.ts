import test from "node:test";
import assert from "node:assert/strict";
import {
  NEON_FREE_TRANSFER_BYTES,
  ageSeverity,
  ebayQuotaSeverity,
  humanAge,
  neonUsage,
  pushSample,
  recentRatePerDay,
} from "../src/lib/ops/thresholds";
import { decide, digestDue, emptyState, markDelivered, parseState, planIsUrgent } from "../src/lib/ops/state";
import {
  databaseReachable,
  deployState,
  ebayAuth,
  ebayQuota,
  inboxWaiting,
  neonTransfer,
  priceFreshness,
  runChecks,
  scheduledJobs,
  siteProbe,
  dexcompareIndex,
  stripeChecks,
} from "../src/lib/ops/checks";
import { endpointIdFromUrl } from "../src/lib/ops/neon";
import { buildAlertEmail, buildDigestEmail } from "../src/lib/ops/mail";
import { emptyInbox, type CheckResult, type OpsReport } from "../src/lib/ops/types";
import type { OpsDeps } from "../src/lib/ops/deps";

// ─────────────────────────────────────────────────────────────────────────────
// The ops monitor (DECISIONS.md, "The site watches itself", 2026-10-14). Pure
// logic first (thresholds, the alert state machine, the emails), then each check
// against fake services: no network, no database.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const NOW = new Date("2026-10-14T06:00:00Z");

// ── thresholds ───────────────────────────────────────────────────────────────

test("neon: a project near its allowance is critical, and the free tier is 5 GB", () => {
  assert.equal(NEON_FREE_TRANSFER_BYTES, 5_000_000_000);
  const start = new Date(NOW.getTime() - 5 * DAY);
  const end = new Date(NOW.getTime() + 25 * DAY);
  const v = neonUsage({ usedBytes: 4_600_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW });
  assert.equal(v.severity, "crit");
  assert.ok(v.pct > 0.9);
});

test("neon: 70% used is a warning even with time left", () => {
  const start = new Date(NOW.getTime() - 20 * DAY);
  const end = new Date(NOW.getTime() + 10 * DAY);
  assert.equal(neonUsage({ usedBytes: 3_600_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW }).severity, "warn");
});

test("neon: on pace to run out BEFORE the reset warns early, once a quarter is spent", () => {
  // RM6 and RM7 each ran out in ~5 days. 30% gone at day 1.5 of a 30-day period: ~3.5 days left at that rate.
  const start = new Date(NOW.getTime() - 1.5 * DAY);
  const end = new Date(NOW.getTime() + 28.5 * DAY);
  const v = neonUsage({ usedBytes: 1_500_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW });
  assert.equal(v.severity, "warn");
  assert.ok(v.daysToExhaust! < 4 && v.daysToExhaust! > 3);
});

test("neon: a first-day burst on a fresh restore does not cry wolf below a quarter used", () => {
  const start = new Date(NOW.getTime() - 0.6 * DAY);
  const end = new Date(NOW.getTime() + 29.4 * DAY);
  // 10% used in 14 hours projects badly, but it is under a quarter: stay quiet.
  assert.equal(neonUsage({ usedBytes: 500_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW }).severity, "ok");
});

test("neon: half used and gone within a day and a half is critical", () => {
  const start = new Date(NOW.getTime() - 4 * DAY);
  const end = new Date(NOW.getTime() + 26 * DAY);
  const v = neonUsage({ usedBytes: 2_800_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW, recentBytesPerDay: 2_000_000_000 });
  assert.equal(v.severity, "crit");
});

test("neon: a light project is fine", () => {
  const start = new Date(NOW.getTime() - 15 * DAY);
  const end = new Date(NOW.getTime() + 15 * DAY);
  assert.equal(neonUsage({ usedBytes: 800_000_000, limitBytes: 5e9, periodStart: start, periodEnd: end, now: NOW }).severity, "ok");
});

test("the recent rate uses a sample 6-36 hours old, and a counter reset means no rate", () => {
  const t = NOW.getTime();
  const now = { t, b: 3_000_000_000 };
  assert.equal(recentRatePerDay([{ t: t - 3_600_000, b: 2_990_000_000 }], now), null, "an hour old is too recent to say");
  const r = recentRatePerDay([{ t: t - DAY, b: 2_000_000_000 }], now);
  assert.ok(Math.abs(r! - 1_000_000_000) < 1e6);
  assert.equal(recentRatePerDay([{ t: t - DAY, b: 4_900_000_000 }], now), null, "the period reset");
  assert.equal(recentRatePerDay([{ t: t - 40 * 3_600_000, b: 1 }], now), null, "too old");
});

test("pushSample starts a fresh series when the counter drops and caps its length", () => {
  const s = pushSample([{ t: 1, b: 100 }, { t: 2, b: 200 }], { t: 3, b: 50 });
  assert.deepEqual(s, [{ t: 3, b: 50 }]);
  let many: { t: number; b: number }[] = [];
  for (let i = 0; i < 100; i++) many = pushSample(many, { t: i, b: i });
  assert.equal(many.length, 60);
});

test("age severity, human ages and the eBay allowance", () => {
  assert.equal(ageSeverity(5, 30, 56), "ok");
  assert.equal(ageSeverity(31, 30, 56), "warn");
  assert.equal(ageSeverity(60, 30, 56), "crit");
  assert.equal(ageSeverity(Number.POSITIVE_INFINITY, 30, 56), "crit", "never happened is a verdict");
  assert.equal(ageSeverity(Number.NaN, 30, 56), "unknown");
  assert.equal(humanAge(0.2), "12 min");
  assert.equal(humanAge(5), "5.0 hours");
  assert.equal(humanAge(72), "3.0 days");
  assert.equal(ebayQuotaSeverity(2000, 5000), "ok");
  assert.equal(ebayQuotaSeverity(150, 5000), "warn");
  assert.equal(ebayQuotaSeverity(0, 5000), "crit");
  assert.equal(ebayQuotaSeverity(null, 5000), "unknown");
});

// ── the alert state machine ──────────────────────────────────────────────────

const r = (id: string, severity: CheckResult["severity"], extra: Partial<CheckResult> = {}): CheckResult => ({
  id,
  area: "databases",
  title: `Check ${id}`,
  severity,
  summary: `${id} is ${severity}`,
  checkedAt: NOW.toISOString(),
  ...extra,
});
const later = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

test("a new problem is mailed once, then stays quiet", () => {
  const first = decide(emptyState(), [r("a", "crit")], NOW);
  assert.equal(first.plan.problems.length, 1);
  assert.ok(planIsUrgent(first.plan));
  const sent = markDelivered(first.next, first.plan, NOW);
  const second = decide(sent, [r("a", "crit")], later(3));
  assert.equal(second.plan.problems.length + second.plan.escalations.length + second.plan.reminders.length, 0);
});

test("a problem whose mail did not go out is planned again on the next run", () => {
  const first = decide(emptyState(), [r("a", "crit")], NOW);
  // delivery failed: markDelivered is never called
  const second = decide(first.next, [r("a", "crit")], later(3));
  assert.equal(second.plan.problems.length, 1, "the owner was never told, so it is still new");
});

test("warn then crit is an escalation; crit then warn is silent", () => {
  let st = markDelivered(decide(emptyState(), [r("a", "warn")], NOW).next, decide(emptyState(), [r("a", "warn")], NOW).plan, NOW);
  const up = decide(st, [r("a", "crit")], later(3));
  assert.equal(up.plan.escalations.length, 1);
  st = markDelivered(up.next, up.plan, later(3));
  const down = decide(st, [r("a", "warn")], later(6));
  assert.equal(planIsUrgent(down.plan), false);
  assert.equal(down.next.checks.a!.emailedSev, "warn", "later escalations are measured from the lower level");
});

test("an open problem is repeated after 24 h (critical) or 72 h (warning), not before", () => {
  const crit = decide(emptyState(), [r("c", "crit")], NOW);
  const cs = markDelivered(crit.next, crit.plan, NOW);
  assert.equal(decide(cs, [r("c", "crit")], later(23)).plan.reminders.length, 0);
  assert.equal(decide(cs, [r("c", "crit")], later(25)).plan.reminders.length, 1);
  const warn = decide(emptyState(), [r("w", "warn")], NOW);
  const ws = markDelivered(warn.next, warn.plan, NOW);
  assert.equal(decide(ws, [r("w", "warn")], later(48)).plan.reminders.length, 0);
  assert.equal(decide(ws, [r("w", "warn")], later(73)).plan.reminders.length, 1);
});

test("recovery is mailed only for a problem the owner was told about", () => {
  const told = markDelivered(decide(emptyState(), [r("a", "crit")], NOW).next, decide(emptyState(), [r("a", "crit")], NOW).plan, NOW);
  const back = decide(told, [r("a", "ok")], later(3));
  assert.equal(back.plan.recoveries.length, 1);
  assert.equal(planIsUrgent(back.plan), false, "a recovery alone is not urgent");
  const cleared = markDelivered(back.next, back.plan, later(3));
  assert.equal(decide(cleared, [r("a", "ok")], later(6)).plan.recoveries.length, 0);
  // never told → nothing to announce
  assert.equal(decide(emptyState(), [r("b", "ok")], NOW).plan.recoveries.length, 0);
});

test("'could not check' neither raises nor clears an alert", () => {
  const told = markDelivered(decide(emptyState(), [r("a", "crit")], NOW).next, decide(emptyState(), [r("a", "crit")], NOW).plan, NOW);
  const blind = decide(told, [r("a", "unknown")], later(3));
  assert.equal(blind.plan.recoveries.length, 0);
  assert.equal(blind.next.checks.a!.sev, "crit");
  assert.equal(decide(emptyState(), [r("n", "unknown")], NOW).plan.problems.length, 0);
});

test("saved state survives garbage, and the weekly digest is due after 6.5 days or when forced", () => {
  assert.deepEqual(parseState("not json"), emptyState());
  assert.deepEqual(parseState(JSON.stringify({ v: 2 })), emptyState());
  const st = { ...emptyState(), lastDigestAt: NOW.toISOString() };
  assert.equal(digestDue(st, later(24 * 6), false), false);
  assert.equal(digestDue(st, later(24 * 7), false), true);
  assert.equal(digestDue(emptyState(), NOW, false), false, "no surprise digest on day one");
  assert.equal(digestDue(emptyState(), NOW, true), true);
});

// ── fake services ────────────────────────────────────────────────────────────

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Handler | Response>) {
  const calls: string[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const h = routes[key]!;
    return typeof h === "function" ? h(url, init) : h.clone();
  };
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function deps(over: Partial<OpsDeps> = {}): OpsDeps {
  return {
    now: NOW,
    env: {},
    fetch: async () => {
      throw new Error("no network in this test");
    },
    sleep: async () => {},
    db: null,
    databaseUrls: { operational: null, history: null },
    state: { neonProjects: {}, samples: {} },
    ...over,
  };
}

// ── checks ───────────────────────────────────────────────────────────────────

test("database: a quota refusal is critical and points at the migration; a fast answer is fine", async () => {
  const down = await databaseReachable(
    deps({ db: { ping: async () => { throw new Error("Your project has exceeded the data transfer quota."); } } as unknown as OpsDeps["db"] }),
  );
  assert.equal(down.severity, "crit");
  assert.match(down.summary, /transfer allowance/);
  assert.match(down.action!, /full migration to the next database/);
  const up = await databaseReachable(deps({ db: { ping: async () => {} } as unknown as OpsDeps["db"] }));
  assert.equal(up.severity, "ok");
});

test("neon: without a key it says so (unknown, not an alert); with one it reads the usage", async () => {
  const noKey = await neonTransfer(deps(), "operational");
  assert.equal(noKey.severity, "unknown");
  assert.match(noKey.summary, /Not connected/);

  const { f, calls } = fakeFetch({
    "https://console.neon.tech/api/v2/projects?": json({ projects: [{ id: "proj-other" }, { id: "proj-mine" }] }),
    "https://console.neon.tech/api/v2/projects/proj-other/endpoints": json({ endpoints: [{ id: "ep-someone-else-123" }] }),
    "https://console.neon.tech/api/v2/projects/proj-mine/endpoints": json({ endpoints: [{ id: "ep-young-surf-ayw7zkrh" }] }),
    "https://console.neon.tech/api/v2/projects/proj-mine": json({
      project: {
        id: "proj-mine",
        name: "rm8",
        data_transfer_bytes: 4_700_000_000,
        consumption_period_start: new Date(NOW.getTime() - 20 * DAY).toISOString(),
        consumption_period_end: new Date(NOW.getTime() + 10 * DAY).toISOString(),
      },
    }),
  });
  const d = deps({
    env: { NEON_API_KEY: "k" },
    fetch: f,
    databaseUrls: { operational: "postgresql://u:p@ep-young-surf-ayw7zkrh-pooler.c-5.us-east-2.aws.neon.tech/neondb", history: null },
  });
  const res = await neonTransfer(d, "operational");
  assert.equal(res.severity, "crit");
  assert.match(res.summary, /4\.70 GB of 5\.00 GB/);
  assert.match(res.action!, /full migration/);
  assert.equal(d.state.neonProjects["ep-young-surf-ayw7zkrh"], "proj-mine", "the project is remembered");
  assert.equal(d.state.samples["proj-mine"]!.length, 1);
  const before = calls.length;
  await neonTransfer(d, "operational");
  assert.ok(calls.slice(before).every((u) => !u.includes("/projects?")), "the second run does not walk the project list again");
  assert.ok(!JSON.stringify(res).includes("postgresql://"), "no connection string in a result");
});

test("neon: a rejected key is a warning to fix the key, not an outage", async () => {
  const { f } = fakeFetch({ "https://console.neon.tech/api/v2/projects": json({ message: "unauthorized" }, 401) });
  const res = await neonTransfer(
    deps({ env: { NEON_API_KEY: "bad" }, fetch: f, databaseUrls: { operational: "postgresql://u:p@ep-aaa-bbb-123.c-5.us-east-2.aws.neon.tech/x", history: null } }),
    "operational",
  );
  assert.equal(res.severity, "warn");
  assert.match(res.summary, /rejected/);
});

test("endpoint ids come from the host, pooled or direct", () => {
  assert.equal(endpointIdFromUrl("postgresql://u:p@ep-young-surf-ayw7zkrh-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"), "ep-young-surf-ayw7zkrh");
  assert.equal(endpointIdFromUrl("postgresql://u:p@ep-young-surf-ayw7zkrh.c-5.us-east-2.aws.neon.tech/neondb"), "ep-young-surf-ayw7zkrh");
  assert.equal(endpointIdFromUrl("postgresql://u:p@localhost:5432/x"), null);
  assert.equal(endpointIdFromUrl(null), null);
});

test("ebay: refused keys are critical; a low daily allowance warns; both are quiet when fine", async () => {
  const bad = await ebayAuth(deps({ env: { EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b" }, fetch: fakeFetch({ "https://api.ebay.com/identity": json({}, 401) }).f }));
  assert.equal(bad.check.severity, "crit");
  assert.equal(bad.token, null);
  const good = await ebayAuth(deps({ env: { EBAY_CLIENT_ID: "a", EBAY_CLIENT_SECRET: "b" }, fetch: fakeFetch({ "https://api.ebay.com/identity": json({ access_token: "tok" }) }).f }));
  assert.equal(good.check.severity, "ok");
  assert.equal(good.token, "tok");
  assert.equal((await ebayAuth(deps())).check.severity, "unknown");

  const limit = (remaining: number) =>
    fakeFetch({ "https://api.ebay.com/developer/analytics": json({ rateLimits: [{ resources: [{ name: "buy.browse", rates: [{ limit: 5000, remaining }] }] }] }) }).f;
  assert.equal((await ebayQuota(deps({ fetch: limit(3200) }), "tok")).severity, "ok");
  const low = await ebayQuota(deps({ fetch: limit(120) }), "tok");
  assert.equal(low.severity, "warn");
  assert.deepEqual(low.metric, { value: 4880, limit: 5000, unit: "calls" });
  assert.equal((await ebayQuota(deps(), null)).severity, "unknown");
});

test("scheduled jobs: two failures in a row is critical, one is a warning, a missing run is stale", async () => {
  const run = (conclusion: string | null, hoursAgo: number, status = "completed") => ({ status, conclusion, createdAt: new Date(NOW.getTime() - hoursAgo * 3_600_000) });
  const byFile: Record<string, ReturnType<typeof run>[]> = {
    "refresh-prices.yml": [run("failure", 2), run("failure", 14)],
    "refresh-auctions.yml": [run("failure", 3), run("success", 7)],
    "sealed-refresh.yml": [run("success", 80)],
    "store-health.yml": [run("success", 4), run("success", 16)],
    "production-deploy.yml": [run("cancelled", 1), run("success", 20)],
  };
  const out = await scheduledJobs(deps({ github: { runs: async (f) => byFile[f]!, productionDeploy: async () => null } }));
  const sev = Object.fromEntries(out.map((x) => [x.id, x.severity]));
  assert.equal(sev["job:refresh-prices"], "crit");
  assert.equal(sev["job:refresh-auctions"], "warn");
  assert.equal(sev["job:sealed-refresh"], "crit", "80 h with a 36 h cadence");
  assert.equal(sev["job:store-health"], "ok");
  assert.equal(sev["job:production-deploy"], "ok", "a cancelled run is ignored");
});

test("production build: a failed build is critical and says nothing is down", async () => {
  const bad = await deployState(deps({ github: { runs: async () => [], productionDeploy: async () => ({ state: "failure", description: "Build failed", createdAt: NOW }) } }));
  assert.equal(bad.severity, "crit");
  assert.match(bad.summary, /still serving the version before/);
  const ok = await deployState(deps({ github: { runs: async () => [], productionDeploy: async () => ({ state: "success", description: "", createdAt: NOW }) } }));
  assert.equal(ok.severity, "ok");
});

test("live site: healthy pages pass; a page with no prices warns; server errors are critical", async () => {
  const page = (body: string, status = 200) => () => new Response(body, { status });
  const healthy = fakeFetch({
    "https://riftcompare.com/api/search": () => json({ results: [{ id: 1 }] }),
    "https://riftcompare.com/": page("<p>Astral Heron $30.00</p>"),
  });
  assert.equal((await siteProbe(deps({ fetch: healthy.f }))).severity, "ok");

  const noPrices = fakeFetch({
    "https://riftcompare.com/api/search": () => json({ results: [{ id: 1 }] }),
    "https://riftcompare.com/browse": page("<p>no money here</p>"),
    "https://riftcompare.com/": page("<p>$1.00</p>"),
  });
  const w = await siteProbe(deps({ fetch: noPrices.f }));
  assert.equal(w.severity, "warn");
  assert.match(w.summary, /\/browse loaded but shows no prices/);

  const down = fakeFetch({ "https://riftcompare.com/": page("boom", 503) });
  const c = await siteProbe(deps({ fetch: down.f }));
  assert.equal(c.severity, "crit");
});

test("stripe: a rejected key is critical, and a missing webhook is critical", async () => {
  assert.equal((await stripeChecks(deps()))[0]!.severity, "unknown");
  const rejected = await stripeChecks(deps({ env: { STRIPE_SECRET_KEY: "sk" }, fetch: fakeFetch({ "https://api.stripe.com/v1/balance": json({}, 401) }).f }));
  assert.equal(rejected[0]!.severity, "crit");

  const noHook = await stripeChecks(
    deps({
      env: { STRIPE_SECRET_KEY: "sk" },
      fetch: fakeFetch({
        "https://api.stripe.com/v1/balance": json({ available: [] }),
        "https://api.stripe.com/v1/webhook_endpoints": json({ data: [{ status: "disabled", url: "https://riftcompare.com/api/x" }] }),
      }).f,
    }),
  );
  assert.equal(noHook[0]!.severity, "ok");
  assert.equal(noHook[1]!.severity, "crit");
});

test("inbox: nothing waiting is fine; an old unread item escalates", async () => {
  const inbox = (oldestHoursAgo: number | null, n = 2) => ({ ...emptyInbox(), feedback: n, total: n, oldestAt: oldestHoursAgo == null ? null : new Date(NOW.getTime() - oldestHoursAgo * 3_600_000).toISOString() });
  const mk = (i: ReturnType<typeof inbox>) => deps({ db: { inbox: async () => i } as unknown as OpsDeps["db"] });
  assert.equal((await inboxWaiting(mk(emptyInbox()))).severity, "ok");
  assert.equal((await inboxWaiting(mk(inbox(5)))).severity, "ok", "recent items are covered by the instant email");
  assert.equal((await inboxWaiting(mk(inbox(60)))).severity, "warn");
  assert.equal((await inboxWaiting(mk(inbox(24 * 8)))).severity, "crit");
});

test("running everything with no connections yields only 'not checked' and never throws", async () => {
  const all = await runChecks(deps({ db: { ping: async () => { throw new Error("connect ECONNREFUSED"); } } as unknown as OpsDeps["db"] }));
  assert.ok(all.length >= 8);
  assert.ok(all.every((x) => ["ok", "warn", "crit", "unknown"].includes(x.severity)));
  assert.equal(all.find((x) => x.id === "db:operational")!.severity, "crit");
});

// ── the emails ───────────────────────────────────────────────────────────────

test("the alert email leads with the worst problem, carries what to do, and escapes everything", () => {
  const hostile = r("x", "crit", { title: "Bad <script>alert(1)</script>", summary: "it said \"<b>boom</b>\"", action: "Tell Claude: <img src=x onerror=1>" });
  const plan = decide(emptyState(), [r("a", "warn"), hostile], NOW).plan;
  const mail = buildAlertEmail(plan);
  assert.match(mail.subject, /needs attention: Bad <script>/, "the subject is plain text, escaping is for the HTML");
  assert.ok(!mail.html.includes("<script>alert(1)</script>"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.match(mail.html, /What to do:/);
  assert.match(mail.html, /riftcompare\.com\/admin\/health/);
  assert.match(mail.text, /What to do: Tell Claude/);
});

test("a recovery-only email says things are back to normal", () => {
  const told = markDelivered(decide(emptyState(), [r("a", "crit")], NOW).next, decide(emptyState(), [r("a", "crit")], NOW).plan, NOW);
  const plan = decide(told, [r("a", "ok")], later(3)).plan;
  const mail = buildAlertEmail(plan);
  assert.match(mail.subject, /back to normal/);
  assert.match(mail.html, /Back to normal/);
});

test("the weekly digest says all healthy, or lists what is flagged, and always shows the inbox", () => {
  const rep = (results: CheckResult[]): OpsReport => ({ version: 1, generatedAt: NOW.toISOString(), results, inbox: { ...emptyInbox(), feedback: 2, total: 2 } });
  const good = buildDigestEmail(rep([r("a", "ok"), r("b", "ok")]));
  assert.match(good.subject, /all healthy/);
  assert.match(good.html, /monitor has stopped/);
  assert.match(good.text, /Inbox: 2 feedback/);
  const bad = buildDigestEmail(rep([r("a", "crit"), r("b", "warn"), r("c", "ok")]));
  assert.match(bad.subject, /1 problem need attention/);
});

test("store prices: only the live markets count; a retired market's old rows never alarm, and a live market with none does", async () => {
  const fresh = new Date(NOW.getTime() - 5 * 3_600_000);
  const six = ["AU", "US", "UK", "SG", "CA", "EU"].map((country) => ({ country, newest: fresh, inStock: 100 }));
  const mk = (rows: { country: string; newest: Date | null; inStock: number }[]) => deps({ db: { priceFreshness: async () => rows } as unknown as OpsDeps["db"] });
  const retired = { country: "NZ", newest: new Date(NOW.getTime() - 55 * 24 * 3_600_000), inStock: 3 };
  const ok = (await priceFreshness(mk([...six, retired])))[0]!;
  assert.equal(ok.id, "data:prices");
  assert.equal(ok.severity, "ok", "NZ was 55 days stale on the first live run and must not alarm");
  assert.doesNotMatch(ok.summary, /NZ/);
  const missing = (await priceFreshness(mk(six.filter((m) => m.country !== "CA"))))[0]!;
  assert.equal(missing.severity, "crit");
  assert.match(missing.summary, /CA no prices/);
  const stale = (await priceFreshness(mk(six.map((m) => (m.country === "UK" ? { ...m, newest: new Date(NOW.getTime() - 40 * 3_600_000) } : m)))))[0]!;
  assert.equal(stale.severity, "warn");
  assert.match(stale.summary, /UK 40 hours/);
});

test("DexCompare index: a readable index is ok, a changed format warns, an outage is grey", async () => {
  const img = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_in_1000x1000.jpg`;
  const rows = Array.from({ length: 120 }, (_, i) => [`p-${i}`, "P", "Booster Box", "sv8", img(1000 + i), 100, 1, 1, 0, null]);
  const on = { "https://riftcompare.com/pokemon": () => new Response("", { status: 200 }) };
  const ok = await dexcompareIndex(deps({ fetch: fakeFetch({ ...on, "https://www.dexcompare.app/api/browse/us": json({ v: 1, region: "us", checkedAt: null, rows }) }).f }));
  assert.equal(ok.severity, "ok");
  const changed = await dexcompareIndex(deps({ fetch: fakeFetch({ ...on, "https://www.dexcompare.app/api/browse/us": json({ v: 2, region: "us", rows }) }).f }));
  assert.equal(changed.severity, "warn");
  assert.match(changed.action ?? "", /DexCompare parser/);
  const down = await dexcompareIndex(deps({ fetch: fakeFetch({ ...on, "https://www.dexcompare.app/api/browse/us": () => new Response("x", { status: 503 }) }).f }));
  assert.equal(down.severity, "unknown");
  // The section switched off: grey, and DexCompare is not even asked.
  const off = fakeFetch({ "https://riftcompare.com/pokemon": () => new Response("", { status: 404 }) });
  const offResult = await dexcompareIndex(deps({ fetch: off.f }));
  assert.equal(offResult.severity, "unknown");
  assert.deepEqual(off.calls, ["https://riftcompare.com/pokemon"]);
});
