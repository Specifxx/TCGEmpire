import { credentials, get, listProjects } from "@/lib/analytics/vercel";
import { groupedCounts } from "@/lib/analytics/item-demand";
import { scrubSecrets } from "./sources";
import { siteForProject } from "./sites";
import { readStored, writeStored } from "./stored";
import { PRODUCT_SITES, retailerNetwork, type CatalogProduct, type ClickNetwork, type ProductClicks, type ProductSite, type SiteProductClicks } from "./product-earnings";

// BUY CLICKS BY PRODUCT PAGE AND NETWORK, LAST 30 DAYS, FOR DEXCOMPARE AND MTG COMPARE
// (owner, 2026-11-26; the view is lib/earnings/product-earnings.ts). Read only: nothing on
// either site changes. Every buy link on both sites sends Vercel a `buy_click {retailer,
// placement}` event (Pro keeps two properties), and Vercel records the page it fired on, so:
//   1. buy_click by eventData/retailer                      → the retailer values, sorted into networks;
//   2. buy_click by requestPath                              → every click by page;
//   3. per TCGplayer / eBay / Amazon retailer value, buy_click AND that retailer, by requestPath
//                                                            → each network's clicks by page.
// A query Vercel refuses leaves its part null and the page says so (never a zero). DexCompare
// also sends buy_product {product, region}: its clicks by product, quick view included.
// The catalogue (slug, name, type, set code) comes from each site's public products.json on
// GitHub, so sales can be matched to products and products to sets.
// Refreshed by the earnings-refresh cron at most once every 20 hours (about 20 queries a site).

export const PRODUCT_CLICKS_KEY = "product-clicks";
const REFRESH_MS = 20 * 3600_000;
const EVENTS = "/v1/query/web-analytics/events/aggregate";

export const CATALOG_URLS: Record<ProductSite, string> = {
  mtg: "https://raw.githubusercontent.com/Specifxx/mtgcompare/main/data/public/products.json",
  dex: "https://raw.githubusercontent.com/Specifxx/CompareEmpire/main/apps/dexcompare-sealed/data/public/products.json",
};

const day = (offset: number, now = Date.now()) => new Date(now + offset * 86400_000).toISOString().slice(0, 10);
/** OData string literal: a quote is doubled. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The public products.json rows, trimmed to what the view needs. Pure. */
export function trimCatalog(json: unknown): CatalogProduct[] {
  const rows = Array.isArray(json) ? json : [];
  const out: CatalogProduct[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const slug = typeof r?.slug === "string" ? r.slug : "";
    const name = typeof r?.name === "string" ? r.name : "";
    if (!slug || !name) continue;
    out.push({ slug, name: name.slice(0, 160), ...(typeof r.productType === "string" ? { type: r.productType } : {}), ...(typeof r.setCode === "string" ? { setCode: r.setCode } : {}) });
  }
  return out;
}

async function loadCatalog(site: ProductSite): Promise<CatalogProduct[] | null> {
  try {
    const r = await fetch(CATALOG_URLS[site], { headers: { "User-Agent": "RiftCompareEarnings/1.0" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return trimCatalog(await r.json());
  } catch {
    return null;
  }
}

const toRecord = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));

export async function refreshSiteClicks(site: ProductSite, now = Date.now()): Promise<SiteProductClicks> {
  const from = day(-29, now);
  const to = day(0, now);
  const catalog = await loadCatalog(site);
  const base: SiteProductClicks = {
    site,
    status: "ok",
    fetchedAt: now,
    from,
    to,
    byPath: null,
    byNetwork: { tcgplayer: null, ebay: null, amazon: null },
    retailers: {},
    byProduct: {},
    catalog: catalog ?? [],
    catalogStatus: catalog ? "ok" : "error",
  };
  const cred = credentials();
  if (!cred) return { ...base, status: "not-configured", detail: "VERCEL_ANALYTICS_TOKEN and VERCEL_TEAM_ID are not set." };
  try {
    const projects = (await listProjects(cred.token, cred.team)).filter((p) => siteForProject(p.name) === site);
    if (!projects.length) return { ...base, status: "error", detail: "No Vercel project for this site." };
    const refused: string[] = [];
    const ask = async (projectId: string, by: string, filter: string, dim: string, what: string): Promise<Map<string, number> | null> => {
      try {
        return groupedCounts(await get(EVENTS, { teamId: cred.team, projectId, since: from, until: to, limit: "100", by, filter }, cred.token), dim, "count");
      } catch (e) {
        refused.push(`${what}: ${e instanceof Error ? scrubSecrets(e.message).slice(0, 80) : "failed"}`);
        return null;
      }
    };
    const merge = (into: Map<string, number> | null, m: Map<string, number> | null): Map<string, number> | null => {
      if (!m) return into;
      const out = into ?? new Map<string, number>();
      for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v);
      return out;
    };
    const click = "eventName eq 'buy_click'";
    let retailers: Map<string, number> | null = null;
    let byPath: Map<string, number> | null = null;
    const byNet: Record<ClickNetwork, Map<string, number> | null> = { tcgplayer: null, ebay: null, amazon: null };
    let byProduct: Map<string, number> | null = null;
    for (const p of projects) {
      const r = await ask(p.id, "eventData/retailer", click, "eventData", "retailers");
      retailers = merge(retailers, r);
      byPath = merge(byPath, await ask(p.id, "requestPath", click, "requestPath", "clicks by page"));
      for (const [value] of r ?? []) {
        const net = retailerNetwork(value);
        if (!net) continue;
        byNet[net] = merge(byNet[net], await ask(p.id, "requestPath", `${click} and eventData/retailer eq ${lit(value)}`, "requestPath", `${net} clicks by page`));
      }
      if (site === "dex") byProduct = merge(byProduct, await ask(p.id, "eventData/product", "eventName eq 'buy_product'", "eventData", "buy_product"));
    }
    const out: SiteProductClicks = {
      ...base,
      retailers: retailers ? toRecord(retailers) : {},
      byPath: byPath ? toRecord(byPath) : null,
      byNetwork: { tcgplayer: byNet.tcgplayer && toRecord(byNet.tcgplayer), ebay: byNet.ebay && toRecord(byNet.ebay), amazon: byNet.amazon && toRecord(byNet.amazon) },
      byProduct: byProduct ? toRecord(byProduct) : {},
    };
    const nothing = !retailers && !byPath;
    return { ...out, status: nothing ? "error" : refused.length || !catalog ? "partial" : "ok", detail: [catalog ? "" : "The catalogue could not be read.", refused.slice(0, 4).join("; ")].filter(Boolean).join(" ") || undefined };
  } catch (e) {
    return { ...base, status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed" };
  }
}

export async function loadProductClicks(): Promise<ProductClicks | null> {
  return (await readStored<ProductClicks>([PRODUCT_CLICKS_KEY])).get(PRODUCT_CLICKS_KEY) ?? null;
}

/** For the refresh cron: at most once in 20 hours (or now, `force`); a site that read nothing keeps its last good copy. */
export async function storeProductClicks(force = false, now = Date.now()): Promise<{ status: "ok" | "kept" | "error" }> {
  const kept = await loadProductClicks().catch(() => null);
  if (!force && kept && now - kept.fetchedAt < REFRESH_MS) return { status: "kept" };
  const fresh: SiteProductClicks[] = [];
  for (const s of PRODUCT_SITES) {
    const got = await refreshSiteClicks(s.key, now);
    const old = kept?.sites.find((x) => x.site === s.key);
    fresh.push(got.status === "error" && old ? old : got.catalogStatus === "error" && old?.catalog.length ? { ...got, catalog: old.catalog } : got);
  }
  if (!fresh.some((s) => s.status !== "error")) return { status: kept ? "kept" : "error" };
  await writeStored(PRODUCT_CLICKS_KEY, { fetchedAt: now, sites: fresh } satisfies ProductClicks);
  return { status: "ok" };
}
