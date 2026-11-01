import { SITES, siteForProject } from "@/lib/earnings/sites";
import { scrubSecrets } from "@/lib/earnings/sources";
import { addDays, joinPoints, parseTimeRows, type Point, type SiteSeries } from "./series";

// The admin analytics page's data (2026-11-01): every Vercel project's visits and
// buy_click events from Vercel's PUBLIC Web Analytics API
// (GET /v1/query/web-analytics/{visits,events}/aggregate, bearer token +
// teamId + projectId), never the dashboard's internal endpoint, which needs a
// browser login. DECISIONS.md, "Admin analytics page from Vercel's Web Analytics API".
//
// • Token: VERCEL_ANALYTICS_TOKEN, else the billing token the earnings dashboard
//   already uses (VERCEL_BILLING_TOKEN); both are team-scoped Vercel tokens.
//   VERCEL_TEAM_ID names the team. Server-only, Production env of `riftcompare`.
// • Projects are listed from the team (GET /v10/projects) and mapped to sites with
//   the earnings dashboard's own mapping (siteForProject), so a new site appears by
//   itself; a project with Web Analytics off is listed as such and drawn as nothing.
// • Four requests a project: visits and buy_click, by day for 90 days and by week
//   for 12 months (each under the API's 100-row limit). Memoised 30 minutes; the
//   page's "Refresh" link bypasses it. No database is touched.

export const DAILY_DAYS = 90;
const TTL_MS = 30 * 60_000;
const API = "https://api.vercel.com";

export type AnalyticsStatus = "ok" | "not-configured" | "error";

export interface ProjectNote {
  project: string;
  site: string;
  status: "ok" | "no-analytics" | "error";
  detail?: string;
}

export interface AnalyticsData {
  status: AnalyticsStatus;
  detail?: string;
  today: string;
  fetchedAt: string;
  sites: SiteSeries[];
  projects: ProjectNote[];
}

let memo: { at: number; data: AnalyticsData } | null = null;

function credentials(): { token: string; team: string; tokenVar: string } | null {
  const team = process.env.VERCEL_TEAM_ID?.trim();
  const own = process.env.VERCEL_ANALYTICS_TOKEN?.trim();
  const billing = process.env.VERCEL_BILLING_TOKEN?.trim();
  const token = own || billing;
  if (!token || !team) return null;
  return { token, team, tokenVar: own ? "VERCEL_ANALYTICS_TOKEN" : "VERCEL_BILLING_TOKEN" };
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get(path: string, q: Record<string, string>, token: string): Promise<unknown> {
  const r = await fetch(`${API}${path}?${new URLSearchParams(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await r.text();
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${scrubSecrets(text).slice(0, 160).replace(/\s+/g, " ")}`);
  return JSON.parse(text) as unknown;
}

async function listProjects(token: string, team: string): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let until: string | null = null;
  for (let i = 0; i < 5; i++) {
    const q: Record<string, string> = { teamId: team, limit: "100" };
    if (until) q.until = until;
    const json = (await get("/v10/projects", q, token)) as { projects?: { id?: string; name?: string }[]; pagination?: { next?: number | null } };
    for (const p of json.projects ?? []) if (p.id && p.name) out.push({ id: p.id, name: p.name });
    const next = json.pagination?.next;
    if (!next) break;
    until = String(next);
  }
  return out;
}

/** Run `fn` over `items`, at most `n` at a time. */
async function pool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const label = (key: string, project: string) => SITES.find((s) => s.key === key)?.label ?? project;

export async function loadAnalytics(fresh = false): Promise<AnalyticsData> {
  const today = new Date().toISOString().slice(0, 10);
  const base = { today, fetchedAt: new Date().toISOString(), sites: [], projects: [] };
  const cred = credentials();
  if (!cred) {
    return {
      ...base,
      status: "not-configured",
      detail: "Add VERCEL_ANALYTICS_TOKEN (a Vercel token scoped to the team) and VERCEL_TEAM_ID to the riftcompare project's Production environment.",
    };
  }
  if (!fresh && memo && Date.now() - memo.at < TTL_MS) return memo.data;
  try {
    const projects = await listProjects(cred.token, cred.team);
    const dayFrom = addDays(today, -(DAILY_DAYS - 1));
    const weekFrom = addDays(today, -364);
    const notes: ProjectNote[] = [];
    const perProject = await pool(projects, 4, async (p) => {
      const site = siteForProject(p.name);
      const q = (since: string, by: "day" | "week", extra: Record<string, string> = {}) => ({
        teamId: cred.team,
        projectId: p.id,
        since,
        until: today,
        by,
        limit: "100",
        ...extra,
      });
      const click = { filter: "eventName eq 'buy_click'" };
      try {
        const [vd, vw] = await Promise.all([
          get("/v1/query/web-analytics/visits/aggregate", q(dayFrom, "day"), cred.token),
          get("/v1/query/web-analytics/visits/aggregate", q(weekFrom, "week"), cred.token),
        ]);
        // A site that never sent a buy_click (or has custom events off) still shows its visits.
        const [cd, cw] = await Promise.all([
          get("/v1/query/web-analytics/events/aggregate", q(dayFrom, "day", click), cred.token).catch(() => null),
          get("/v1/query/web-analytics/events/aggregate", q(weekFrom, "week", click), cred.token).catch(() => null),
        ]);
        const daily = joinPoints(parseTimeRows(vd), parseTimeRows(cd));
        const weekly = joinPoints(parseTimeRows(vw), parseTimeRows(cw));
        const any = weekly.some((w) => w.visitors || w.pageviews);
        notes.push({ project: p.name, site, status: any ? "ok" : "no-analytics", detail: any ? undefined : "No visits in the last 12 months (Web Analytics may be off)." });
        return any ? { site, project: p.name, daily, weekly } : null;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        const off = status === 400 || status === 402 || status === 403 || status === 404;
        notes.push({
          project: p.name,
          site,
          status: off ? "no-analytics" : "error",
          detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed",
        });
        return null;
      }
    });
    const bySite = new Map<string, { projects: string[]; daily: Point[]; weekly: Point[] }>();
    for (const r of perProject) {
      if (!r) continue;
      const s = bySite.get(r.site) ?? { projects: [], daily: [], weekly: [] };
      s.projects.push(r.project);
      s.daily.push(...r.daily);
      s.weekly.push(...r.weekly);
      bySite.set(r.site, s);
    }
    const sites: SiteSeries[] = [...bySite.entries()].map(([key, s]) => ({
      key,
      label: label(key, s.projects[0]),
      projects: s.projects.sort(),
      daily: joinPoints(s.daily, s.daily.map((p) => ({ t: p.t, count: p.clicks }))),
      weekly: joinPoints(s.weekly, s.weekly.map((p) => ({ t: p.t, count: p.clicks }))),
    }));
    const data: AnalyticsData = {
      ...base,
      status: "ok",
      detail: `Vercel Web Analytics API, read with ${cred.tokenVar}.`,
      sites,
      projects: notes.sort((a, b) => a.project.localeCompare(b.project)),
    };
    memo = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error("[analytics] vercel failed:", e);
    if (memo) return { ...memo.data, status: "error", detail: `Showing the last good read. ${e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : ""}` };
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}
