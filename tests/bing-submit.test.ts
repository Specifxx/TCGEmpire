import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GRADUATE_AT,
  HUB_MAX,
  NEVER_HOSTS,
  RESUBMIT_DAYS,
  TARGETS,
  allowance,
  eligibility,
  isSitemapIndex,
  locs,
  mergeHistory,
  pickToday,
  pruneSent,
  rankUrls,
} from "../scripts/bing-submit";
import { bingSubmitLines, parseBingSubmit } from "../src/lib/hq/bing";
import { bingSubmitCheck, JOBS } from "../src/lib/ops/checks";
import type { OpsDeps } from "../src/lib/ops/deps";

// Bing URL submission for the small sites (DECISIONS.md 2026-11-10, "Bing URL submission").

test("never Dex or Compare Empire, and every small site from the plan is a target", () => {
  for (const h of NEVER_HOSTS) assert.ok(!TARGETS.some((t) => t.host === h), h);
  const hosts = TARGETS.map((t) => t.host);
  for (const h of ["kaeyoung.com", "scentcompare.app", "bandaicompare.com", "sportscardcompare.com", "motorcompare.app", "figurecompare.com", "wargamecompare.com", "gundamcompare.com", "lorcanacompare.com", "ygocompare.com", "cyberpunkcompare.com"]) {
    assert.ok(hosts.includes(h), h);
  }
  assert.equal(eligibility("dexcompare.app", true, 0).go, false);
  assert.equal(eligibility("compareempire.com", true, 0).go, false);
});

test("a site gets submissions only while verified and under 25 indexed pages", () => {
  assert.equal(GRADUATE_AT, 25);
  assert.equal(eligibility("kaeyoung.com", true, 0).go, true);
  assert.equal(eligibility("kaeyoung.com", true, 24).go, true);
  assert.equal(eligibility("kaeyoung.com", true, 25).go, false);
  assert.equal(eligibility("kaeyoung.com", false, 0).go, false, "unverified");
  assert.equal(eligibility("kaeyoung.com", null, 0).go, false, "not in the account");
  assert.equal(eligibility("kaeyoung.com", true, null).go, false, "unknown count");
});

test("ranking: home, then hubs, then products by Google impressions, then sitemap order; off-host and legal pages dropped", () => {
  const u = (p: string) => `https://kaeyoung.com${p}`;
  const urls = [u("/product/a"), u("/product/b"), u("/terms"), u("/sets"), u("/"), u("/product/c"), "https://other.com/x", u("/brands")];
  const demand = { "/product/c": [1, 50, 8], "/product/b": [0, 12, 20], "/brands": [0, 30, 9] };
  assert.deepEqual(rankUrls(urls, "kaeyoung.com", demand), [u("/"), u("/brands"), u("/sets"), u("/product/c"), u("/product/b"), u("/product/a")]);
  assert.deepEqual(rankUrls(urls, "kaeyoung.com", null), [u("/"), u("/sets"), u("/brands"), u("/product/a"), u("/product/b"), u("/product/c")]);
  const many = Array.from({ length: HUB_MAX + 5 }, (_, i) => u(`/hub${i}`));
  const ranked = rankUrls([...many, u("/product/x")], "kaeyoung.com", { "/product/x": [5, 500, 3] });
  assert.equal(ranked[HUB_MAX], u("/product/x"), "hubs beyond HUB_MAX compete with products");
});

test("the allowance is Bing's, capped by ours; unknown means nothing", () => {
  assert.equal(allowance(10, 300, 100), 10);
  assert.equal(allowance(10_000, 50_000, 100), 100);
  assert.equal(allowance(100, 20, 100), 20);
  assert.equal(allowance(-1, -1, 100), 0);
  assert.equal(allowance(10_000, -1, 9_999), 500, "hard max");
});

test("a URL is not resent within 30 days, and old state is pruned", () => {
  assert.equal(RESUBMIT_DAYS, 30);
  const sent = { a: "2026-11-01", b: "2026-10-01" };
  assert.deepEqual(pickToday(["a", "b", "c"], sent, "2026-11-10", 5), ["b", "c"]);
  assert.deepEqual(pickToday(["a", "b", "c"], {}, "2026-11-10", 2), ["a", "b"]);
  assert.deepEqual(pruneSent(sent, "2026-11-10"), { a: "2026-11-01" });
});

test("sitemap parsing reads <loc> and spots an index", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.com/a?b=1&amp;c=2</loc></url><url><loc> https://x.com/ </loc></url></urlset>`;
  assert.deepEqual(locs(xml), ["https://x.com/a?b=1&c=2", "https://x.com/"]);
  assert.equal(isSitemapIndex(xml), false);
  assert.equal(isSitemapIndex("<sitemapindex xmlns='x'><sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>"), true);
});

test("history keeps 21 days, one row per site per day", () => {
  const row = { host: "kaeyoung.com", indexed: 3, verified: true, quotaDaily: 10, quotaMonthly: 300, candidates: 9, source: "sitemap order" as const, submitted: 9, status: "submitted" };
  const h = mergeHistory([{ date: "2026-10-01", host: "kaeyoung.com", indexed: 0, submitted: 5 }, { date: "2026-11-10", host: "kaeyoung.com", indexed: 1, submitted: 1 }], "2026-11-10", [row]);
  assert.deepEqual(h, [{ date: "2026-11-10", host: "kaeyoung.com", indexed: 3, submitted: 9 }]);
});

test("the Monday report shows the week's indexed trend and URLs sent", () => {
  const b = parseBingSubmit({
    generatedAt: "2026-11-17T06:30:00Z",
    status: "ok",
    sites: [{ host: "kaeyoung.com", indexed: 6, submitted: 100, status: "submitted" }, { bad: 1 }],
    history: [
      { date: "2026-11-09", host: "kaeyoung.com", indexed: 0, submitted: 100 },
      { date: "2026-11-11", host: "kaeyoung.com", indexed: 0, submitted: 100 },
      { date: "2026-11-17", host: "kaeyoung.com", indexed: 6, submitted: 100 },
    ],
  });
  assert.deepEqual(bingSubmitLines(b), ["kaeyoung.com: 0 → 6 pages in Bing, 200 URLs submitted in 7 days (submitted)"]);
  assert.deepEqual(bingSubmitLines(parseBingSubmit(null)), []);
  assert.deepEqual(bingSubmitLines(parseBingSubmit({ sites: "x" })), []);
});

const deps = (body: unknown, status = 200): OpsDeps =>
  ({ now: new Date("2026-11-11T12:00:00Z"), fetch: async () => new Response(JSON.stringify(body), { status }) }) as unknown as OpsDeps;

test("the ops check: ok with counts, warn on a failed submit or an unverified site, unknown before the first run", async () => {
  const ok = await bingSubmitCheck(deps({ generatedAt: "2026-11-11T06:30:00Z", status: "ok", sites: [{ host: "kaeyoung.com", indexed: 2, status: "submitted" }] }));
  assert.equal(ok.severity, "ok");
  assert.match(ok.summary, /kaeyoung\.com 2/);
  const bad = await bingSubmitCheck(deps({ generatedAt: "2026-11-11T06:30:00Z", status: "ok", sites: [{ host: "a.com", indexed: 0, status: "failed: HTTP 400" }, { host: "b.com", indexed: null, status: "skipped: not verified in Bing Webmaster" }] }));
  assert.equal(bad.severity, "warn");
  assert.match(bad.summary, /a\.com/);
  assert.match(bad.summary, /b\.com/);
  const stale = await bingSubmitCheck(deps({ generatedAt: "2026-11-08T06:30:00Z", status: "ok", sites: [] }));
  assert.equal(stale.severity, "warn");
  assert.equal((await bingSubmitCheck(deps({}, 404))).severity, "unknown");
  assert.equal((await bingSubmitCheck(deps({ status: "not configured", sites: [] }))).severity, "unknown");
});

test("the daily job is watched, never deploys and never asks Google", () => {
  assert.ok(JOBS.some((j) => j.file === "bing-submit.yml" && j.staleH <= 48));
  const wf = readFileSync(".github/workflows/bing-submit.yml", "utf8");
  assert.match(wf, /cron: "23 6 \* \* \*"/);
  assert.doesNotMatch(wf.replace(/^\s*#.*$/gm, ""), /\[deploy\]/i);
  const src = readFileSync("scripts/bing-submit.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /indexing\.googleapis|urlNotifications/);
});
