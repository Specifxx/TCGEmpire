/**
 * WHAT IS BING ACTUALLY DOING WITH THIS SITE?
 *
 * READ-ONLY. Talks to the Bing Webmaster Tools API and nothing else — never
 * touches either database, never submits a URL, never writes anything but a
 * report.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Google has been measured continuously for months: `gsc-coverage.yml` pulls
 * impressions/clicks per page daily, `gsc-index-coverage.yml` inspects the index
 * state of every card URL weekly, and every SEO decision in DECISIONS.md rests
 * on numbers from one of the two. Bing had NOTHING. No API key, no workflow, no
 * script, not one recorded figure.
 *
 * That asymmetry is not a reporting gap, it is a reasoning gap. Asked on
 * 2026-09-17 why "Google is skyrocketing but Bing is staying the same", the
 * honest answer was that the first half is measured and the second half is an
 * impression — Bing could be flat, or growing in proportion from a base small
 * enough that growth is invisible, and nothing in this repo could tell the
 * difference. Two numbers were found steering decisions from code comments with
 * no source anywhere: "~45% of this site's search referrals" and "Bing's 397
 * Title too long warnings". This script is what makes claims like those
 * checkable instead of inherited.
 *
 * ── WHAT IT REPORTS, AND WHY EACH LINE IS THERE ─────────────────────────────
 *   GetUserSites            Is the property in the account AT ALL? This is the
 *                           first call on purpose. The live site serves no
 *                           `msvalidate.01` tag (BING_SITE_VERIFICATION is
 *                           unset) and /BingSiteAuth.xml 404s, so an
 *                           unverified property is a live hypothesis, and every
 *                           other number below is meaningless if it is true.
 *   GetRankAndTrafficStats  The daily impressions/clicks series — the actual
 *                           "is it flat?" question, with a trend rather than a
 *                           single total.
 *   GetPageStats            Per-page impressions, rolled up BY TEMPLATE using
 *                           the same normalisation as gsc-coverage.yml, so the
 *                           /card row here is directly comparable to the /card
 *                           row there. Comparability is the whole point.
 *   GetQueryStats           Which queries Bing shows the site for. Bing's
 *                           long-tail coverage in a niche TCG is thinner than
 *                           Google's; this says by how much.
 *   GetUrlSubmissionQuota   Bing's daily URL-submission allowance for this site.
 *                           Google's "Request indexing" is ~10/day and cannot be
 *                           raised; Bing's is orders of magnitude larger for a
 *                           verified site, which is the one indexing lever where
 *                           Bing is the easier engine. Reported rather than
 *                           assumed, because the allowance is scaled per site
 *                           and a guessed figure is how the two comments above
 *                           came to exist.
 *   GetCrawlStats           Crawled pages and crawl errors. IndexNow has been
 *                           submitting ~1,859 URLs a day for 84 days
 *                           (indexnow-submit.yml); this is where a submission
 *                           that never turned into a crawl shows up.
 *
 * ── THE API ─────────────────────────────────────────────────────────────────
 * Base: https://ssl.bing.com/webmaster/api.svc/json/<Method>?apikey=…&siteUrl=…
 * Auth is the bare `apikey` query parameter — no OAuth, no JWT, nothing to sign.
 * Get one from Bing Webmaster Tools → Settings → API access → API key, and store
 * it as the repo secret BING_API_KEY.
 *
 * TWO SHAPES TO KNOW. Responses wrap their payload in a `d` property
 * (`{"d": [...]}`), an artefact of the service's WCF origins, and dates come back
 * in .NET's `/Date(1758067200000)/` form rather than ISO. Both are handled by
 * `unwrapD` and `parseDotNetDate` below, which are pure and unit-tested
 * (tests/bing-coverage.test.ts) precisely because they cannot be verified here:
 * there is no Bing key in this sandbox, so the parsing is the part that has to
 * be right by construction.
 *
 * FAILS SOFT, PER ENDPOINT. One method 401ing or changing shape must not cost
 * the whole report — a partial answer is the useful thing when the question is
 * "which part of this is broken". Every call is wrapped, every failure is
 * printed as a line in the report, and the job still exits 0.
 *
 * Usage:
 *   BING_API_KEY=… npx tsx scripts/bing-coverage.ts [--site https://riftcompare.com/]
 *
 * Run in CI via .github/workflows/bing-coverage.yml (daily, 07:35 UTC — fifteen
 * minutes after gsc-coverage.yml, so a morning's two reports describe the same
 * morning and can be read side by side).
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const REPORT_PATH = "docs/bing-coverage.json";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers. Everything the report's correctness depends on lives here, so
// that it can be tested without a key — see the header.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unwrap the `{"d": …}` envelope. Tolerant on purpose: if Bing ever returns the
 * payload bare, or wraps it differently, a working response must not be thrown
 * away because of the wrapper. Returns null only when there is no payload.
 */
export function unwrapD<T = unknown>(body: unknown): T | null {
  if (body == null) return null;
  if (typeof body === "object" && "d" in (body as Record<string, unknown>)) {
    const inner = (body as Record<string, unknown>).d;
    return (inner ?? null) as T | null;
  }
  return body as T;
}

/**
 * `/Date(1758067200000)/` → `2026-09-17`. Also accepts an offset suffix
 * (`/Date(1758067200000-0700)/`) and passes an already-ISO string straight
 * through, because one endpoint returning a sane format is not a reason to
 * reject it. Returns null on anything unrecognisable rather than `Invalid Date`,
 * which would otherwise reach the report as the literal string "Invalid Date".
 */
export function parseDotNetDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  if (m) {
    const ms = Number(m[1]);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }
  // Already a date-ish string?
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * A URL or path → its pathname with no trailing slash, no query and no
 * fragment. Deliberately IDENTICAL in behaviour to gsc-coverage.yml's `norm`:
 * the two reports are only comparable if they agree on what one page is.
 */
export function normalizePath(u: string): string {
  try {
    const x = new URL(u, "https://riftcompare.com");
    return x.pathname.replace(/\/$/, "") || "/";
  } catch {
    return u;
  }
}

/** `/card/ahri-ogn-255-298` → `/card`; `/` → `home`. Mirrors gsc-coverage's `tpl`. */
export function templateOf(path: string): string {
  const p = normalizePath(path);
  return p === "/" ? "home" : "/" + p.split("/")[1];
}

export interface PageRow {
  url: string;
  impressions: number;
  clicks: number;
}

export interface TemplateRoll {
  template: string;
  pages: number;
  impressions: number;
  clicks: number;
}

/**
 * Per-template rollup, busiest first. Pages are de-duplicated by normalised
 * path before counting, so `/x` and `/x?utm=…` are one page rather than two —
 * without that, `pages` inflates and the /card row stops matching Google's.
 */
export function rollupByTemplate(rows: PageRow[]): TemplateRoll[] {
  const byPath = new Map<string, { impressions: number; clicks: number }>();
  for (const r of rows) {
    const p = normalizePath(r.url);
    const e = byPath.get(p) ?? { impressions: 0, clicks: 0 };
    e.impressions += r.impressions || 0;
    e.clicks += r.clicks || 0;
    byPath.set(p, e);
  }
  const byTemplate = new Map<string, TemplateRoll>();
  for (const [p, e] of byPath) {
    const t = templateOf(p);
    const r = byTemplate.get(t) ?? { template: t, pages: 0, impressions: 0, clicks: 0 };
    r.pages += 1;
    r.impressions += e.impressions;
    r.clicks += e.clicks;
    byTemplate.set(t, r);
  }
  return [...byTemplate.values()].sort((a, b) => b.impressions - a.impressions);
}

/**
 * Bing's field names are not stable across endpoints (Impressions vs
 * ImpressionCount, Url vs Query). Read whichever of a list of candidate keys is
 * present, so one renamed field degrades to a zero rather than a crash.
 */
export function pick(row: unknown, keys: string[], fallback = 0): number {
  if (row == null || typeof row !== "object") return fallback;
  const r = row as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return fallback;
}

export function pickString(row: unknown, keys: string[]): string {
  if (row == null || typeof row !== "object") return "";
  const r = row as Record<string, unknown>;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────────────────────

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(method: string, key: string, params: Record<string, string> = {}): Promise<CallResult<T>> {
  const qs = new URLSearchParams({ apikey: key, ...params });
  const url = `${API_BASE}/${method}?${qs}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // Bing puts its real complaint in the body; the status alone is rarely
      // enough to tell "bad key" from "site not in this account".
      return { ok: false, error: `HTTP ${res.status} — ${text.slice(0, 300)}` };
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, error: `non-JSON response — ${text.slice(0, 200)}` };
    }
    const data = unwrapD<T>(body);
    if (data == null) return { ok: false, error: `empty payload — ${text.slice(0, 200)}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const key = process.env.BING_API_KEY;
  const site = arg("site") ?? process.env.BING_SITE ?? "https://riftcompare.com/";
  const out: string[] = [];
  const report: Record<string, unknown> = { site, generatedAt: new Date().toISOString() };

  if (!key) {
    // Same contract as gsc-coverage.yml's missing-secret path: say what to do
    // and exit 0. A workflow that fails loudly for a key nobody has added yet
    // just trains people to ignore a red cross.
    out.push(
      "### Bing coverage — not configured",
      "",
      "No `BING_API_KEY` set. Get one from Bing Webmaster Tools → **Settings → API access → API key**",
      "and add it as the repo secret `BING_API_KEY`.",
      "",
      "Note that the API key requires the property to be **verified** in Bing Webmaster Tools first.",
      "The live site currently serves no `msvalidate.01` meta tag (`BING_SITE_VERIFICATION` is unset in",
      "the deploy env, see `src/app/layout.tsx`) and `/BingSiteAuth.xml` 404s, so if the property was",
      "never verified by another method (a GSC import, or DNS), that is the first thing to fix.",
    );
    finish(out, report);
    return;
  }

  out.push(`### ${site} — Bing Webmaster Tools`);

  // 1. Is the property even in this account? Everything else is conditional on it.
  const sites = await call<unknown[]>("GetUserSites", key);
  if (!sites.ok) {
    out.push("", `- **GetUserSites failed** — ${sites.error}`);
  } else {
    const urls = (Array.isArray(sites.data) ? sites.data : []).map((s) => pickString(s, ["Url", "url"]));
    report.sites = urls;
    const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const present = urls.some((u) => host(u) === host(site));
    out.push(
      "",
      present
        ? `- Property **is verified** in this account (${urls.length} site${urls.length === 1 ? "" : "s"} total)`
        : `- ⚠️ **This property is NOT in the account** — the key sees ${urls.length ? urls.map(host).join(", ") : "no sites at all"}. ` +
            `Every number below will be empty until riftcompare.com is added and verified in Bing Webmaster Tools.`,
    );
  }

  // 2. The actual "is it flat?" question.
  const traffic = await call<unknown[]>("GetRankAndTrafficStats", key, { siteUrl: site });
  if (!traffic.ok) {
    out.push("", `- **GetRankAndTrafficStats failed** — ${traffic.error}`);
  } else {
    const rows = (Array.isArray(traffic.data) ? traffic.data : [])
      .map((r) => ({
        date: parseDotNetDate((r as Record<string, unknown>).Date),
        impressions: pick(r, ["Impressions", "ImpressionCount"]),
        clicks: pick(r, ["Clicks", "ClickCount"]),
      }))
      .filter((r) => r.date)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
    report.traffic = rows;
    const last28 = rows.slice(-28);
    const sum = (k: "impressions" | "clicks") => last28.reduce((a, r) => a + r[k], 0);
    out.push(
      "",
      `- **${sum("impressions").toLocaleString()}** impressions · **${sum("clicks").toLocaleString()}** clicks ` +
        `over the last ${last28.length} day${last28.length === 1 ? "" : "s"} reported`,
    );
    // A trend, not a total — "flat" is a claim about the shape of this series,
    // so print the halves rather than making the reader infer them.
    if (last28.length >= 14) {
      const half = Math.floor(last28.length / 2);
      const older = last28.slice(0, half).reduce((a, r) => a + r.impressions, 0);
      const newer = last28.slice(half).reduce((a, r) => a + r.impressions, 0);
      const pct = older > 0 ? Math.round(((newer - older) / older) * 100) : null;
      out.push(
        `- Trend: ${older.toLocaleString()} → ${newer.toLocaleString()} impressions ` +
          `(first vs second half of the window${pct == null ? "" : `, ${pct >= 0 ? "+" : ""}${pct}%`})`,
      );
    }
    if (rows.length) out.push(`- Series covers ${rows[0].date} → ${rows[rows.length - 1].date}`);
  }

  // 3. Per-template rollup — the number that is directly comparable to Google's.
  const pages = await call<unknown[]>("GetPageStats", key, { siteUrl: site });
  if (!pages.ok) {
    out.push("", `- **GetPageStats failed** — ${pages.error}`);
  } else {
    const rows: PageRow[] = (Array.isArray(pages.data) ? pages.data : []).map((r) => ({
      url: pickString(r, ["Url", "Page", "url"]),
      impressions: pick(r, ["Impressions", "ImpressionCount"]),
      clicks: pick(r, ["Clicks", "ClickCount"]),
    }));
    const roll = rollupByTemplate(rows.filter((r) => r.url));
    report.templates = roll;
    out.push("", `**By template (${rows.length} pages with Bing impressions):**`);
    out.push(
      ...roll
        .slice(0, 15)
        .map(
          (r) =>
            `- ${r.template} — ${r.pages} pages · ${r.impressions.toLocaleString()} impr · ${r.clicks.toLocaleString()} clicks`,
        ),
    );
    out.push(
      "",
      "Compare the `/card` row against the same row in the `gsc-coverage` step summary. That comparison, not a",
      "gut feel about either engine, is what says whether Bing is flat or merely small.",
    );
  }

  // 4. Query coverage.
  const queries = await call<unknown[]>("GetQueryStats", key, { siteUrl: site });
  if (!queries.ok) {
    out.push("", `- **GetQueryStats failed** — ${queries.error}`);
  } else {
    const rows = (Array.isArray(queries.data) ? queries.data : [])
      .map((r) => ({
        query: pickString(r, ["Query", "query"]),
        impressions: pick(r, ["Impressions", "ImpressionCount"]),
        clicks: pick(r, ["Clicks", "ClickCount"]),
        position: pick(r, ["AvgImpressionPosition", "AvgClickPosition"]),
      }))
      .filter((r) => r.query)
      .sort((a, b) => b.impressions - a.impressions);
    report.queries = rows;
    out.push("", `**Top Bing queries (${rows.length} total):**`);
    out.push(
      ...rows
        .slice(0, 15)
        .map((r) => `- \`${r.query}\` — ${r.impressions.toLocaleString()} impr / ${r.clicks} clicks, pos ${r.position || "?"}`),
    );
  }

  // 5. The submission allowance — the one indexing lever where Bing beats Google.
  const quota = await call<Record<string, unknown>>("GetUrlSubmissionQuota", key, { siteUrl: site });
  if (!quota.ok) {
    out.push("", `- **GetUrlSubmissionQuota failed** — ${quota.error}`);
  } else {
    const daily = pick(quota.data, ["DailyQuota"], -1);
    const monthly = pick(quota.data, ["MonthlyQuota"], -1);
    report.quota = { daily, monthly };
    out.push(
      "",
      `- URL submission allowance: **${daily < 0 ? "unknown" : daily.toLocaleString()}/day**` +
        (monthly < 0 ? "" : `, ${monthly.toLocaleString()}/month`) +
        ` — against Google's ~10/day, which cannot be raised.`,
    );
  }

  // 6. Crawl health — where a submitted-but-never-fetched URL shows up.
  const crawl = await call<unknown[]>("GetCrawlStats", key, { siteUrl: site });
  if (!crawl.ok) {
    out.push("", `- **GetCrawlStats failed** — ${crawl.error}`);
  } else {
    const rows: unknown[] = Array.isArray(crawl.data) ? crawl.data : [];
    // Summed over the reported days, with an explicit accumulator type — `rows`
    // is unknown[], so an inferred seed makes `a` unknown and `a + …` illegal.
    const total = (keys: string[]) => rows.reduce<number>((a, r) => a + pick(r, keys), 0);
    const crawled = total(["CrawledPages"]);
    const errors = total(["CrawlErrors"]);
    const blocked = total(["BlockedByRobotsTxt"]);
    // InIndex is a snapshot, not a daily delta, so the LAST reported day is the
    // meaningful figure — summing it would report a nonsense multiple.
    const inIndex = rows.length ? pick(rows[rows.length - 1], ["InIndex"], -1) : -1;
    report.crawl = { crawled, errors, blocked, inIndex };
    out.push(
      "",
      `- Crawl (${rows.length} days reported): ${crawled.toLocaleString()} pages crawled, ` +
        `${errors.toLocaleString()} errors, ${blocked.toLocaleString()} blocked by robots.txt` +
        (inIndex < 0 ? "" : ` · ${inIndex.toLocaleString()} pages in Bing's index`),
      "",
      "`indexnow-submit.yml` submits ~1,859 URLs to IndexNow every day at 06:10 UTC. If crawled pages here are a",
      "small fraction of that, the submissions are landing and Bing is choosing not to fetch — which is a",
      "selection problem, not a discovery one, and no amount of resubmitting fixes it.",
    );
  }

  finish(out, report);
}

function finish(out: string[], report: Record<string, unknown>) {
  const txt = out.join("\n");
  console.log(txt);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, txt + "\n", { flag: "a" });
    } catch {
      /* the report already went to stdout; a summary write failure is not fatal */
    }
  }
  try {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  } catch {
    /* artifact upload is best-effort — `if-no-files-found: ignore` in the workflow */
  }
}

// RUN ONLY WHEN INVOKED AS A SCRIPT, never on import.
//
// tests/bing-coverage.test.ts imports the pure helpers above, and an unguarded
// `main()` made that import execute the whole report: `npm test` left a
// docs/bing-coverage.json behind (it got as far as being committed once), and in
// any environment that has BING_API_KEY set it would have fired six live API
// calls from the test run. No other script here needs this guard because no
// other test imports one — this is the first, and the parsing is exactly the
// part that has to be unit-tested, so the import is not going away.
//
// Never fails the job either way: this is a monitor. A crash here would page
// someone about Bing's API rather than about the site.
const invokedDirectly =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((e) => {
    console.error("bing-coverage failed:", e instanceof Error ? e.message : e);
  });
}
