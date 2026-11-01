import { createSign } from "node:crypto";

// Google Search Console clicks per day, script-side only (GitHub Actions holds
// GSC_SA_KEY; Vercel never does). scripts/growth-snapshot.ts stores the result in
// OpsSnapshot "growth:gsc" for /admin/growth, the owner's growth view
// (2026-10-27: "I need to be able to visualize this growth"). Same service-account
// flow as scripts/impact-report.ts.

export interface GscDay {
  d: string; // YYYY-MM-DD, Search Console's own (Pacific) day
  clicks: number;
  impr: number;
  pos: number;
}

async function token(raw: string): Promise<string> {
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${c}`);
  const jwt = `${h}.${c}.${b64(s.sign(sa.private_key))}`;
  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const tok = ((await tr.json()) as { access_token?: string }).access_token;
  if (!tok) throw new Error(`token request failed (${tr.status})`);
  return tok;
}

/** Every property the service account can read. Throws on any failure. */
export async function listGscProperties(raw: string): Promise<string[]> {
  const tok = await token(raw);
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`sites ${r.status}`);
  const j = (await r.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return (j.siteEntry ?? []).filter((e) => e.permissionLevel !== "siteUnverifiedUser").map((e) => e.siteUrl);
}

/** The bare host a property covers: "sc-domain:x.com", "https://www.x.com/" and "https://x.com/" are all "x.com". */
export function propertyHost(p: string): string {
  return p.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
}

/** One property per site, so a site with both a Domain and a URL-prefix property is not counted twice. The Domain property wins (it covers every host and protocol); among URL prefixes, https before http, bare before www. */
export function onePropertyPerHost(props: readonly string[]): string[] {
  const rank = (p: string) => (p.startsWith("sc-domain:") ? 0 : p.startsWith("https://") && !p.includes("://www.") ? 1 : p.startsWith("https://") ? 2 : 3);
  const best = new Map<string, string>();
  for (const p of props) {
    const h = propertyHost(p);
    const cur = best.get(h);
    if (!cur || rank(p) < rank(cur) || (rank(p) === rank(cur) && p < cur)) best.set(h, p);
  }
  return [...best.values()].sort((a, b) => propertyHost(a).localeCompare(propertyHost(b)));
}

/** Clicks, impressions and average position per day for one property. Throws on any failure. */
export async function fetchGscDaily(raw: string, property: string, start: string, end: string): Promise<GscDay[]> {
  const tok = await token(raw);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date"], rowLimit: 500 }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  const j = (await r.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
  return (j.rows ?? []).map((row) => ({ d: row.keys[0], clicks: row.clicks, impr: row.impressions, pos: row.position })).sort((a, b) => a.d.localeCompare(b.d));
}

// ── Pages competing for one search (2026-10-27, "Competing pages folded" in DECISIONS.md) ──
// A query where two or more of our pages each take a real share of the
// impressions: Google is choosing between our own pages instead of ranking one
// strongly. Shown on /admin/growth and printed by scripts/gsc-queries.ts.

export interface SplitPage {
  page: string; // site-relative path, #fragment folded into its page
  clicks: number;
  impr: number;
  pos: number;
}
export interface SplitQuery {
  query: string;
  impr: number;
  pages: SplitPage[];
}

/** Rows of a ["query", "page"] report → the queries split across our pages, biggest first. */
export function findSplitQueries(
  rows: readonly { keys: string[]; clicks: number; impressions: number; position: number }[],
  opts: { minImpr?: number; minShare?: number; limit?: number } = {},
): SplitQuery[] {
  const { minImpr = 100, minShare = 0.15, limit = 60 } = opts;
  const byQuery = new Map<string, Map<string, { impr: number; clicks: number; posW: number }>>();
  for (const r of rows) {
    const [q, u] = r.keys;
    const page = u.split("#")[0].replace(/^https?:\/\/[^/]+/, "") || "/";
    const m = byQuery.get(q) ?? new Map<string, { impr: number; clicks: number; posW: number }>();
    const e = m.get(page) ?? { impr: 0, clicks: 0, posW: 0 };
    e.impr += r.impressions;
    e.clicks += r.clicks;
    e.posW += r.position * r.impressions;
    m.set(page, e);
    byQuery.set(q, m);
  }
  const out: SplitQuery[] = [];
  for (const [query, m] of byQuery) {
    const impr = [...m.values()].reduce((a, e) => a + e.impr, 0);
    if (impr < minImpr) continue;
    const pages = [...m.entries()]
      .filter(([, e]) => e.impr >= minShare * impr)
      .map(([page, e]) => ({ page, clicks: e.clicks, impr: e.impr, pos: Math.round((e.posW / e.impr) * 10) / 10 }))
      .sort((a, b) => b.impr - a.impr);
    if (pages.length >= 2) out.push({ query, impr, pages });
  }
  return out.sort((a, b) => b.impr - a.impr).slice(0, limit);
}

/** The ["query", "page"] report for one property. Throws on any failure. */
export async function fetchGscQueryPages(raw: string, property: string, start: string, end: string) {
  const tok = await token(raw);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query", "page"], rowLimit: 25000 }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  return ((await r.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }).rows ?? [];
}
