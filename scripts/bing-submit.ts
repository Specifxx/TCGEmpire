/**
 * BING URL SUBMISSION FOR THE SMALL SITES (zero-earnings plan, 2026-11-10; DECISIONS.md "Bing URL submission").
 *
 * Bing held 0 pages for KaeYoung, ScentCompare, BandaiCompare, SportsCardCompare and MotorCompare on 10 Nov, and
 * under 25 for six more sister sites, while Bing and DuckDuckGo already send Cyberpunk Compare more visitors than
 * Google. Bing's Webmaster API takes URLs directly (SubmitUrlBatch), on a per-site daily allowance
 * (GetUrlSubmissionQuota). Once a day, for every site in TARGETS that the BING_API_KEY account has VERIFIED and that
 * Bing indexes fewer than GRADUATE_AT pages of, this script submits the best URLs it has not sent lately:
 *
 *   1. the home page,
 *   2. the hubs (one path segment: /sealed, /sets, /brands…; legal pages left out), at most HUB_MAX,
 *   3. everything else in the site's own sitemap,
 *
 * hubs and the rest ordered by Google impressions from the site's `demand` branch (gsc-pages.json, written by
 * sister-demand-export.mjs), then by sitemap order where a site has no demand file. Only URLs the site's sitemap lists
 * are ever sent (they are its canonical, indexable pages), never one sent in the last RESUBMIT_DAYS days, and never
 * more than min(Bing's daily allowance, BING_SUBMIT_MAX) a day per site.
 *
 * Never DexCompare or Compare Empire (owner, 2026-11-10: no resubmits while their redirects settle), never a Google
 * indexing request, never a site Bing has not verified for this account (the account is bill.jyang101@gmail.com's).
 *
 * State (what was sent when) lives in STATE_PATH, kept between runs by the workflow's Actions cache; losing it only
 * means a URL may be sent again. The day's summary goes to data/hq/bing-submit.json (committed to main without
 * [deploy]) for the Monday report and the ops check. Public numbers only.
 *
 * Usage: BING_API_KEY=… npx tsx scripts/bing-submit.ts [--dry-run]
 * Pure helpers are exported and tested (tests/bing-submit.test.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { pick, pickString, unwrapD } from "./bing-coverage";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
export const SUMMARY_PATH = "data/hq/bing-submit.json";
export const STATE_PATH = ".bing-submit-state.json";

/** A site stops getting submissions once Bing indexes this many of its pages. */
export const GRADUATE_AT = 25;
/** Our own ceiling per site per day, under Bing's allowance; BING_SUBMIT_MAX may lower or raise it up to HARD_MAX. */
export const DEFAULT_MAX_PER_SITE = 100;
export const HARD_MAX = 500;
/** A URL is not sent again for this many days. */
export const RESUBMIT_DAYS = 30;
export const HUB_MAX = 20;
/** Days of per-site history kept in the summary (the Monday report reads the last 7). */
export const HISTORY_DAYS = 21;

/** The sites this job works on. Dex and Compare Empire are left out on purpose (owner, 2026-11-10). */
export const TARGETS: { host: string; repo: string }[] = [
  { host: "kaeyoung.com", repo: "Specifxx/Kaeyoung" },
  { host: "scentcompare.app", repo: "Specifxx/scentcompare" },
  { host: "bandaicompare.com", repo: "Specifxx/bandaicompare" },
  { host: "sportscardcompare.com", repo: "Specifxx/waxcompare" },
  { host: "motorcompare.app", repo: "Specifxx/motorcompare" },
  { host: "figurecompare.com", repo: "Specifxx/figurecompare" },
  { host: "wargamecompare.com", repo: "Specifxx/wargamecompare" },
  { host: "gundamcompare.com", repo: "Specifxx/GundamCompare" },
  { host: "lorcanacompare.com", repo: "Specifxx/lorcanacompare" },
  { host: "ygocompare.com", repo: "Specifxx/ygocompare" },
  { host: "cyberpunkcompare.com", repo: "Specifxx/cyberpunkcompare" },
];
export const NEVER_HOSTS = ["dexcompare.app", "compareempire.com"];

export const hostOf = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();

/** "/", "/sealed", "/product/x" from any URL; trailing slash dropped, like gsc-pages.json's keys. */
export function pathOf(u: string): string {
  try {
    return decodeURIComponent(new URL(u).pathname).replace(/\/$/, "") || "/";
  } catch {
    return "";
  }
}

const LEGAL = /^\/(about|terms|privacy|disclosure|contact|cookies|methodology|faq|legal|imprint|accessibility|affiliate-disclosure)$/i;

/** <loc> values of a sitemap or sitemap index, entities decoded. */
export function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
}

export const isSitemapIndex = (xml: string) => /<sitemapindex[\s>]/i.test(xml);

/**
 * Orders a site's sitemap URLs: the home page, then up to HUB_MAX hubs, then the rest; hubs and the rest by Google
 * impressions (demand[path][1]) high to low, ties and unknowns in sitemap order. Off-host URLs are dropped. Pure.
 */
export function rankUrls(urls: readonly string[], host: string, demand: Record<string, number[]> | null): string[] {
  const seen = new Set<string>();
  const items: { url: string; path: string; idx: number; impr: number }[] = [];
  urls.forEach((url, idx) => {
    if (hostOf(url) !== host || seen.has(url)) return;
    const path = pathOf(url);
    if (!path) return;
    seen.add(url);
    items.push({ url, path, idx, impr: demand?.[path]?.[1] ?? 0 });
  });
  const byDemand = (a: (typeof items)[number], b: (typeof items)[number]) => b.impr - a.impr || a.idx - b.idx;
  const home = items.filter((i) => i.path === "/").sort((a, b) => a.idx - b.idx).slice(0, 1);
  const hubs = items.filter((i) => i.path !== "/" && i.path.split("/").length === 2 && !LEGAL.test(i.path)).sort(byDemand).slice(0, HUB_MAX);
  const taken = new Set([...home, ...hubs].map((i) => i.url));
  const rest = items.filter((i) => !taken.has(i.url) && !LEGAL.test(i.path)).sort(byDemand);
  return [...home, ...hubs, ...rest].map((i) => i.url);
}

/** How many URLs a site gets today: Bing's daily and monthly allowance (negative = unknown), capped by ours. Pure. */
export function allowance(daily: number, monthly: number, max: number): number {
  const cap = Math.max(0, Math.min(HARD_MAX, Math.floor(max)));
  if (daily < 0) return 0; // unknown allowance: send nothing rather than spend blind
  return Math.max(0, Math.min(cap, daily, monthly < 0 ? daily : monthly));
}

/** The URLs to send today: ranked order, skipping any sent within RESUBMIT_DAYS of today. Pure. */
export function pickToday(ranked: readonly string[], sent: Record<string, string>, today: string, n: number): string[] {
  const t = Date.parse(today);
  const out: string[] = [];
  for (const u of ranked) {
    if (out.length >= n) break;
    const last = sent[u];
    if (last && (t - Date.parse(last)) / 86_400_000 < RESUBMIT_DAYS) continue;
    out.push(u);
  }
  return out;
}

/** Drops state entries older than RESUBMIT_DAYS so the cache stays small. Pure. */
export function pruneSent(sent: Record<string, string>, today: string): Record<string, string> {
  const t = Date.parse(today);
  return Object.fromEntries(Object.entries(sent).filter(([, d]) => (t - Date.parse(d)) / 86_400_000 < RESUBMIT_DAYS));
}

/** Should the site get submissions today? Pure. */
export function eligibility(host: string, verified: boolean | null, indexed: number | null): { go: boolean; reason: string } {
  if (NEVER_HOSTS.includes(host)) return { go: false, reason: "never submitted (owner rule)" };
  if (verified === null) return { go: false, reason: "not in this Bing Webmaster account" };
  if (!verified) return { go: false, reason: "not verified in Bing Webmaster" };
  if (indexed === null) return { go: false, reason: "indexed count unreadable" };
  if (indexed >= GRADUATE_AT) return { go: false, reason: `graduated (${indexed} indexed)` };
  return { go: true, reason: `${indexed} indexed` };
}

export interface SiteRow {
  host: string;
  indexed: number | null;
  verified: boolean | null;
  quotaDaily: number;
  quotaMonthly: number;
  candidates: number;
  source: "search demand" | "sitemap order" | "-";
  submitted: number;
  /** "submitted", "skipped: <why>" or "failed: <why>". */
  status: string;
}

export interface HistoryRow {
  date: string;
  host: string;
  indexed: number | null;
  submitted: number;
}

/** Appends today's rows and keeps HISTORY_DAYS of history, one row per (date, host). Pure. */
export function mergeHistory(prev: readonly HistoryRow[], today: string, rows: readonly SiteRow[]): HistoryRow[] {
  const cut = Date.parse(today) - HISTORY_DAYS * 86_400_000;
  const kept = prev.filter((h) => h.date !== today && Date.parse(h.date) > cut);
  return [...kept, ...rows.map((r) => ({ date: today, host: r.host, indexed: r.indexed, submitted: r.submitted }))];
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────────────────────

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(method: string, key: string, params: Record<string, string> = {}, body?: unknown): Promise<CallResult<T>> {
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
    try {
      return { ok: true, data: unwrapD<T>(JSON.parse(text)) as T };
    } catch {
      return { ok: false, error: `non-JSON ${text.slice(0, 100)}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const UA = "CompareEmpireBingSubmit/1.0 (+https://riftcompare.com)";

async function getText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** Every page URL in the site's sitemap, following a sitemap index one level deep (at most 40 children). */
async function sitemapUrls(host: string): Promise<string[] | null> {
  const root = (await getText(`https://${host}/sitemap.xml`)) ?? (await getText(`https://www.${host}/sitemap.xml`));
  if (root == null) return null;
  if (!isSitemapIndex(root)) return locs(root);
  const out: string[] = [];
  for (const child of locs(root).slice(0, 40)) {
    const xml = await getText(child);
    if (xml && !isSitemapIndex(xml)) out.push(...locs(xml));
  }
  return out;
}

/** The site's gsc-pages.json from its `demand` branch, or null (no branch, private without a token, unreadable). */
async function demandPages(repo: string): Promise<Record<string, number[]> | null> {
  const token = process.env.REPORTS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  try {
    const r = token
      ? await fetch(`https://api.github.com/repos/${repo}/contents/gsc-pages.json?ref=demand`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28" },
          signal: AbortSignal.timeout(20_000),
        })
      : await fetch(`https://raw.githubusercontent.com/${repo}/demand/gsc-pages.json`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const pages = ((await r.json()) as { pages?: unknown }).pages;
    return pages && typeof pages === "object" ? (pages as Record<string, number[]>) : null;
  } catch {
    return null;
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const key = process.env.BING_API_KEY;
  const dry = process.argv.includes("--dry-run");
  const today = new Date().toISOString().slice(0, 10);
  const max = Number(process.env.BING_SUBMIT_MAX || DEFAULT_MAX_PER_SITE);
  const prevSummary = readJson<{ history?: HistoryRow[] }>(SUMMARY_PATH, {});
  if (!key) {
    console.log("### Bing URL submission: not configured (no BING_API_KEY).");
    writeFileSync(SUMMARY_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), status: "not configured", sites: [], history: prevSummary.history ?? [] }, null, 2) + "\n");
    return;
  }
  const state = readJson<Record<string, Record<string, string>>>(STATE_PATH, {});
  const sites = await call<unknown[]>("GetUserSites", key);
  if (!sites.ok) {
    console.log(`### Bing URL submission: GetUserSites failed: ${sites.error}`);
    writeFileSync(SUMMARY_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), status: `failed: GetUserSites ${sites.error.slice(0, 120)}`, sites: [], history: prevSummary.history ?? [] }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }
  const listed = (Array.isArray(sites.data) ? sites.data : []).map((s) => {
    const r = s as Record<string, unknown>;
    return { url: pickString(s, ["Url", "url"]), verified: typeof r.IsVerified === "boolean" ? r.IsVerified : true };
  });

  const rows: SiteRow[] = [];
  for (const t of TARGETS) {
    const row: SiteRow = { host: t.host, indexed: null, verified: null, quotaDaily: -1, quotaMonthly: -1, candidates: 0, source: "-", submitted: 0, status: "" };
    rows.push(row);
    const site = listed.find((s) => hostOf(s.url) === t.host);
    if (site) {
      row.verified = site.verified;
      const crawl = await call<unknown[]>("GetCrawlStats", key, { siteUrl: site.url });
      if (crawl.ok) {
        const r: unknown[] = Array.isArray(crawl.data) ? crawl.data : [];
        row.indexed = r.length ? Math.max(0, pick(r[r.length - 1], ["InIndex"], 0)) : 0;
      }
    }
    const e = eligibility(t.host, row.verified, row.indexed);
    if (!e.go || !site) {
      row.status = `skipped: ${e.reason}`;
      continue;
    }
    const quota = await call<Record<string, unknown>>("GetUrlSubmissionQuota", key, { siteUrl: site.url });
    if (!quota.ok) {
      row.status = `failed: quota ${quota.error.slice(0, 120)}`;
      continue;
    }
    row.quotaDaily = pick(quota.data, ["DailyQuota"], -1);
    row.quotaMonthly = pick(quota.data, ["MonthlyQuota"], -1);
    const n = allowance(row.quotaDaily, row.quotaMonthly, max);
    if (n === 0) {
      row.status = `skipped: no allowance left today (${row.quotaDaily}/day, ${row.quotaMonthly}/month)`;
      continue;
    }
    const urls = await sitemapUrls(t.host);
    if (!urls || !urls.length) {
      row.status = "failed: sitemap unreadable";
      continue;
    }
    const demand = await demandPages(t.repo);
    row.source = demand && Object.keys(demand).length ? "search demand" : "sitemap order";
    const ranked = rankUrls(urls, t.host, demand);
    row.candidates = ranked.length;
    const sent = pruneSent(state[t.host] ?? {}, today);
    const batch = pickToday(ranked, sent, today, n);
    if (!batch.length) {
      row.status = `skipped: every sitemap URL sent in the last ${RESUBMIT_DAYS} days`;
      state[t.host] = sent;
      continue;
    }
    if (dry) {
      row.status = `dry run: would submit ${batch.length}`;
      console.log(`${t.host}: ${batch.slice(0, 10).join(" ")}${batch.length > 10 ? " …" : ""}`);
      continue;
    }
    const sub = await call("SubmitUrlBatch", key, {}, { siteUrl: site.url, urlList: batch });
    if (!sub.ok) {
      row.status = `failed: ${sub.error.slice(0, 160)}`;
      state[t.host] = sent;
      continue;
    }
    for (const u of batch) sent[u] = today;
    state[t.host] = sent;
    row.submitted = batch.length;
    row.status = "submitted";
  }

  const lines = [
    `### Bing URL submission ${today}${dry ? " · DRY RUN" : ""}`,
    "",
    "site | indexed | allowance/day | candidates | ranked by | submitted | status",
    ...rows.map((r) => `${r.host} | ${r.indexed ?? "?"} | ${r.quotaDaily < 0 ? "?" : r.quotaDaily} | ${r.candidates} | ${r.source} | ${r.submitted} | ${r.status}`),
  ];
  const txt = lines.join("\n");
  console.log(txt);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, txt + "\n", { flag: "a" });
    } catch {}
  }
  if (dry) return;
  writeFileSync(STATE_PATH, JSON.stringify(state) + "\n");
  const history = mergeHistory(prevSummary.history ?? [], today, rows);
  writeFileSync(SUMMARY_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), status: "ok", sites: rows, history }, null, 2) + "\n");
  // A submit Bing refused is the one failure worth a red run; an unverified or graduated site is not.
  if (rows.some((r) => r.status.startsWith("failed: ") && !r.status.includes("sitemap"))) process.exitCode = 1;
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("bing-submit failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
