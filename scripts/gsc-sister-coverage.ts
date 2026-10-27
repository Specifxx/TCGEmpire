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
// [Search Console property, site origin]. Domain properties accept any URL on the domain.
const SITES: [string, string][] = [
  ["https://www.dexcompare.app/", "https://www.dexcompare.app"],
  ["sc-domain:opcompare.app", "https://opcompare.app"],
  ["https://mtgcompare.app/", "https://mtgcompare.app"],
  ["sc-domain:gundamcompare.com", "https://gundamcompare.com"],
  ["sc-domain:lorcanacompare.com", "https://lorcanacompare.com"],
  ["sc-domain:ygocompare.com", "https://ygocompare.com"],
  ["https://www.camcompare.app/", "https://www.camcompare.app"],
  ["https://www.compareempire.com/", "https://www.compareempire.com"],
];

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
  const r = await fetch(`${origin}/sitemap.xml`, { redirect: "follow", headers: { "User-Agent": "CompareEmpire-coverage" } });
  if (!r.ok) throw new Error(`sitemap ${r.status}`);
  const xml = await r.text();
  const final = new URL(r.url).origin;
  if (!/<sitemapindex/i.test(xml)) return { urls: locs(xml), final };
  const urls: string[] = [];
  for (const sm of locs(xml)) {
    const x = await fetch(sm, { headers: { "User-Agent": "CompareEmpire-coverage" } });
    if (x.ok) urls.push(...locs(await x.text()));
  }
  return { urls, final };
}

async function inspect(tok: string, property: string, url: string) {
  const r = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  });
  if (!r.ok) return { state: `HTTP ${r.status}`, crawled: "" };
  const j = (await r.json()) as { inspectionResult?: { indexStatusResult?: { coverageState?: string; lastCrawlTime?: string } } };
  const s = j.inspectionResult?.indexStatusResult;
  return { state: s?.coverageState ?? "no result", crawled: s?.lastCrawlTime?.slice(0, 10) ?? "" };
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  for (const [property, origin] of SITES) {
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
      tally.set(state, [...(tally.get(state) ?? []), `${u.replace(final, "") || "/"}${crawled ? ` (crawled ${crawled})` : ""}`]);
      await new Promise((res) => setTimeout(res, 150));
    }
    console.log(`\n=== ${final} (${property}): ${urls.length} URLs in the sitemap, ${pick.length} inspected`);
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
