import { credentials, get, listProjects, pool } from "@/lib/analytics/vercel";
import { scrubSecrets } from "./sources";
import { siteForProject } from "./sites";
import { readStored, writeStored } from "./stored";

// AMAZON CLICKS PER SITE, HANDS-OFF (2026-11-08, owner: tracking Amazon through a
// Claude prompt is too much work; Amazon blocks agents from Associates Central).
// Every site sends a `buy_click` event to Vercel Web Analytics, and an Amazon click
// carries "amazon" in one of its properties, under a different key per site family
// (retailer, placement, host, surface, source). The refresh cron groups the clicks
// by each key through Vercel's PUBLIC Web Analytics API (same token as the
// analytics page) and keeps the Amazon ones per site; the earnings page shows them.
// Earnings are NOT read here: Amazon offers no reporting API at our size.
// Per project the largest key count is used, never the sum: one click can carry
// "amazon" under several keys. Analytics under-counts visitors who decline consent.

export const CLICK_KEYS = ["retailer", "placement", "host", "surface", "source"] as const;
export const AMAZON_CLICKS_KEY = "amazon-clicks";

export interface AmazonClickSite {
  site: string;
  projects: string[];
  d7: number;
  d30: number;
}
export interface AmazonClicks {
  status: "ok" | "not-configured" | "error";
  detail?: string;
  fetchedAt: number;
  sites: AmazonClickSite[];
}

/** Sum the rows of a `by=eventData/<key>` answer whose value names Amazon. Pure. */
export function amazonCount(json: unknown): number {
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data;
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const r of rows) {
    const value = Object.entries(r).find(([k]) => k.toLowerCase().startsWith("eventdata"))?.[1];
    if (typeof value === "string" && /amazon|amzn/i.test(value)) n += Number(r.count) || 0;
  }
  return n;
}

/** Fold per-project counts into per-site rows, biggest first. Pure. */
export function foldSites(rows: { project: string; d7: number; d30: number }[], siteOf: (p: string) => string = siteForProject): AmazonClickSite[] {
  const by = new Map<string, AmazonClickSite>();
  for (const r of rows) {
    if (!r.d30 && !r.d7) continue;
    const key = siteOf(r.project);
    const s = by.get(key) ?? { site: key, projects: [], d7: 0, d30: 0 };
    s.projects.push(r.project);
    s.d7 += r.d7;
    s.d30 += r.d30;
    by.set(key, s);
  }
  return [...by.values()].sort((a, b) => b.d30 - a.d30);
}

const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

export async function refreshAmazonClicks(): Promise<AmazonClicks> {
  const cred = credentials();
  const base = { fetchedAt: Date.now(), sites: [] as AmazonClickSite[] };
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN or VERCEL_BILLING_TOKEN and VERCEL_TEAM_ID are not set." };
  try {
    const projects = await listProjects(cred.token, cred.team);
    const until = day(0);
    let answered = 0;
    const rows = await pool(projects, 4, async (p) => {
      const count = async (since: string, key: string) => {
        try {
          const j = await get(
            "/v1/query/web-analytics/events/aggregate",
            { teamId: cred.team, projectId: p.id, since, until, by: `eventData/${key}`, limit: "100", filter: "eventName eq 'buy_click'" },
            cred.token,
          );
          answered++;
          return amazonCount(j);
        } catch {
          return 0; // Web Analytics off for this project
        }
      };
      const best = async (since: string) => Math.max(0, ...(await Promise.all(CLICK_KEYS.map((k) => count(since, k)))));
      const [d7, d30] = await Promise.all([best(day(-6)), best(day(-29))]);
      return { project: p.name, d7, d30 };
    });
    if (!answered) return { ...base, status: "error", detail: "Vercel answered no analytics request." };
    return { ...base, status: "ok", sites: foldSites(rows) };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}

/** Refresh and keep. A failed refresh never replaces a good copy. */
export async function storeAmazonClicks(): Promise<AmazonClicks> {
  const fresh = await refreshAmazonClicks();
  if (fresh.status === "ok") await writeStored(AMAZON_CLICKS_KEY, fresh);
  return fresh;
}

export async function loadAmazonClicks(): Promise<AmazonClicks | null> {
  return (await readStored<AmazonClicks>([AMAZON_CLICKS_KEY])).get(AMAZON_CLICKS_KEY) ?? null;
}
