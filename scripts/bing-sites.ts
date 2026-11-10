/**
 * BING, EVERY SITE AT ONCE (SEO indexing plan SEO-3, 2026-11-10).
 *
 * Loops over every site the BING_API_KEY account can see (GetUserSites) and prints one line each: pages in Bing's index,
 * pages crawled, crawl errors, 28-day impressions and clicks, and the sitemaps Bing holds (GetFeeds) with the date each
 * was last crawled. bing-coverage.ts answers the same questions in depth for ONE site; this is the family view.
 *
 * READ-ONLY unless `--apply`. With `--apply` it submits `https://<host>/sitemap.xml` (SubmitFeed) for every site whose
 * sitemap Bing does not hold or has not read in 14 days. It never submits for SKIP_HOSTS: DexCompare and Compare Empire
 * get no sitemap resubmits while Google and Bing work through their redirects and rejected pages (owner, 2026-11-10).
 *
 * Fails soft per site and per endpoint (a monitor, exit 0). Pure helpers are exported and tested
 * (tests/bing-sites.test.ts).
 *
 * Usage: BING_API_KEY=… npx tsx scripts/bing-sites.ts [--apply]
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseDotNetDate, pick, pickString, unwrapD } from "./bing-coverage";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const REPORT_PATH = "docs/bing-sites.json";
/** Hosts that never get a resubmit (the plan's rule for Dex and Compare Empire). */
export const SKIP_HOSTS = ["dexcompare.app", "compareempire.com"];
export const STALE_DAYS = 14;

export const hostOf = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();

export interface Feed {
  url: string;
  lastCrawled: string | null;
  status: string;
}

/** The feed for the site's own /sitemap.xml, if Bing holds one (www or apex, any case). */
export function ownSitemap(feeds: Feed[], host: string): Feed | null {
  return feeds.find((f) => hostOf(f.url) === host && /\/sitemap\.xml\/?$/i.test(f.url)) ?? null;
}

/** Should `https://<host>/sitemap.xml` be submitted? Not for a skipped host; yes when Bing has none or has not read it lately. */
export function needsSitemapSubmit(host: string, feeds: Feed[], today: string): { submit: boolean; reason: string } {
  if (SKIP_HOSTS.includes(host)) return { submit: false, reason: "skipped by rule" };
  const f = ownSitemap(feeds, host);
  if (!f) return { submit: true, reason: "Bing holds no sitemap.xml" };
  if (!f.lastCrawled) return { submit: true, reason: "sitemap never read" };
  const days = Math.floor((Date.parse(today) - Date.parse(f.lastCrawled)) / 86_400_000);
  return days > STALE_DAYS ? { submit: true, reason: `last read ${days} days ago` } : { submit: false, reason: `read ${f.lastCrawled}` };
}

async function call<T>(method: string, key: string, params: Record<string, string> = {}, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const url = `${API_BASE}/${method}?${new URLSearchParams({ apikey: key, ...params })}`;
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 160)}` };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: `non-JSON ${text.slice(0, 100)}` };
    }
    return { ok: true, data: unwrapD<T>(parsed) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const key = process.env.BING_API_KEY;
  const apply = process.argv.includes("--apply");
  if (!key) {
    console.log("### Bing, every site: not configured (no BING_API_KEY).");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const sites = await call<unknown[]>("GetUserSites", key);
  if (!sites.ok) {
    console.log(`### Bing, every site: GetUserSites failed: ${sites.error}`);
    return;
  }
  const urls = (Array.isArray(sites.data) ? sites.data : []).map((s) => pickString(s, ["Url", "url"])).filter(Boolean);
  const lines = [`### Bing, every site (${urls.length} verified) ${apply ? "· APPLY" : "· read-only"}`, "", "site | indexed | crawled | errors | 28d impr | 28d clicks | sitemap in Bing | action"];
  const rows: Record<string, unknown>[] = [];
  for (const siteUrl of urls) {
    const host = hostOf(siteUrl);
    const crawl = await call<unknown[]>("GetCrawlStats", key, { siteUrl });
    const traffic = await call<unknown[]>("GetRankAndTrafficStats", key, { siteUrl });
    const feedsRes = await call<unknown[]>("GetFeeds", key, { siteUrl });
    let indexed = "?", crawled = "?", errors = "?";
    if (crawl.ok) {
      const r: unknown[] = Array.isArray(crawl.data) ? crawl.data : [];
      indexed = r.length ? String(pick(r[r.length - 1], ["InIndex"], -1)) : "0";
      crawled = String(r.reduce<number>((a, x) => a + pick(x, ["CrawledPages"]), 0));
      errors = String(r.reduce<number>((a, x) => a + pick(x, ["CrawlErrors"]), 0));
    }
    let impr = "?", clicks = "?";
    if (traffic.ok) {
      const r = (Array.isArray(traffic.data) ? traffic.data : []).slice(-28);
      impr = String(r.reduce<number>((a, x) => a + pick(x, ["Impressions", "ImpressionCount"]), 0));
      clicks = String(r.reduce<number>((a, x) => a + pick(x, ["Clicks", "ClickCount"]), 0));
    }
    const feeds: Feed[] = feedsRes.ok
      ? (Array.isArray(feedsRes.data) ? feedsRes.data : []).map((f) => ({
          url: pickString(f, ["Url", "url"]),
          lastCrawled: parseDotNetDate((f as Record<string, unknown>).LastCrawled),
          status: pickString(f, ["Status"]),
        }))
      : [];
    const own = ownSitemap(feeds, host);
    const decision = feedsRes.ok ? needsSitemapSubmit(host, feeds, today) : { submit: false, reason: `GetFeeds failed: ${feedsRes.error}` };
    let action = decision.submit ? `needs submit (${decision.reason})` : decision.reason;
    if (apply && decision.submit) {
      const sub = await call("SubmitFeed", key, {}, { siteUrl, feedUrl: `https://${new URL(siteUrl).host}/sitemap.xml` });
      action = sub.ok ? `SUBMITTED (${decision.reason})` : `submit failed: ${sub.error}`;
    }
    lines.push(`${host} | ${indexed} | ${crawled} | ${errors} | ${impr} | ${clicks} | ${own ? `${own.lastCrawled ?? "never"} ${own.status}`.trim() : feeds.length ? `${feeds.length} other feeds` : "none"} | ${action}`);
    rows.push({ host, indexed, crawled, errors, impr, clicks, sitemap: own, action });
  }
  const txt = lines.join("\n");
  console.log(txt);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, txt + "\n", { flag: "a" });
    } catch {}
  }
  try {
    writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), sites: rows }, null, 2) + "\n");
  } catch {}
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => console.error("bing-sites failed:", e instanceof Error ? e.message : e));
}
