// The health checks. Each answers one question — "is this thing working, and how close
// is it to a limit?" — with a severity, a plain sentence, and (when it is not fine) what
// to do about it, written for someone who is not watching.
//
// All input arrives through OpsDeps (deps.ts), so the same code runs in GitHub Actions
// (the monitor), and under test. A check that cannot run returns `unknown` — a missing key
// or an unreachable API — and never raises an alert: "I could not look" is not "it is fine"
// and it is not "it is broken".
//
// The action text is written to be pasted to Claude: the owner's way of fixing things
// is to say what is wrong in a sentence, not to read a runbook.
import type { CheckResult, Severity, OpsArea } from "./types";
import type { OpsDeps } from "./deps";
import { SITE } from "./deps";
import {
  NEON_FREE_TRANSFER_BYTES,
  ageSeverity,
  ebayQuotaSeverity,
  gb,
  hoursSince,
  humanAge,
  neonUsage,
  pushSample,
  recentRatePerDay,
} from "./thresholds";
import { NeonApiError, endpointIdFromUrl, findProjectForEndpoint, projectUsage } from "./neon";
import { COUNTRIES } from "../country";

const iso = (d: OpsDeps) => d.now.toISOString();

function result(d: OpsDeps, r: Omit<CheckResult, "checkedAt">): CheckResult {
  return { ...r, checkedAt: iso(d) };
}

function unknown(d: OpsDeps, id: string, area: OpsArea, title: string, summary: string): CheckResult {
  return result(d, { id, area, title, severity: "unknown", summary });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 240);

/** Run `fn` up to `tries` times, pausing between; a transient network failure should not become an alert. */
async function retry<T>(d: OpsDeps, fn: () => Promise<T>, tries = 3, gapMs = 15_000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await d.sleep(gapMs);
    }
  }
  throw last;
}

// ── Databases ───────────────────────────────────────────────────────────────

const QUOTA_WORDS = /quota|exceeded|data transfer|transfer limit|compute time/i;

export async function databaseReachable(d: OpsDeps): Promise<CheckResult> {
  const id = "db:operational";
  const title = "Main database answering";
  if (!d.db) return unknown(d, id, "databases", title, "No database connection from here.");
  const t0 = Date.now();
  try {
    await retry(d, () => d.db!.ping(), 2, 5_000);
  } catch (e) {
    const m = msg(e);
    const quota = QUOTA_WORDS.test(m);
    return result(d, {
      id,
      area: "databases",
      title,
      severity: "crit",
      summary: quota
        ? "The main database has hit its transfer allowance and is refusing connections."
        : `The main database is not answering (${m.slice(0, 120)}).`,
      action: quota
        ? "Tell Claude: \"perform a full migration to the next database, the current one is at its limit\". Until then, if PUBLIC_DATA_MODE is fallback or files, public pages keep working from the saved snapshot; accounts, alerts and checkout will not."
        : "Check the database project in the Neon console. If it is suspended or deleted, tell Claude: \"the main database is down, restore from the newest copy\".",
    });
  }
  const ms = Date.now() - t0;
  return result(d, {
    id,
    area: "databases",
    title,
    severity: ms > 4000 ? "warn" : "ok",
    summary: ms > 4000 ? `Slow: a trivial query took ${(ms / 1000).toFixed(1)} s.` : `Answering in ${ms} ms.`,
    action: ms > 4000 ? "Usually a cold start. If it stays slow for a day, tell Claude: \"the main database is slow\"." : undefined,
  });
}

export async function neonTransfer(d: OpsDeps, which: "operational" | "history"): Promise<CheckResult> {
  const id = `neon:${which}`;
  const title = which === "operational" ? "Main database: monthly transfer" : "History database: monthly transfer";
  const key = d.env.NEON_API_KEY;
  if (!key) {
    return unknown(d, id, "databases", title, "Not connected. Add a Neon API key to watch the monthly transfer limit (docs/ops-monitor.md).");
  }
  const url = d.databaseUrls[which];
  const ep = endpointIdFromUrl(url);
  if (!ep) return unknown(d, id, "databases", title, "This database's address is not a Neon address, so its usage cannot be looked up.");

  try {
    let projectId: string | null | undefined = d.state.neonProjects[ep];
    if (!projectId) {
      projectId = await findProjectForEndpoint(key, ep, d.fetch, d.env.NEON_ORG_ID);
      if (projectId) d.state.neonProjects[ep] = projectId;
    }
    if (!projectId) {
      return unknown(d, id, "databases", title, "Could not find this database among the projects the Neon key can see (set NEON_ORG_ID if it lives in an organisation).");
    }
    const u = await projectUsage(key, projectId, d.fetch);
    const limit = Number(d.env.NEON_TRANSFER_LIMIT_BYTES) || u.quotaBytes || NEON_FREE_TRANSFER_BYTES;

    const prev = d.state.samples[projectId] ?? [];
    const sample = { t: d.now.getTime(), b: u.usedBytes };
    const recent = recentRatePerDay(prev, sample);
    d.state.samples[projectId] = pushSample(prev, sample);

    const v = neonUsage({
      usedBytes: u.usedBytes,
      limitBytes: limit,
      periodStart: u.periodStart,
      periodEnd: u.periodEnd,
      now: d.now,
      recentBytesPerDay: recent,
    });

    const parts = [`${gb(u.usedBytes)} of ${gb(limit)} used (${Math.round(v.pct * 100)}%)`];
    if (v.burnPerDay != null) parts.push(`about ${gb(v.burnPerDay)} a day`);
    if (v.daysToExhaust != null && v.severity !== "ok") parts.push(`runs out in ~${v.daysToExhaust < 10 ? v.daysToExhaust.toFixed(1) : Math.round(v.daysToExhaust)} days`);
    if (v.daysLeftInPeriod != null) parts.push(`resets in ${Math.ceil(v.daysLeftInPeriod)} days`);

    let action: string | undefined;
    if (v.severity === "warn") {
      action =
        which === "operational"
          ? "It is on pace to run out before it resets. The lasting fix is to read less from it: tell Claude \"switch the site to files mode\" (PUBLIC_DATA_MODE=files). No action needed until it turns red."
          : "It is on pace to run out before it resets. Tell Claude \"the history database is filling up\".";
    } else if (v.severity === "crit") {
      action =
        which === "operational"
          ? "Close to the limit. Tell Claude now: \"perform a full migration to the next database, the current one is almost at its limit\" (about 15 minutes, no downtime)."
          : "Close to the limit. Tell Claude now: \"migrate the history database to the next one\".";
    }

    return result(d, {
      id,
      area: "databases",
      title,
      severity: v.severity,
      summary: parts.join(" · "),
      action,
      metric: { value: u.usedBytes, limit, unit: "bytes" },
    });
  } catch (e) {
    if (e instanceof NeonApiError && (e.status === 401 || e.status === 403)) {
      return result(d, {
        id,
        area: "databases",
        title,
        severity: "warn",
        summary: "Neon rejected the API key, so usage cannot be tracked.",
        action: "Create a new key in the Neon console (Account settings → API keys) and update NEON_API_KEY in GitHub secrets.",
      });
    }
    return unknown(d, id, "databases", title, `Could not read usage from Neon (${msg(e)}).`);
  }
}

export function publicSnapshot(d: OpsDeps): CheckResult {
  const id = "data:public-snapshot";
  const title = "Safety-net copy of prices";
  const at = d.repo?.publicSnapshotAt();
  if (!d.repo) return unknown(d, id, "databases", title, "Not checked from here.");
  const h = hoursSince(at ?? null, d.now);
  const sev = ageSeverity(h, 36, 72);
  return result(d, {
    id,
    area: "databases",
    title,
    severity: sev,
    summary: at ? `The saved copy the site falls back to is ${humanAge(h)} old.` : "There is no saved copy of the prices.",
    action:
      sev === "ok"
        ? undefined
        : "The daily export has stopped, so the fallback is going stale. Tell Claude: \"the public data snapshot has stopped updating\".",
  });
}

// ── eBay ────────────────────────────────────────────────────────────────────

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_LIMIT_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse";

export async function ebayAuth(d: OpsDeps): Promise<{ check: CheckResult; token: string | null }> {
  const id = "ebay:auth";
  const title = "eBay API keys";
  const cid = d.env.EBAY_CLIENT_ID;
  const secret = d.env.EBAY_CLIENT_SECRET;
  if (!cid || !secret) {
    return { check: unknown(d, id, "ebay", title, "eBay keys are not available to this check."), token: null };
  }
  const basic = Buffer.from(`${cid}:${secret}`).toString("base64");
  try {
    const res = await retry(d, async () => {
      const r = await d.fetch(EBAY_TOKEN_URL, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      });
      if (r.status >= 500) throw new Error(`eBay ${r.status}`);
      return r;
    });
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { access_token?: string };
      return { check: result(d, { id, area: "ebay", title, severity: "ok", summary: "eBay accepts the app keys." }), token: j.access_token ?? null };
    }
    return {
      check: result(d, {
        id,
        area: "ebay",
        title,
        severity: "crit",
        summary: `eBay refused the app keys (HTTP ${res.status}). Live eBay prices and auctions will stop.`,
        action:
          "The keys were rotated or the app was suspended. Check developer.ebay.com → Application keys, then update EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in Vercel and GitHub secrets. Or tell Claude: \"the eBay keys stopped working\".",
      }),
      token: null,
    };
  } catch (e) {
    return { check: unknown(d, id, "ebay", title, `Could not reach eBay (${msg(e)}).`), token: null };
  }
}

export async function ebayQuota(d: OpsDeps, token: string | null): Promise<CheckResult> {
  const id = "ebay:quota";
  const title = "eBay daily call allowance";
  if (!token) return unknown(d, id, "ebay", title, "Skipped: no eBay token.");
  try {
    const r = await d.fetch(EBAY_LIMIT_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return unknown(d, id, "ebay", title, `eBay's usage endpoint answered ${r.status}.`);
    const j = (await r.json()) as { rateLimits?: { resources?: { name?: string; rates?: { limit?: number; remaining?: number; reset?: string }[] }[] }[] };
    let rate: { limit?: number; remaining?: number; reset?: string } | undefined;
    for (const g of j.rateLimits ?? []) for (const res of g.resources ?? []) if (res.name === "buy.browse") rate = res.rates?.[0];
    const remaining = rate?.remaining ?? null;
    const limit = rate?.limit ?? null;
    const sev = ebayQuotaSeverity(remaining, limit);
    if (sev === "unknown" || remaining == null || limit == null) return unknown(d, id, "ebay", title, "eBay did not report a daily allowance.");
    return result(d, {
      id,
      area: "ebay",
      title,
      severity: sev,
      summary:
        sev === "ok"
          ? `${remaining.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} Browse calls left today.`
          : `Only ${remaining.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} Browse calls left today.`,
      action:
        sev === "ok"
          ? undefined
          : "Something besides the importer is spending the daily allowance, so live eBay prices on card pages may go blank. It refills at the daily reset. If it keeps happening, tell Claude: \"eBay's daily call allowance keeps running out\".",
      metric: { value: limit - remaining, limit, unit: "calls" },
    });
  } catch (e) {
    return unknown(d, id, "ebay", title, `Could not read the allowance (${msg(e)}).`);
  }
}

export async function ebayData(d: OpsDeps): Promise<CheckResult[]> {
  if (!d.db) return [];
  const out: CheckResult[] = [];
  try {
    const a = await d.db.auctions();
    const h = hoursSince(a.newestUpdate, d.now);
    const sev = a.count === 0 && a.newestUpdate == null ? "warn" : ageSeverity(h, 14, 36);
    out.push(
      result(d, {
        id: "ebay:auctions",
        area: "ebay",
        title: "Auction sweep",
        severity: sev,
        summary: a.newestUpdate ? `${a.count} live auctions; last refreshed ${humanAge(h)} ago.` : "No auctions stored yet.",
        action: sev === "ok" ? undefined : "The 4-hourly auction sweep is not landing. Tell Claude: \"the eBay auction sweep has stopped\".",
      }),
    );
  } catch (e) {
    out.push(unknown(d, "ebay:auctions", "ebay", "Auction sweep", `Could not read it (${msg(e)}).`));
  }
  try {
    const at = await d.db.ebayAdsNewest();
    const h = hoursSince(at, d.now);
    const sev = ageSeverity(h, 36, 60);
    out.push(
      result(d, {
        id: "ebay:listings",
        area: "ebay",
        title: "eBay listings on card pages",
        severity: sev,
        summary: at ? `Refreshed ${humanAge(h)} ago.` : "No eBay listings stored.",
        action: sev === "ok" ? undefined : "The daily eBay pass is not refreshing listings. Tell Claude: \"eBay listings have gone stale\".",
      }),
    );
  } catch (e) {
    out.push(unknown(d, "ebay:listings", "ebay", "eBay listings on card pages", `Could not read it (${msg(e)}).`));
  }
  return out;
}

// ── Prices and scheduled jobs ───────────────────────────────────────────────

export async function priceFreshness(d: OpsDeps): Promise<CheckResult[]> {
  if (!d.db) return [];
  const out: CheckResult[] = [];
  try {
    // Only the markets the site serves (COUNTRIES). Retired markets keep old rows (NZ was 55 days stale on the
    // first live run) and must neither alarm nor hide a live market that has none.
    const found = new Map((await d.db.priceFreshness()).map((m) => [m.country, m]));
    const rows = (Object.keys(COUNTRIES) as string[]).map((country) => ({ country, newest: found.get(country)?.newest ?? null, h: hoursSince(found.get(country)?.newest ?? null, d.now) }));
    const stale = rows.filter((r) => ageSeverity(r.h, 30, 56) !== "ok");
    const worst = rows.reduce<Severity>((w, r) => {
      const s = ageSeverity(r.h, 30, 56);
      return s === "crit" ? "crit" : s === "warn" && w !== "crit" ? "warn" : w;
    }, "ok");
    out.push(
      result(d, {
        id: "data:prices",
        area: "data",
        title: "Store prices",
        severity: worst,
        summary: stale.length
          ? `Out of date: ${stale.map((r) => `${r.country} ${r.newest ? humanAge(r.h) : "no prices"}`).join(", ")}.`
          : `All ${rows.length} markets updated within ${humanAge(Math.max(...rows.map((r) => r.h)))}.`,
        action: worst === "ok" ? undefined : "The price import is not refreshing every market. Tell Claude: \"prices have stopped updating\".",
      }),
    );
  } catch (e) {
    out.push(unknown(d, "data:prices", "data", "Store prices", `Could not read them (${msg(e)}).`));
  }
  try {
    const at = await d.db.sealedNewest();
    const h = hoursSince(at, d.now);
    const sev = ageSeverity(h, 36, 72);
    out.push(
      result(d, {
        id: "data:sealed",
        area: "data",
        title: "Sealed product prices",
        severity: sev,
        summary: at ? `Refreshed ${humanAge(h)} ago.` : "No sealed prices stored.",
        action: sev === "ok" ? undefined : "The sealed refresh is not landing. Tell Claude: \"sealed prices have stopped updating\".",
      }),
    );
  } catch (e) {
    out.push(unknown(d, "data:sealed", "data", "Sealed product prices", `Could not read them (${msg(e)}).`));
  }
  try {
    const at = await d.db.storeHealthNewest();
    const h = hoursSince(at, d.now);
    const sev = ageSeverity(h, 60, 108);
    out.push(
      result(d, {
        id: "data:store-health",
        area: "data",
        title: "Store scraper health check",
        severity: sev,
        summary: at ? `Last snapshot ${humanAge(h)} ago.` : "No store-health snapshots yet.",
        action: sev === "ok" ? undefined : "The store health check has stopped, so a broken scraper would go unnoticed. Tell Claude: \"the store health check has stopped\".",
      }),
    );
  } catch (e) {
    out.push(unknown(d, "data:store-health", "data", "Store scraper health check", `Could not read it (${msg(e)}).`));
  }
  return out;
}

export function historyFiles(d: OpsDeps): CheckResult {
  const id = "data:history";
  const title = "Daily price history";
  if (!d.repo) return unknown(d, id, "data", title, "Not checked from here.");
  const day = d.repo.newestHistoryDay();
  if (!day) return result(d, { id, area: "data", title, severity: "crit", summary: "There are no daily price-history files.", action: "Tell Claude: \"the price history files are missing\"." });
  const h = hoursSince(new Date(`${day}T23:59:59Z`), d.now);
  const sev = ageSeverity(h, 54, 102);
  return result(d, {
    id,
    area: "data",
    title,
    severity: sev,
    summary: `Newest day is ${day} (${humanAge(Math.max(0, h))} ago).`,
    action: sev === "ok" ? undefined : "Daily history is not being written, so charts will stop at the last day. Tell Claude: \"the daily price history has stopped\".",
  });
}

const JOBS: { file: string; title: string; staleH: number }[] = [
  { file: "refresh-prices.yml", title: "Price import job", staleH: 36 },
  { file: "refresh-auctions.yml", title: "Auction sweep job", staleH: 16 },
  { file: "sealed-refresh.yml", title: "Sealed refresh job", staleH: 36 },
  { file: "store-health.yml", title: "Store health job", staleH: 36 },
  { file: "production-deploy.yml", title: "Daily release job", staleH: 40 },
  // Weekly (2026-10-15): a week and a day before it reads as late.
  { file: "promo-art.yml", title: "Promo art job (weekly)", staleH: 200 },
];

export async function scheduledJobs(d: OpsDeps): Promise<CheckResult[]> {
  if (!d.github) return [];
  const out: CheckResult[] = [];
  for (const job of JOBS) {
    const id = `job:${job.file.replace(/\.yml$/, "")}`;
    try {
      const runs = await d.github.runs(job.file);
      if (!runs.length) {
        out.push(unknown(d, id, "site", job.title, "No runs found."));
        continue;
      }
      const done = runs.filter((r) => r.status === "completed" && r.conclusion && !["cancelled", "skipped", "neutral"].includes(r.conclusion));
      const failed = (r?: { conclusion: string | null }) => !!r && r.conclusion !== "success";
      const age = hoursSince(runs[0]!.createdAt, d.now);
      let sev: Severity = "ok";
      let summary = `Last ran ${humanAge(age)} ago${done[0] ? ` (${done[0].conclusion})` : ""}.`;
      if (failed(done[0]) && failed(done[1])) {
        sev = "crit";
        summary = `Failed the last two times it ran (latest: ${done[0]!.conclusion}).`;
      } else if (failed(done[0])) {
        sev = "warn";
        summary = `Its latest run failed (${done[0]!.conclusion}); it will be retried on schedule.`;
      } else if (age >= job.staleH * 2) {
        sev = "crit";
        summary = `Has not run for ${humanAge(age)}.`;
      } else if (age >= job.staleH) {
        sev = "warn";
        summary = `Has not run for ${humanAge(age)}.`;
      }
      out.push(
        result(d, {
          id,
          area: "site",
          title: job.title,
          severity: sev,
          summary,
          action: sev === "ok" ? undefined : `Open the repository's Actions tab, or tell Claude: "${job.title.toLowerCase()} is failing".`,
        }),
      );
    } catch (e) {
      out.push(unknown(d, id, "site", job.title, `Could not read its runs (${msg(e)}).`));
    }
  }
  return out;
}

export async function deployState(d: OpsDeps): Promise<CheckResult> {
  const id = "deploy:production";
  const title = "Latest production build";
  if (!d.github) return unknown(d, id, "site", title, "Not checked from here.");
  try {
    const dep = await d.github.productionDeploy();
    if (!dep) return unknown(d, id, "site", title, "No production deployment found.");
    const h = hoursSince(dep.createdAt, d.now);
    if (dep.state === "failure" || dep.state === "error") {
      return result(d, {
        id,
        area: "site",
        title,
        severity: "crit",
        summary: `The latest production build failed (${dep.description || dep.state}). The site is still serving the version before it.`,
        action: "Tell Claude: \"the latest production build failed\". Nothing is down; new changes just are not live.",
      });
    }
    if ((dep.state === "in_progress" || dep.state === "pending" || dep.state === "queued") && h > 1) {
      return result(d, { id, area: "site", title, severity: "warn", summary: `A build has been ${dep.state.replace("_", " ")} for ${humanAge(h)}.`, action: "Tell Claude: \"a production build is stuck\"." });
    }
    return result(d, { id, area: "site", title, severity: "ok", summary: `Latest build: ${dep.state}, ${humanAge(h)} ago.` });
  } catch (e) {
    return unknown(d, id, "site", title, `Could not read it (${msg(e)}).`);
  }
}

// ── The live site ───────────────────────────────────────────────────────────

const PRICE_RE = /[$£€]\s?\d/;

export async function siteProbe(d: OpsDeps): Promise<CheckResult> {
  const id = "site:live";
  const title = "Live site";
  const pages: { path: string; json?: boolean; prices?: boolean }[] = [
    { path: "/", prices: true },
    { path: "/browse", prices: true },
    { path: "/price-guide", prices: true },
    { path: "/sealed", prices: true },
    { path: "/api/search?q=jinx", json: true },
  ];
  const problems: string[] = [];
  const slow: string[] = [];
  let worstMs = 0;
  for (const p of pages) {
    try {
      const t0 = Date.now();
      const r = await retry(
        d,
        async () => {
          const res = await d.fetch(`${SITE}${p.path}`, { headers: { "User-Agent": "RiftCompareOpsMonitor/1.0" } });
          if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
          return res;
        },
        3,
        10_000,
      );
      const ms = Date.now() - t0;
      worstMs = Math.max(worstMs, ms);
      if (!r.ok) {
        problems.push(`${p.path} → HTTP ${r.status}`);
        continue;
      }
      const body = await r.text();
      if (p.json) {
        let n = 0;
        try {
          n = (JSON.parse(body).results ?? []).length;
        } catch {
          /* not JSON */
        }
        if (!n) problems.push(`${p.path} returned no results`);
      } else if (p.prices && !PRICE_RE.test(body)) {
        problems.push(`${p.path} loaded but shows no prices`);
      }
      if (ms > 8000) slow.push(`${p.path} ${(ms / 1000).toFixed(1)} s`);
    } catch (e) {
      problems.push(`${p.path} → ${msg(e)}`);
    }
  }
  if (problems.length) {
    const down = problems.length >= 3 || problems.some((p) => /→ (HTTP 5|fetch failed|Error)/.test(p));
    return result(d, {
      id,
      area: "site",
      title,
      severity: down ? "crit" : "warn",
      summary: `Problems: ${problems.slice(0, 4).join("; ")}.`,
      action: "Tell Claude: \"the live site is returning errors\" and paste this email.",
    });
  }
  if (slow.length) {
    return result(d, { id, area: "site", title, severity: "warn", summary: `Slow: ${slow.join(", ")}.`, action: "Usually a cold start or a slow database. If it persists, tell Claude: \"the site is slow\"." });
  }
  return result(d, { id, area: "site", title, severity: "ok", summary: `${pages.length} key pages load with prices (slowest ${(worstMs / 1000).toFixed(1)} s).` });
}

// ── Partner data ────────────────────────────────────────────────────────────

/**
 * DexCompare's browse index (www.dexcompare.app/api/browse/<region>), which the Pokémon
 * section reads for its "Independent stores" lines (DECISIONS.md, 2026-10-15). The
 * section hides those lines quietly when the index cannot be read, so nothing on the
 * site would say they had gone: this does. Unreachable is grey (another site's outage,
 * nothing to do here); a format the section no longer understands is amber.
 */
// A listed Pokémon touchpoint (tests/pokemon-isolation.test.ts, docs/pokemon/README.md's removal table).
const POKEMON_PATH = "/pokemon";

export async function dexcompareIndex(d: OpsDeps): Promise<CheckResult> {
  const id = "partner:dexcompare";
  const title = "DexCompare store prices (Pokémon)";
  // Only while the Pokémon section is live: switched off (or removed), nothing reads the index.
  try {
    const section = await d.fetch(`${SITE}${POKEMON_PATH}`, { method: "HEAD", headers: { "User-Agent": "RiftCompareOpsMonitor/1.0" } });
    if (section.status === 404) return unknown(d, id, "data", title, "The Pokémon section is off, so nothing reads DexCompare's index.");
  } catch {
    /* the site probe reports an unreachable site; carry on and check DexCompare */
  }
  let body: unknown;
  try {
    const res = await retry(d, async () => {
      const r = await d.fetch("https://www.dexcompare.app/api/browse/us", { headers: { "User-Agent": "RiftCompareOpsMonitor/1.0" } });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    });
    if (!res.ok) return unknown(d, id, "data", title, `DexCompare answered HTTP ${res.status}.`);
    body = await res.json();
  } catch (e) {
    return unknown(d, id, "data", title, `DexCompare could not be reached (${msg(e)}).`);
  }
  // The shape the section's parser accepts: version 1, the region, and rows whose
  // image is a TCGplayer one (the join key). Kept in step with it by the test.
  const b = (body ?? {}) as { v?: unknown; region?: unknown; rows?: unknown };
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const joinable = rows.filter((r) => Array.isArray(r) && typeof r[4] === "string" && /tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_/.test(r[4])).length;
  if (b.v !== 1 || b.region !== "us" || joinable < 100) {
    return result(d, {
      id,
      area: "data",
      title,
      severity: "warn",
      summary: `DexCompare's index changed: version ${String(b.v)}, ${rows.length} rows, ${joinable} with a TCGplayer image. The Pokémon pages are hiding their store prices.`,
      action: 'Tell Claude: "DexCompare\'s browse index changed format; update the Pokémon section\'s DexCompare parser" and paste this email.',
    });
  }
  return result(d, { id, area: "data", title, severity: "ok", summary: `${rows.length} US products, ${joinable} joinable by TCGplayer id.` });
}

// ── Money ───────────────────────────────────────────────────────────────────

export async function stripeChecks(d: OpsDeps): Promise<CheckResult[]> {
  const key = d.env.STRIPE_SECRET_KEY;
  const authTitle = "Stripe connection";
  const hookTitle = "Stripe webhook";
  if (!key) {
    return [
      unknown(d, "stripe:api", "money", authTitle, "Stripe key is not available to this check."),
      unknown(d, "stripe:webhook", "money", hookTitle, "Skipped: no Stripe key."),
    ];
  }
  const auth = { Authorization: `Bearer ${key}` };
  const out: CheckResult[] = [];
  try {
    const r = await retry(d, () => d.fetch("https://api.stripe.com/v1/balance", { headers: auth }), 2, 5_000);
    if (r.status === 401) {
      out.push(
        result(d, {
          id: "stripe:api",
          area: "money",
          title: authTitle,
          severity: "crit",
          summary: "Stripe rejected the secret key. Nobody can subscribe.",
          action: "The key was rolled or revoked. Update STRIPE_SECRET_KEY in Vercel and GitHub secrets, or tell Claude: \"Stripe is rejecting our key\".",
        }),
      );
    } else if (r.ok) {
      out.push(result(d, { id: "stripe:api", area: "money", title: authTitle, severity: "ok", summary: "Stripe accepts the key." }));
    } else {
      out.push(unknown(d, "stripe:api", "money", authTitle, `Stripe answered ${r.status}.`));
    }
  } catch (e) {
    out.push(unknown(d, "stripe:api", "money", authTitle, `Could not reach Stripe (${msg(e)}).`));
    out.push(unknown(d, "stripe:webhook", "money", hookTitle, "Skipped."));
    return out;
  }

  try {
    const eps = await d.fetch("https://api.stripe.com/v1/webhook_endpoints?limit=20", { headers: auth });
    if (!eps.ok) {
      out.push(unknown(d, "stripe:webhook", "money", hookTitle, `Stripe answered ${eps.status}.`));
      return out;
    }
    const j = (await eps.json()) as { data?: { status?: string; url?: string }[] };
    const live = (j.data ?? []).filter((e) => e.status === "enabled" && /riftcompare\.com/.test(e.url ?? ""));
    if (!live.length) {
      out.push(
        result(d, {
          id: "stripe:webhook",
          area: "money",
          title: hookTitle,
          severity: "crit",
          summary: "No enabled Stripe webhook points at the site, so a paid subscription would never unlock Premium.",
          action: "In Stripe → Developers → Webhooks, re-enable the riftcompare.com endpoint, or tell Claude: \"the Stripe webhook is missing\".",
        }),
      );
      return out;
    }
    const since = Math.floor((d.now.getTime() - 24 * 3_600_000) / 1000);
    const ev = await d.fetch(`https://api.stripe.com/v1/events?delivery_success=false&limit=20&created[gte]=${since}`, { headers: auth });
    const failed = ev.ok ? (((await ev.json()) as { data?: unknown[] }).data ?? []).length : null;
    if (failed == null) {
      out.push(result(d, { id: "stripe:webhook", area: "money", title: hookTitle, severity: "ok", summary: "A webhook is enabled (delivery history unavailable)." }));
    } else {
      const sev: Severity = failed >= 10 ? "crit" : failed >= 3 ? "warn" : "ok";
      out.push(
        result(d, {
          id: "stripe:webhook",
          area: "money",
          title: hookTitle,
          severity: sev,
          summary: failed ? `${failed} Stripe event${failed === 1 ? "" : "s"} failed to reach the site in the last day.` : "Webhook enabled; every event in the last day was delivered.",
          action: sev === "ok" ? undefined : "Payments may not be unlocking Premium. Tell Claude: \"Stripe webhooks are failing\".",
        }),
      );
    }
  } catch (e) {
    out.push(unknown(d, "stripe:webhook", "money", hookTitle, `Could not read it (${msg(e)}).`));
  }
  return out;
}

// ── Email and configuration, as the website itself sees them ────────────────
// The mail keys live in Vercel, not in GitHub, so this asks the site (GET
// /api/cron/ops-notify) what IT can see. The reply names variables, never values.
export interface SiteSelfReport {
  ok: boolean;
  resend: { configured: boolean; valid: boolean | null; detail?: string };
  brevo: { configured: boolean; valid: boolean | null; detail?: string };
  missingEnv: string[];
}

export async function siteSelfChecks(d: OpsDeps): Promise<CheckResult[]> {
  const secret = d.env.CRON_SECRET;
  const mk = (id: string, title: string, why: string) => unknown(d, id, "email", title, why);
  if (!secret) {
    return [
      mk("email:resend", "Email (Resend)", "CRON_SECRET is not available to this check."),
      mk("email:brevo", "Bulk email (Brevo)", "Skipped."),
      unknown(d, "site:config", "site", "Site settings", "Skipped."),
    ];
  }
  let rep: SiteSelfReport | null = null;
  let why = "";
  try {
    const r = await retry(d, () => d.fetch(`${SITE}/api/cron/ops-notify`, { headers: { Authorization: `Bearer ${secret}` } }), 2, 10_000);
    if (r.status === 404) why = "The site has not been updated with the health endpoint yet (it arrives with the next release).";
    else if (r.status === 401) why = "The site rejected CRON_SECRET: the secret in GitHub does not match Vercel.";
    else if (!r.ok) why = `The site answered ${r.status}.`;
    else rep = (await r.json()) as SiteSelfReport;
  } catch (e) {
    why = `Could not reach the site (${msg(e)}).`;
  }
  if (!rep) {
    return [mk("email:resend", "Email (Resend)", why), mk("email:brevo", "Bulk email (Brevo)", why), unknown(d, "site:config", "site", "Site settings", why)];
  }

  const out: CheckResult[] = [];
  const resend = rep.resend;
  out.push(
    result(d, {
      id: "email:resend",
      area: "email",
      title: "Email (Resend)",
      severity: !resend.configured || resend.valid === false ? "crit" : "ok",
      summary: !resend.configured ? "No Resend key is set on the site: sign-in, verification and price-alert emails are not sending." : resend.valid === false ? `Resend rejected the key (${resend.detail ?? "invalid"}).` : "Resend accepts the key.",
      action: !resend.configured || resend.valid === false ? "Create a new key at resend.com/api-keys and update RESEND_API_KEY in Vercel, or tell Claude: \"emails have stopped sending\"." : undefined,
    }),
  );
  const brevo = rep.brevo;
  out.push(
    result(d, {
      id: "email:brevo",
      area: "email",
      title: "Bulk email (Brevo)",
      severity: !brevo.configured ? "unknown" : brevo.valid === false ? "warn" : "ok",
      summary: !brevo.configured ? "Not set up (only needed for the admin promo emails)." : brevo.valid === false ? `Brevo rejected the key (${brevo.detail ?? "invalid"}).` : "Brevo accepts the key.",
      action: brevo.valid === false ? "Update BREVO_API_KEY in Vercel; the admin promo emails will not send until then." : undefined,
    }),
  );
  out.push(
    result(d, {
      id: "site:config",
      area: "site",
      title: "Site settings",
      severity: rep.missingEnv.length ? "crit" : "ok",
      summary: rep.missingEnv.length ? `Missing on the site: ${rep.missingEnv.join(", ")}.` : "Every required setting is present.",
      action: rep.missingEnv.length ? `Add ${rep.missingEnv.join(", ")} to Vercel → Settings → Environment Variables (Production), then redeploy. Or tell Claude what is missing.` : undefined,
    }),
  );
  return out;
}

// ── Inbox ───────────────────────────────────────────────────────────────────

export async function inboxWaiting(d: OpsDeps): Promise<CheckResult> {
  const id = "inbox:waiting";
  const title = "Inbox";
  if (!d.db) return unknown(d, id, "inbox", title, "No database connection from here.");
  try {
    const i = await d.db.inbox();
    if (!i.total) return result(d, { id, area: "inbox", title, severity: "ok", summary: "Nothing waiting." });
    const bits = [
      i.contact && `${i.contact} contact`,
      i.feedback && `${i.feedback} feedback`,
      i.priceReports && `${i.priceReports} wrong-price`,
      i.storeSuggestions && `${i.storeSuggestions} store suggestion${i.storeSuggestions === 1 ? "" : "s"}`,
      i.support && `${i.support} support`,
    ].filter(Boolean);
    const oldestH = i.oldestAt ? hoursSince(new Date(i.oldestAt), d.now) : 0;
    const sev = ageSeverity(oldestH, 48, 24 * 7);
    return result(d, {
      id,
      area: "inbox",
      title,
      severity: sev,
      summary: `${i.total} waiting (${bits.join(", ")}); the oldest is ${humanAge(oldestH)} old.`,
      action: sev === "ok" ? undefined : "Open the Inbox in the admin, or tell Claude: \"work through the inbox\" and it will read, fix and close what it can.",
    });
  } catch (e) {
    return unknown(d, id, "inbox", title, `Could not read it (${msg(e)}).`);
  }
}

// ── Run everything ──────────────────────────────────────────────────────────

/** A check that throws is `unknown`, never a crash and never a false alarm. */
async function guarded(d: OpsDeps, id: string, area: OpsArea, title: string, fn: () => Promise<CheckResult | CheckResult[]>): Promise<CheckResult[]> {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [r];
  } catch (e) {
    return [unknown(d, id, area, title, `The check itself failed (${msg(e)}).`)];
  }
}

export async function runChecks(d: OpsDeps): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const add = async (id: string, area: OpsArea, title: string, fn: () => Promise<CheckResult | CheckResult[]>) => out.push(...(await guarded(d, id, area, title, fn)));

  await add("db:operational", "databases", "Main database answering", () => databaseReachable(d));
  await add("neon:operational", "databases", "Main database: monthly transfer", () => neonTransfer(d, "operational"));
  await add("neon:history", "databases", "History database: monthly transfer", () => neonTransfer(d, "history"));
  await add("data:public-snapshot", "databases", "Safety-net copy of prices", async () => publicSnapshot(d));

  let token: string | null = null;
  await add("ebay:auth", "ebay", "eBay API keys", async () => {
    const a = await ebayAuth(d);
    token = a.token;
    return a.check;
  });
  await add("ebay:quota", "ebay", "eBay daily call allowance", () => ebayQuota(d, token));
  await add("ebay:data", "ebay", "eBay data", () => ebayData(d));

  await add("data:prices", "data", "Store prices", () => priceFreshness(d));
  await add("data:history", "data", "Daily price history", async () => historyFiles(d));
  await add("jobs", "site", "Scheduled jobs", () => scheduledJobs(d));
  await add("deploy:production", "site", "Latest production build", () => deployState(d));
  await add("site:live", "site", "Live site", () => siteProbe(d));
  await add("partner:dexcompare", "data", "DexCompare store prices (Pokémon)", () => dexcompareIndex(d));

  await add("stripe", "money", "Stripe", () => stripeChecks(d));
  await add("site:self", "email", "Email and site settings", () => siteSelfChecks(d));
  await add("inbox:waiting", "inbox", "Inbox", () => inboxWaiting(d));
  return out;
}
