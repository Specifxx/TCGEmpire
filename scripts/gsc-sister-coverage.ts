/**
 * INDEX COVERAGE SAMPLE FOR THE SISTER SITES — read-only.
 *
 * For each sister site, reads its live sitemap (following a sitemap index), picks SAMPLE
 * URLs spread evenly through it plus the homepage, and asks Search Console's URL Inspection
 * API what Google knows about each: indexed, "Discovered – currently not indexed",
 * "Crawled – currently not indexed", unknown, or blocked. The remedies differ (links and
 * crawl budget, thinner-page work, or nothing), so this runs before any indexing work.
 * About 30 inspections per site against a quota of 2,000 per site per day.
 *
 * Usage: GSC_SA_KEY=... SAMPLE=30 npx tsx scripts/gsc-sister-coverage.ts
 */
import { createSign } from "node:crypto";

const SAMPLE = Math.max(5, Math.min(200, Number(process.env.SAMPLE ?? 30)));
// Every Compare Empire site (2026-11-07). The Search Console property is found from the service account's own list:
// the domain property when it has one, else a URL-prefix property on the same host.
const ORIGINS = [
  "https://riftcompare.com", "https://dexcompare.app", "https://opcompare.app", "https://mtgcompare.app",
  "https://gundamcompare.com", "https://lorcanacompare.com", "https://ygocompare.com", "https://cyberpunkcompare.com",
  "https://bandaicompare.com", "https://www.camcompare.app", "https://compareempire.com", "https://wargamecompare.com",
  "https://figurecompare.com", "https://kaeyoung.com", "https://scentcompare.app", "https://sportscardcompare.com", "https://motorcompare.app", "https://riftboundstocks.com",
];
const ONLY = (process.env.ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);

async function token(): Promise<string> {
  const sa = JSON.parse(process.env.GSC_SA_KEY ?? "") as { client_email: string; private_key: string };
  const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${c}`);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64(s.sign(sa.private_key))}` }),
  });
  const t = ((await r.json()) as { access_token?: string }).access_token;
  if (!t) throw new Error(`token request failed (${r.status})`);
  return t;
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

async function sitemapUrls(origin: string): Promise<{ urls: string[]; final: string }> {
  const r = await fetch(`${origin}/sitemap.xml`, { redirect: "follow", headers: { "User-Agent": "CompareEmpire-coverage" }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`sitemap ${r.status}`);
  const xml = await r.text();
  const final = new URL(r.url).origin;
  if (!/<sitemapindex/i.test(xml)) return { urls: locs(xml), final };
  const urls: string[] = [];
  for (const sm of locs(xml)) {
    const x = await fetch(sm, { headers: { "User-Agent": "CompareEmpire-coverage" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!x) {
      console.log(`  (${sm}: no answer in 30 s, skipped)`);
      continue;
    }
    if (x.ok) urls.push(...locs(await x.text()));
  }
  return { urls, final };
}

async function inspect(tok: string, property: string, url: string) {
  const r = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r) return { state: "no answer in 30 s", crawled: "" };
  if (!r.ok) return { state: `HTTP ${r.status}`, crawled: "" };
  type R = { coverageState?: string; lastCrawlTime?: string; robotsTxtState?: string; indexingState?: string; pageFetchState?: string; googleCanonical?: string; userCanonical?: string };
  const j = (await r.json()) as { inspectionResult?: { indexStatusResult?: R } };
  const s = j.inspectionResult?.indexStatusResult;
  // The blockers, only when one is present: a robots block, a noindex, a failed fetch, or Google picking another canonical.
  const flags = [
    s?.robotsTxtState === "DISALLOWED" ? "robots-blocked" : "",
    s?.indexingState && s.indexingState !== "INDEXING_ALLOWED" && s.indexingState !== "INDEXING_STATE_UNSPECIFIED" ? s.indexingState : "",
    s?.pageFetchState && s.pageFetchState !== "SUCCESSFUL" && s.pageFetchState !== "PAGE_FETCH_STATE_UNSPECIFIED" ? `fetch ${s.pageFetchState}` : "",
    s?.googleCanonical && s.userCanonical && s.googleCanonical !== s.userCanonical ? `google canonical ${s.googleCanonical}` : "",
  ].filter(Boolean);
  return { state: s?.coverageState ?? "no result", crawled: [s?.lastCrawlTime?.slice(0, 10) ?? "", ...flags].filter(Boolean).join(", ") };
}

async function api<T>(tok: string, url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  return r && r.ok ? ((await r.json()) as T) : null;
}

/** The property for an origin: sc-domain:<host without www> first, else a URL-prefix property on that host. */
function propertyFor(origin: string, props: string[]): string | null {
  const host = new URL(origin).host;
  const bare = host.replace(/^www\./, "");
  return props.find((p) => p === `sc-domain:${bare}`) ?? props.find((p) => p === `${origin}/`) ?? props.find((p) => p.startsWith("http") && new URL(p).host.replace(/^www\./, "") === bare) ?? null;
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  const list = await api<{ siteEntry?: { siteUrl: string }[] }>(tok, "https://www.googleapis.com/webmasters/v3/sites");
  const props = (list?.siteEntry ?? []).map((e) => e.siteUrl);
  console.log(`Search Console properties this account reads: ${props.length}`);
  for (const origin of ORIGINS.filter((o) => !ONLY.length || ONLY.some((x) => o.includes(x)))) {
    const property = propertyFor(origin, props);
    if (!property) {
      console.log(`\n=== ${origin}: no Search Console property this account can read`);
      continue;
    }
    // What Search Console says about each submitted sitemap: last read, errors, warnings, URLs submitted.
    type Sm = { path: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { type: string; submitted?: string }[] };
    const sms = await api<{ sitemap?: Sm[] }>(tok, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`);
    let urls: string[];
    let final: string;
    try {
      ({ urls, final } = await sitemapUrls(origin));
    } catch (e) {
      console.log(`\n=== ${origin}: sitemap not readable (${(e as Error).message})`);
      continue;
    }
    const step = Math.max(1, Math.floor(urls.length / SAMPLE));
    const pick = [...new Set([`${final}/`, ...urls.filter((_, i) => i % step === 0).slice(0, SAMPLE)])];
    const tally = new Map<string, string[]>();
    for (const u of pick) {
      const { state, crawled } = await inspect(tok, property, u);
      tally.set(state, [...(tally.get(state) ?? []), `${u.replace(final, "") || "/"}${crawled ? ` (${crawled})` : ""}`]);
      await new Promise((res) => setTimeout(res, 150));
    }
    console.log(`\n=== ${final} (${property}): ${urls.length} URLs in the live sitemap, ${pick.length} inspected`);
    for (const sm of sms?.sitemap ?? []) {
      const sub = (sm.contents ?? []).map((c) => `${c.submitted ?? "?"} ${c.type}`).join(", ");
      console.log(`  sitemap ${sm.path}: read ${sm.lastDownloaded?.slice(0, 10) ?? "never"}${sm.isPending ? " (pending)" : ""}, ${sm.errors ?? 0} errors, ${sm.warnings ?? 0} warnings${sub ? `, ${sub}` : ""}`);
    }
    if (!sms?.sitemap?.length) console.log("  sitemap: NONE SUBMITTED in Search Console");
    for (const [state, us] of [...tally].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(us.length).padStart(3)}  ${state}`);
      for (const u of us.slice(0, 6)) console.log(`         ${u}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
