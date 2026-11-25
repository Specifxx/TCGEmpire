import { credentials, get, listProjects } from "@/lib/analytics/vercel";
import { scrubSecrets } from "@/lib/earnings/sources";
import { siteForProject } from "@/lib/earnings/sites";
import { isDemandSite } from "@/lib/analytics/item-demand";

// IS A SITE'S TRAFFIC HUMAN? (boardroom, 2026-11-19: ScentCompare's bot-or-human audit by 22 Nov.) One public JSON per site,
// /api/demand/<site>?audit=1: Vercel Web Analytics' visitors and pageviews over the last 28 and 7 days, grouped by referrer,
// country, device, OS and browser (top 100 rows each), and the site's buy_click events. Aggregate counts only, the same
// public API and token as /api/demand: no visitor, no path, no query string, nothing private.

export const AUDIT_DIMS = ["referrer", "country", "deviceType", "osName", "browserName"] as const;
/** The API's name for the referrer dimension is not documented; "referrer" was refused (2026-11-19 run), so these are tried in
 *  order and the first that answers is kept. A refusal's message lists the allowed values, so errors keep 400 characters. */
export const REFERRER_NAMES = ["referrerHostname", "referrer_hostname", "referrerHost", "referrerUrl", "referrer"] as const;
type Dim = (typeof AUDIT_DIMS)[number];

export interface TrafficAudit {
  site: string;
  status: "ok" | "partial" | "not-configured" | "error";
  detail?: string;
  fetchedAt: string;
  from28: string;
  from7: string;
  to: string;
  /** Totals: [visitors, pageviews] over 28 and 7 days; buy_click events [count, visitors] the same. */
  total: { d28: [number, number]; d7: [number, number] };
  buyClicks: { d28: [number, number]; d7: [number, number] };
  /** Dimension → value → [visitors, pageviews], last 28 days and last 7. */
  by: Partial<Record<Dim, { d28: Record<string, [number, number]>; d7: Record<string, [number, number]> }>>;
  errors: string[];
}

const day = (offset: number, now = Date.now()) => new Date(now + offset * 86400_000).toISOString().slice(0, 10);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Rows of a grouped answer as value → [visitors, pageviews or count]. Pure. */
export function auditRows(json: unknown, dim: string): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const entry = Object.entries(r).find(([k]) => k.toLowerCase() === dim.toLowerCase());
    const key = entry?.[1] == null || entry[1] === "" ? "(none)" : String(entry[1]);
    const prev = out[key] ?? [0, 0];
    out[key] = [prev[0] + num(r.visitors), prev[1] + num(r.pageviews ?? r.count)];
  }
  return out;
}

/** Sums every row of an ungrouped or grouped answer as [visitors, pageviews or count]. Pure. */
export function auditTotal(json: unknown): [number, number] {
  const rows = (json as { data?: Record<string, unknown>[] | Record<string, unknown> } | null)?.data;
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return list.reduce<[number, number]>((a, r) => [a[0] + num(r.visitors), a[1] + num(r.pageviews ?? r.count)], [0, 0]);
}

export async function loadTrafficAudit(site: string): Promise<TrafficAudit> {
  const to = day(0);
  const base: TrafficAudit = {
    site, status: "ok", fetchedAt: new Date().toISOString(), from28: day(-27), from7: day(-6), to,
    total: { d28: [0, 0], d7: [0, 0] }, buyClicks: { d28: [0, 0], d7: [0, 0] }, by: {}, errors: [],
  };
  if (!isDemandSite(site)) return { ...base, status: "error", detail: "Unknown site" };
  const cred = credentials();
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN and VERCEL_TEAM_ID are not set." };
  try {
    const projects = (await listProjects(cred.token, cred.team)).filter((p) => siteForProject(p.name) === site && !/riftboundstocks/i.test(p.name));
    if (!projects.length) return { ...base, status: "error", detail: "No Vercel project for this site." };
    const VISITS = "/v1/query/web-analytics/visits/aggregate";
    const EVENTS = "/v1/query/web-analytics/events/aggregate";
    const errors: string[] = [];
    const ask = async (path: string, q: Record<string, string>): Promise<unknown> => {
      try {
        return await get(path, { teamId: cred.team, until: to, limit: "100", ...q }, cred.token);
      } catch (e) {
        errors.push(`${q.by ?? "total"}${q.filter ? " " + q.filter : ""}: ${e instanceof Error ? scrubSecrets(e.message).slice(0, 400) : "failed"}`);
        return null;
      }
    };
    const add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]];
    const out = { ...base };
    for (const [key, since] of [["d28", base.from28], ["d7", base.from7]] as const) {
      for (const p of projects) {
        // Every query needs a `by` (2026-11-19 run: "missing required property `by`"). Visitors are counted once each by
        // deviceType (summing days would count a visitor once per day), so the total is that dimension's sum; buy_click by day.
        out.buyClicks[key] = add(out.buyClicks[key], auditTotal(await ask(EVENTS, { projectId: p.id, since, by: "day", filter: "eventName eq 'buy_click'" })));
        for (const dim of AUDIT_DIMS) {
          let json: unknown = null;
          for (const name of dim === "referrer" ? REFERRER_NAMES : [dim]) {
            json = await ask(VISITS, { projectId: p.id, since, by: name });
            if (json) { json = { data: ((json as { data?: Record<string, unknown>[] }).data ?? []).map((r) => ({ ...r, [dim]: r[name] ?? r[dim] })) }; break; }
          }
          const rows = auditRows(json, dim);
          const slot = (out.by[dim] ??= { d28: {}, d7: {} })[key];
          for (const [k, v] of Object.entries(rows)) slot[k] = add(slot[k] ?? [0, 0], v);
          if (dim === "deviceType") out.total[key] = add(out.total[key], Object.values(rows).reduce<[number, number]>((a, v) => add(a, v), [0, 0]));
        }
      }
    }
    return { ...out, status: errors.length ? "partial" : "ok", errors };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}
