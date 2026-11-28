import { credentials, get, listProjects } from "@/lib/analytics/vercel";
import { scrubSecrets } from "@/lib/earnings/sources";
import { siteForProject } from "@/lib/earnings/sites";

// WHAT VISITORS WANT, PER ITEM, FOR EVERY SITE'S HOME PAGE (owner, 2026-11-18: "the most popular items should be on the
// homepage in that order … the most likely items that will generate us a click and revenue"; DECISIONS.md, "Home pages rank
// items by demand"). One public JSON per site, /api/demand/<site>, read once a day by that site's own data job and committed
// with its data (so the file in git is also the log of what the ranking saw that day). Nothing is stored here.
//
// Two real signals from Vercel's PUBLIC Web Analytics API (the same token and team as /admin/analytics):
//   views   pageviews of each product page (by=requestPath, filtered to the site's product routes), last 28 and last 7 days.
//   clicks  `buy_product` events by product (DexCompare sends them with every buy click); a site that sends none gets its
//           `buy_click` events by product page instead, keyed by the page's slug (2026-11-28).
// The API answers at most 100 rows a query: the top 100 product pages a window, which is the head the home page needs.
// Counts only: no visitor, no query string (requestPath is the path), nothing private.

export interface ItemDemand {
  site: string;
  status: "ok" | "partial" | "not-configured" | "error";
  detail?: string;
  fetchedAt: string;
  /** The windows, inclusive, UTC days. */
  from28: string;
  from7: string;
  to: string;
  /** Product page path → [pageviews last 28 days, last 7 days]. */
  views: Record<string, [number, number]>;
  /** Product key (buy_product's `product`) → [buy clicks last 28 days, last 7 days]. */
  clicks: Record<string, [number, number]>;
}

/** Each site's product page routes, as Vercel records them (the App Router pattern, route groups dropped). */
export const DEMAND_ROUTES: Record<string, string[]> = {
  dex: ["/[region]/p/[slug]"],
  mtg: ["/[region]/p/[slug]"],
  wax: ["/[region]/p/[slug]"],
  wgc: ["/[region]/p/[slug]"],
  rc: ["/card/[id]", "/sealed/[slug]"],
  oc: ["/card/[slug]", "/sealed/[slug]"],
  tcgprices: ["/card/[slug]"],
  ygo: ["/card/[slug]"],
  gundam: ["/card/[slug]", "/kit/[slug]"],
  lorcana: ["/card/[slug]"],
  cyberpunk: ["/card/[slug]"],
  bandai: ["/card/[slug]"],
  figure: ["/figure/[slug]"],
  ky: ["/product/[slug]"],
  sc: ["/product/[slug]"],
  motor: ["/product/[slug]"],
  cc: ["/cameras/[slug]", "/lenses/[slug]", "/[market]/cameras/[slug]", "/[market]/lenses/[slug]"],
  ce: ["/[category]/[slug]", "/us/[category]/[slug]", "/uk/[category]/[slug]", "/ca/[category]/[slug]", "/sg/[category]/[slug]"],
};

/** Sites whose home ranking keys clicks by something other than the page slug (WargameCompare: the product id). */
const NO_CLICK_FALLBACK = new Set(["wgc", "rc"]);

/** The static part of each product route, for a contains() filter: "/[region]/p/[slug]" → "/p/". Routes with no static
 *  segment are left out, and a fragment two routes share is asked once (so a click is never counted twice). Pure. */
export function routeFragments(routes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of routes) {
    const fixed = r.split("/").filter((x) => x && !x.startsWith("["));
    if (fixed.length) out.add(`/${fixed.join("/")}/`);
  }
  return [...out];
}

/** Path → count into slug → count: the segment after the fragment, only when it is the path's last one. Pure. */
export function slugCounts(byPath: Map<string, number>, frag: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [path, n] of byPath) {
    const i = path.indexOf(frag);
    if (i < 0) continue;
    const slug = path.slice(i + frag.length).replace(/\/$/, "");
    if (!slug || slug.includes("/")) continue;
    out.set(slug, (out.get(slug) ?? 0) + n);
  }
  return out;
}

export const isDemandSite = (s: string) => Object.prototype.hasOwnProperty.call(DEMAND_ROUTES, s);

/** A grouped answer's rows as key → count, whatever the API names the value and the metric. Pure. */
export function groupedCounts(json: unknown, dim: string, metric: "pageviews" | "count"): Map<string, number> {
  const out = new Map<string, number>();
  const rows = (json as { data?: Record<string, unknown>[] } | null)?.data;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const entry = Object.entries(r).find(([k]) => k.toLowerCase().startsWith(dim.toLowerCase()));
    const key = entry?.[1] == null ? "" : String(entry[1]);
    if (!key || key === "Others") continue;
    const n = Number(r[metric] ?? r.count ?? r.pageviews ?? r.total ?? 0) || 0;
    out.set(key, (out.get(key) ?? 0) + n);
  }
  return out;
}

const day = (offset: number, now = Date.now()) => new Date(now + offset * 86400_000).toISOString().slice(0, 10);

/** Join a 28-day and a 7-day map into [28d, 7d] pairs. Pure. */
export function pairs(m28: Map<string, number>, m7: Map<string, number>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of m28) out[k] = [v, m7.get(k) ?? 0];
  for (const [k, v] of m7) if (!out[k]) out[k] = [v, v];
  return out;
}

export async function loadItemDemand(site: string): Promise<ItemDemand> {
  const to = day(0);
  const base: ItemDemand = { site, status: "ok", fetchedAt: new Date().toISOString(), from28: day(-27), from7: day(-6), to, views: {}, clicks: {} };
  const cred = credentials();
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN and VERCEL_TEAM_ID are not set." };
  const routes = DEMAND_ROUTES[site] ?? [];
  try {
    const projects = (await listProjects(cred.token, cred.team)).filter((p) => siteForProject(p.name) === site && !/riftboundstocks/i.test(p.name));
    if (!projects.length) return { ...base, status: "error", detail: "No Vercel project for this site." };
    let failed = 0;
    const merge = (into: Map<string, number>, m: Map<string, number>) => {
      for (const [k, v] of m) into.set(k, (into.get(k) ?? 0) + v);
    };
    const ask = async (path: string, q: Record<string, string>, dim: string, metric: "pageviews" | "count") => {
      try {
        return groupedCounts(await get(path, { teamId: cred.team, until: to, limit: "100", ...q }, cred.token), dim, metric);
      } catch {
        failed++;
        return new Map<string, number>();
      }
    };
    const VISITS = "/v1/query/web-analytics/visits/aggregate";
    const EVENTS = "/v1/query/web-analytics/events/aggregate";
    const window = async (since: string) => {
      const views = new Map<string, number>();
      const clicks = new Map<string, number>();
      for (const p of projects) {
        const byRoute = await Promise.all(
          routes.map((route) => ask(VISITS, { projectId: p.id, since, by: "requestPath", filter: `route eq '${route}'` }, "requestPath", "pageviews")),
        );
        let got = false;
        for (const m of byRoute) if (m.size) (got = true), merge(views, m);
        // No row through the route filter (a route Vercel names differently): the top 100 paths unfiltered; the site keeps its own.
        if (!got) merge(views, await ask(VISITS, { projectId: p.id, since, by: "requestPath" }, "requestPath", "pageviews"));
        const named = await ask(EVENTS, { projectId: p.id, since, by: "eventData/product", filter: "eventName eq 'buy_product'" }, "eventData", "count");
        merge(clicks, named);
        // No buy_product (every site but DexCompare): its buy_click events by the product page they came from, keyed by the
        // page's slug (the quick view moves the URL to the product page, so its clicks count too). Clicks, unlike page views,
        // are not inflated by the scraper bots that hit MTG's and other sites' product pages (2026-11-28, live stats read).
        if (!named.size && !NO_CLICK_FALLBACK.has(site))
          for (const frag of routeFragments(routes))
            merge(clicks, slugCounts(await ask(EVENTS, { projectId: p.id, since, by: "requestPath", filter: `eventName eq 'buy_click' and contains(requestPath,'${frag}')` }, "requestPath", "count"), frag));
      }
      return { views, clicks };
    };
    const [w28, w7] = await Promise.all([window(base.from28), window(base.from7)]);
    const views = pairs(w28.views, w7.views);
    const clicks = pairs(w28.clicks, w7.clicks);
    const empty = !Object.keys(views).length && !Object.keys(clicks).length;
    return { ...base, status: failed && empty ? "error" : failed ? "partial" : "ok", detail: failed ? `${failed} queries refused` : undefined, views, clicks };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}
