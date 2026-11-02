// Empire HQ and the one Monday report (owner, 2026-11-02). DECISIONS.md, "Empire HQ and the one Monday report".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { HQ_SITES, normaliseHost, siteForTag } from "../src/lib/hq/sites";
import { healthFromProbe, healthFromReport, healthFromStatus, hqChecks, judgeJob, judgeLive, parseStatusFile } from "../src/lib/hq/status";
import { parseDone, parseSteps, stepViews } from "../src/lib/hq/owner-steps";
import { buildHqRows, familyTotals, gscWeeks } from "../src/lib/hq/view";
import { buildWeeklyEmail } from "../src/lib/hq/weekly-email";
import { collectSisters } from "../src/lib/hq/collect";
import { SITES } from "../src/lib/earnings/sites";

const NOW = new Date("2026-11-09T21:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const site = (k: string) => HQ_SITES.find((s) => s.key === k)!;

test("every site has a host, a repo and a tag prefix the earnings ledger knows", () => {
  const keys = new Set(SITES.map((s) => s.key));
  assert.equal(new Set(HQ_SITES.map((s) => s.key)).size, HQ_SITES.length);
  for (const s of HQ_SITES) {
    assert.ok(keys.has(s.key), `${s.key} is missing from earnings/sites.ts SITES`);
    assert.equal(normaliseHost(s.url), s.host);
    assert.ok(s.monitor || s.jobs || s.rift, `${s.label} needs a monitor or jobs to watch`);
  }
  assert.equal(siteForTag("pkmn")?.key, "rc");
  assert.equal(normaliseHost("sc-domain:gundamcompare.com"), "gundamcompare.com");
  assert.equal(normaliseHost("https://www.camcompare.app/"), "camcompare.app");
});

test("a status file is read defensively, and a silent monitor is red", () => {
  assert.equal(parseStatusFile("nope"), null);
  assert.equal(parseStatusFile(JSON.stringify({ v: 2 })), null);
  const file = (at: string, checks: unknown[]) => JSON.stringify({ v: 1, site: "x", at, overall: "warn", checks });
  const ok = healthFromStatus(site("gundam"), file(ago(2), [{ name: "Live site", status: "ok", detail: "200" }, { name: "eBay", status: "warn", detail: "late" }]), NOW);
  assert.equal(ok.severity, "warn");
  assert.deepEqual(ok.problems.map((p) => p.name), ["eBay"]);
  const stale = healthFromStatus(site("gundam"), file(ago(30), [{ name: "Live site", status: "ok", detail: "200" }]), NOW);
  assert.equal(stale.severity, "crit");
  assert.equal(healthFromStatus(site("gundam"), null, NOW).severity, "unknown", "not published yet is grey, never an alert");
  // OP's watchdog says fail; HQ speaks crit.
  assert.equal(healthFromStatus(site("oc"), file(ago(1), [{ name: "Neon", status: "fail", detail: "x" }]), NOW).severity, "crit");
});

test("probes: the home page and the import jobs' latest runs", () => {
  const job = { file: "a.yml", label: "Import", maxAgeH: 18 };
  assert.equal(judgeJob(job, [{ conclusion: "success", createdAt: ago(3) }], NOW).severity, "ok");
  assert.equal(judgeJob(job, [{ conclusion: "failure", createdAt: ago(3) }, { conclusion: "success", createdAt: ago(15) }], NOW).severity, "warn");
  assert.equal(judgeJob(job, [{ conclusion: "failure", createdAt: ago(3) }, { conclusion: "failure", createdAt: ago(15) }], NOW).severity, "crit");
  assert.equal(judgeJob(job, [{ conclusion: "success", createdAt: ago(40) }], NOW).severity, "crit");
  assert.equal(judgeJob(job, null, NOW).severity, "unknown");
  assert.equal(judgeLive(200).severity, "ok");
  assert.equal(judgeLive(null).severity, "crit");
  assert.equal(judgeLive(503).severity, "crit");
  const h = healthFromProbe(site("mtg"), 200, { "sealed-import.yml": [{ conclusion: "success", createdAt: ago(2) }], "ebay-import.yml": null }, NOW);
  assert.equal(h.severity, "ok");
});

test("RiftCompare mails red only for the sisters that cannot: a silent monitor, a site without one down", () => {
  const silent = healthFromStatus(site("ygo"), JSON.stringify({ v: 1, at: ago(48), checks: [] }), NOW);
  const amberMonitor = healthFromStatus(site("lorcana"), JSON.stringify({ v: 1, at: ago(1), checks: [{ name: "eBay", status: "fail", detail: "x" }] }), NOW);
  const down = healthFromProbe(site("cc"), null, { "refresh-prices.yml": [{ conclusion: "success", createdAt: ago(1) }] }, NOW);
  const checks = hqChecks([silent, amberMonitor, down], NOW);
  const by = (id: string) => checks.find((c) => c.id === id)!;
  assert.equal(by("hq:ygo:monitor").severity, "crit");
  assert.equal(by("hq:lorcana:monitor").severity, "ok", "its own failed run already mailed the owner");
  assert.equal(by("hq:cc:probe").severity, "crit");
  assert.ok(checks.every((c) => c.area === "sites"));
  // RiftCompare's own row leaves those checks to the sisters' rows.
  const rift = healthFromReport({ generatedAt: ago(1), results: checks }, NOW, 8);
  assert.equal(rift.severity, "ok");
});

test("the collector reads public status files and never throws", async () => {
  const f = async (url: string) => {
    if (url.includes("raw.githubusercontent.com/Specifxx/GundamCompare/ops-status/status.json")) return new Response(JSON.stringify({ v: 1, at: ago(1), checks: [{ name: "Live site", status: "ok", detail: "200" }] }));
    throw new Error("offline");
  };
  const out = await collectSisters({ fetch: f, now: NOW });
  assert.equal(out.length, HQ_SITES.length - 1);
  assert.equal(out.find((h) => h.key === "gundam")!.severity, "ok");
  assert.equal(out.find((h) => h.key === "lorcana")!.severity, "unknown");
  assert.equal(out.find((h) => h.key === "mtg")!.severity, "crit", "a home page that does not answer is red");
});

test("Google clicks: settled weeks per host, properties merged by the per-day max", () => {
  const days = (from: string, n: number, v: number) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse(from) + i * 86400_000).toISOString().slice(0, 10), clicks: v }));
  const j = {
    sites: {
      "https://gundamcompare.com/": { status: "ok", days: days("2026-10-24", 14, 2) },
      "sc-domain:gundamcompare.com": { status: "ok", days: days("2026-10-24", 14, 3) },
      "sc-domain:kaeyoung.com": { status: "ok", days: days("2026-10-31", 7, 1) },
    },
  };
  const g = gscWeeks(j, "2026-11-09");
  assert.equal(g.end, "2026-11-06");
  assert.deepEqual(g.hosts.get("gundamcompare.com"), { last7: 21, prev7: 21 });
  assert.deepEqual(g.hosts.get("kaeyoung.com"), { last7: 7, prev7: null }, "a site with one week has no comparison");
});

test("the steps queue: the public file is valid, safe and parsed defensively", () => {
  const raw = fs.readFileSync("data/hq/owner-steps.json", "utf8");
  const steps = parseSteps(JSON.parse(raw));
  assert.ok(steps.length >= 1);
  assert.equal(steps.length, (JSON.parse(raw).steps as unknown[]).length, "every row parses");
  // Public file: no secret, token or personal address.
  assert.doesNotMatch(raw, /@gmail|@[a-z0-9-]+\.[a-z]{2,}|sk_live|ghp_|github_pat_|re_[A-Za-z0-9]{20}|Bearer /i);
  assert.deepEqual(parseSteps({ steps: [{ id: "Bad id", title: "x" }, { id: "ok-1", title: "" }, { id: "ok-2", title: "T", prompt: "../etc/passwd.md" }] }).map((s) => [s.id, s.prompt]), [["ok-2", null]]);
  const v = stepViews([...steps, { id: "z-done", site: "rc", kind: "chrome", title: "Z", why: "", added: "2026-10-01", prompt: null, done: "2026-10-02" }], parseDone({ done: { [steps[0].id]: "2026-11-03" } }));
  assert.equal(v.find((s) => s.id === steps[0].id)!.doneAt, "2026-11-03");
  assert.ok(v.findIndex((s) => s.doneAt) > v.findIndex((s) => !s.doneAt) || v.every((s) => s.doneAt));
});

test("rows and the Monday email: one row per site, targets, escaped, no secrets", () => {
  const gsc = { hosts: new Map([["riftcompare.com", { last7: 1300, prev7: 1300 }], ["gundamcompare.com", { last7: 22, prev7: 20 }]]) };
  const ledger = [{ key: "rc", label: "", earned: 50000, vercel: 0, other: 0, net: 0 }, { key: "pkmn", label: "", earned: 1000, vercel: 0, other: 0, net: 0 }, { key: "gundam", label: "", earned: 700, vercel: 0, other: 0, net: 0 }];
  const steps = stepViews([{ id: "a-step", site: "all", kind: "chrome", title: "Do <this>", why: "because", added: "2026-11-01", prompt: "x/y.md", done: null }], {});
  const rows = buildHqRows({ gsc, ledgerLast: ledger, ledgerPrev: [], costsConnected: false, health: [], steps });
  assert.equal(rows.length, HQ_SITES.length);
  const rc = rows.find((r) => r.site.key === "rc")!;
  assert.equal(rc.earned.last7, 51000, "Pokémon on RiftCompare counts to RiftCompare");
  assert.equal(rc.met, true);
  assert.equal(rows.find((r) => r.site.key === "gundam")!.met, false, "+15% a week for a sister");
  assert.equal(rows.find((r) => r.site.key === "ky")!.met, null);
  const totals = familyTotals(rows);
  assert.equal(totals.all.last7, 1322);
  const hq = { rows, totals, steps, gscEnd: "2026-11-06", collectedAt: null, earningsDays: ["2026-11-02", "2026-11-08"] as [string, string], costsConnected: false, errors: [] };
  const mail = buildWeeklyEmail({ hq, riftChecks: [], money: { html: "", text: "MONEY" }, growthText: "W1 <b>", siteUrl: "https://riftcompare.com", today: "2026-11-09" });
  assert.match(mail.subject, /^Empire weekly 2026-11-09: /);
  assert.match(mail.subject, /1 step for you/);
  assert.ok(mail.html.includes("Do &lt;this&gt;") && !mail.html.includes("Do <this>"));
  assert.ok(mail.html.includes("W1 &lt;b&gt;"));
  assert.match(mail.text, /Gundam Compare: 22 clicks \+10% ✗/);
  assert.match(mail.text, /https:\/\/riftcompare\.com\/admin\/hq/);
});

test("wiring: the monitor collects HQ, the Monday report replaces the digest and the growth report's schedule", () => {
  const mon = fs.readFileSync("scripts/ops-monitor.ts", "utf8");
  assert.match(mon, /collectSisters\(/);
  assert.match(mon, /\/api\/cron\/weekly-report/);
  assert.match(mon, /buildDigestEmail\(report\)/, "the plain digest stays as the fallback");
  const growth = fs.readFileSync(".github/workflows/growth-report.yml", "utf8");
  assert.doesNotMatch(growth, /^\s*schedule:/m, "the growth report rides in the Monday report");
  const route = fs.readFileSync("src/app/api/cron/weekly-report/route.ts", "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.doesNotMatch(route, /formatMoney|earned/, "the response never carries an amount");
  const page = fs.readFileSync("src/app/admin/hq/page.tsx", "utf8");
  assert.match(page, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\)/);
});
