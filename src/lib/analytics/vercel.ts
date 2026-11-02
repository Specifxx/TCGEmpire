import { SITES, siteForProject } from "@/lib/earnings/sites";
import { scrubSecrets } from "@/lib/earnings/sources";
import { addDays, dedupeRows, joinPoints, parseTimeRows, queryWindows, type Point, type SiteSeries } from "./series";

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
// • Visits and buy_click per project, by day for 90 days (two 60-day windows) and
//   by week for 12 months (three 24-week windows): the API caps a query at 62 days
//   by day and 26 weeks by week. Memoised 30 minutes; the
//   page's "Refresh" link bypasses it. No database is touched.

export const DAILY_DAYS = 90;
// The API's caps are 62 days by day and 26 weeks by week; these leave room for its widening to whole buckets.
const DAY_WINDOW = 60;
const WEEK_WINDOW = 168;

// RiftboundStocks is its own site with its own visitors; the earnings mapping files
// its (shared) costs under RiftCompare, but its traffic gets its own line here.
const analyticsSite = (project: string) => (/riftboundstocks/i.test(project) ? `project:${project.toLowerCase()}` : siteForProject(project));
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
    const dayWins = queryWindows(addDays(today, -(DAILY_DAYS - 1)), today, DAY_WINDOW);
    const weekWins = queryWindows(addDays(today, -364), today, WEEK_WINDOW);
    const notes: ProjectNote[] = [];
    const perProject = await pool(projects, 4, async (p) => {
      const site = analyticsSite(p.name);
      const q = (since: string, until: string, by: "day" | "week", extra: Record<string, string> = {}) => ({
        teamId: cred.team,
        projectId: p.id,
        since,
        until,
        by,
        limit: "100",
        ...extra,
      });
      const click = { filter: "eventName eq 'buy_click'" };
      // Each window on its own: one refused window (older than the plan keeps, say) leaves the others standing.
      let firstError: unknown = null;
      let answered = 0;
      const read = async (path: string, by: "day" | "week", wins: [string, string][], extra?: Record<string, string>, visits = false) => {
        const rows = await Promise.all(
          wins.map(([a, b]) =>
            get(path, q(a, b, by, extra), cred.token).then(
              (j) => {
                if (visits) answered++;
                return parseTimeRows(j);
              },
              (e) => {
                if (visits) firstError ??= e;
                return [];
              },
            ),
          ),
        );
        return dedupeRows(rows.flat());
      };
      try {
        const VISITS = "/v1/query/web-analytics/visits/aggregate";
        const EVENTS = "/v1/query/web-analytics/events/aggregate";
        const [vd, vw] = await Promise.all([read(VISITS, "day", dayWins, undefined, true), read(VISITS, "week", weekWins, undefined, true)]);
        if (!answered) throw firstError ?? new Error("No answer");
        // A site that never sent a buy_click (or has custom events off) still shows its visits.
        const [cd, cw] = await Promise.all([read(EVENTS, "day", dayWins, click), read(EVENTS, "week", weekWins, click)]);
        const daily = joinPoints(vd, cd);
        const weekly = joinPoints(vw, cw);
        const any = [...daily, ...weekly].some((w) => w.visitors || w.pageviews);
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

// WORD OF MOUTH (2026-11-02, DECISIONS.md "Share buttons and shared lists"):
// every site's share button sends a `share` event and a visit a shared link
// (utm_source=share) brings sends one `share_visit`. The weekly growth report
// counts both per site, by day, from the same public API and credentials. Two
// requests a project; a project with no events (or custom events off) is zero.
export interface ShareDay {
  day: string;
  shares: number;
  visits: number;
}

export interface ShareCounts {
  status: AnalyticsStatus;
  detail?: string;
  sites: { key: string; label: string; days: ShareDay[] }[];
}

export async function loadShareCounts(since: string, until: string): Promise<ShareCounts> {
  const cred = credentials();
  if (!cred) return { status: "not-configured", sites: [] };
  try {
    const projects = await listProjects(cred.token, cred.team);
    const per = await pool(projects, 4, async (p) => {
      const q = (name: string) => ({ teamId: cred.team, projectId: p.id, since, until, by: "day", limit: "100", filter: `eventName eq '${name}'` });
      const [s, v] = await Promise.all([
        get("/v1/query/web-analytics/events/aggregate", q("share"), cred.token).catch(() => null),
        get("/v1/query/web-analytics/events/aggregate", q("share_visit"), cred.token).catch(() => null),
      ]);
      return { site: siteForProject(p.name), project: p.name, shares: parseTimeRows(s), visits: parseTimeRows(v) };
    });
    const bySite = new Map<string, Map<string, ShareDay>>();
    for (const r of per) {
      const days = bySite.get(r.site) ?? new Map<string, ShareDay>();
      const at = (t: string) => days.get(t) ?? days.set(t, { day: t, shares: 0, visits: 0 }).get(t)!;
      for (const x of r.shares) at(x.t).shares += x.count;
      for (const x of r.visits) at(x.t).visits += x.count;
      bySite.set(r.site, days);
    }
    return {
      status: "ok",
      sites: [...bySite.entries()].map(([key, days]) => ({ key, label: label(key, key), days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)) })),
    };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed", sites: [] };
  }
}
