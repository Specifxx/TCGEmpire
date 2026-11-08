/**
 * READ-ONLY live health check of every Compare Empire site (maintenance task `live-health`).
 *
 * The dev sandbox cannot reach our own domains, so this runs on a runner. For each site:
 * home page (status, time, bytes, h1, canonical, noindex), the apex/www twin's redirect,
 * robots.txt and its sitemaps, a sample of sitemap pages (status, canonical, noindex, h1),
 * the affiliate links on product pages (eBay campid/customid, Amazon tag, TCGplayer), a few
 * outbound store links, the eBay deletion endpoint, and browser console errors on two pages.
 * Only GETs; prints a report and writes live-health.json. `url` input = comma list of hosts.
 */
import { writeFileSync } from "node:fs";

const SITES: { host: string; canonicalHost: string }[] = [
  { host: "riftcompare.com", canonicalHost: "riftcompare.com" },
  { host: "opcompare.app", canonicalHost: "opcompare.app" },
  { host: "dexcompare.app", canonicalHost: "dexcompare.app" },
  { host: "mtgcompare.app", canonicalHost: "mtgcompare.app" },
  { host: "gundamcompare.com", canonicalHost: "gundamcompare.com" },
  { host: "lorcanacompare.com", canonicalHost: "lorcanacompare.com" },
  { host: "ygocompare.com", canonicalHost: "ygocompare.com" },
  { host: "cyberpunkcompare.com", canonicalHost: "cyberpunkcompare.com" },
  { host: "bandaicompare.com", canonicalHost: "bandaicompare.com" },
  { host: "wargamecompare.com", canonicalHost: "wargamecompare.com" },
  { host: "figurecompare.com", canonicalHost: "figurecompare.com" },
  { host: "kaeyoung.com", canonicalHost: "kaeyoung.com" },
  { host: "scentcompare.app", canonicalHost: "scentcompare.app" },
  { host: "camcompare.app", canonicalHost: "www.camcompare.app" },
  { host: "compareempire.com", canonicalHost: "compareempire.com" },
  { host: "waxcompare.app", canonicalHost: "waxcompare.app" },
];

const UA_MOBILE =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

type Get = { status: number; ms: number; body: string; location?: string | null; headers: Headers | null; error?: string };

async function get(url: string, opts: { manual?: boolean; ua?: string; timeout?: number } = {}): Promise<Get> {
  const t = Date.now();
  try {
    const r = await fetch(url, {
      redirect: opts.manual ? "manual" : "follow",
      headers: { "user-agent": opts.ua ?? UA_MOBILE, accept: "text/html,application/xml,*/*" },
      signal: AbortSignal.timeout(opts.timeout ?? 30000),
    });
    const body = opts.manual ? "" : await r.text();
    return { status: r.status, ms: Date.now() - t, body, location: r.headers.get("location"), headers: r.headers };
  } catch (e) {
    return { status: 0, ms: Date.now() - t, body: "", headers: null, error: String((e as Error).message ?? e).slice(0, 120) };
  }
}

const attr = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const canonicalOf = (h: string) =>
  attr(h, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ?? attr(h, /<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i);
const robotsMetaOf = (h: string) => attr(h, /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i);
const h1Count = (h: string) => (h.match(/<h1[\s>]/gi) ?? []).length;
const titleOf = (h: string) => attr(h, /<title[^>]*>([^<]*)<\/title>/i);
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

type Issue = { site: string; level: "RED" | "WARN" | "INFO"; what: string };
const issues: Issue[] = [];
const report: Record<string, unknown> = {};

function linksIn(html: string) {
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const ebay = hrefs.filter((u) => /ebay\.(com|co\.uk|com\.au|ca|de|fr|it|es|ie|at|ch|nl|com\.sg)/.test(u) && !/ebay\.com\/(help|sch\/i\.html\?.*_ssn)/.test(u));
  const amazon = hrefs.filter((u) => /amazon\.|amzn\.to/.test(u));
  const tcg = hrefs.filter((u) => /tcgplayer\.(com|pxf\.io)|tcgplayer\.pxf|partner\.tcgplayer/.test(u));
  const ebayTagged = ebay.filter((u) => /campid=5339155912/.test(u) && /customid=/.test(u));
  const amazonTagged = amazon.filter((u) => /[?&]tag=/.test(u));
  const tcgTagged = tcg.filter((u) => /pxf\.io|irclickid|partner|utm_|aff/i.test(u));
  return { hrefs, ebay, amazon, tcg, ebayTagged, amazonTagged, tcgTagged };
}

async function checkSite(s: { host: string; canonicalHost: string }) {
  const site = s.host;
  const base = `https://${s.canonicalHost}`;
  const r: Record<string, unknown> = {};
  const add = (level: Issue["level"], what: string) => issues.push({ site, level, what });

  // Home
  const home = await get(base + "/");
  r.home = { status: home.status, ms: home.ms, kb: Math.round(home.body.length / 1024), h1: h1Count(home.body), canonical: canonicalOf(home.body), robots: robotsMetaOf(home.body), title: titleOf(home.body), cache: home.headers?.get("x-vercel-cache") };
  if (home.status !== 200) add("RED", `home ${home.status} ${home.error ?? ""}`);
  else {
    if (/Vercel Security Checkpoint/i.test(home.body)) add("RED", "home serves Vercel Security Checkpoint to crawlers");
    if (h1Count(home.body) !== 1) add("WARN", `home has ${h1Count(home.body)} h1`);
    if (robotsMetaOf(home.body)?.includes("noindex")) add("RED", "home is noindex");
    const c = canonicalOf(home.body);
    if (!c) add("WARN", "home has no canonical");
    else if (!c.startsWith(base)) add("RED", `home canonical points to ${c}`);
    if (home.ms > 2500) add("WARN", `home took ${home.ms} ms`);
    if (home.body.length > 600_000) add("INFO", `home HTML is ${Math.round(home.body.length / 1024)} KB`);
  }

  // Twin host redirect
  const twin = s.canonicalHost.startsWith("www.") ? s.canonicalHost.slice(4) : `www.${s.canonicalHost}`;
  const tw = await get(`https://${twin}/`, { manual: true });
  r.twin = { host: twin, status: tw.status, location: tw.location, error: tw.error };
  if (tw.status === 0) add("WARN", `${twin} does not answer (${tw.error})`);
  else if (![301, 307, 308].includes(tw.status)) add("RED", `${twin} answers ${tw.status}, not a redirect`);
  else if (!tw.location?.startsWith(base)) add("RED", `${twin} redirects to ${tw.location}`);
  const http = await get(`http://${s.canonicalHost}/`, { manual: true });
  if (![301, 307, 308].includes(http.status) || !http.location?.startsWith("https://")) add("WARN", `http:// answers ${http.status} → ${http.location}`);

  // robots + sitemaps
  const robots = await get(base + "/robots.txt");
  const smUrls = [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  r.robots = { status: robots.status, sitemaps: smUrls, disallowAll: /^\s*disallow:\s*\/\s*$/im.test(robots.body.split(/user-agent:\s*\*/i)[1]?.split(/user-agent:/i)[0] ?? "") };
  if (robots.status !== 200) add("RED", `robots.txt ${robots.status}`);
  if (r.robots && (r.robots as { disallowAll: boolean }).disallowAll) add("RED", "robots.txt disallows everything for *");
  if (!smUrls.length) add("WARN", "robots.txt names no sitemap");
  const pageUrls: string[] = [];
  const smReport: unknown[] = [];
  for (const sm of (smUrls.length ? smUrls : [base + "/sitemap.xml"]).slice(0, 3)) {
    const x = await get(sm);
    const l = locs(x.body);
    const isIndex = /<sitemapindex/i.test(x.body);
    smReport.push({ url: sm, status: x.status, isIndex, entries: l.length });
    if (x.status !== 200) { add("RED", `sitemap ${sm} → ${x.status}`); continue; }
    if (!l.length) { add("RED", `sitemap ${sm} has no <loc>`); continue; }
    const offHost = l.filter((u) => !u.startsWith(base));
    if (offHost.length) add("WARN", `sitemap ${sm}: ${offHost.length} URLs off ${base} (e.g. ${offHost[0]})`);
    if (isIndex) {
      // Children: pick up to 4 spread across the index.
      const picks = [...new Set([l[0], l[Math.floor(l.length / 3)], l[Math.floor((2 * l.length) / 3)], l[l.length - 1]])];
      for (const child of picks) {
        const c = await get(child);
        const cl = locs(c.body);
        smReport.push({ url: child, status: c.status, entries: cl.length });
        if (c.status !== 200) add("RED", `child sitemap ${child} → ${c.status}`);
        else if (!cl.length) add("WARN", `child sitemap ${child} is empty`);
        else pageUrls.push(cl[0], cl[Math.floor(cl.length / 2)]);
      }
    } else {
      pageUrls.push(...[l[1], l[Math.floor(l.length / 4)], l[Math.floor(l.length / 2)], l[Math.floor((3 * l.length) / 4)], l[l.length - 1]].filter(Boolean));
    }
  }
  r.sitemaps = smReport;

  // Sample pages
  const sample = [...new Set(pageUrls.filter(Boolean))].slice(0, 8);
  const pages: unknown[] = [];
  let ebayTotal = 0, ebayTagged = 0, amzTotal = 0, amzTagged = 0, tcgTotal = 0, tcgTagged = 0;
  const outbound: string[] = [];
  for (const u of sample) {
    const p = await get(u);
    const can = canonicalOf(p.body);
    const rob = robotsMetaOf(p.body);
    // Engine sites route every buy button through their own /go?u=… redirect (it tags the link server-side and
    // logs nothing), so resolve a few of those per source and check where they land.
    const goLinks = [...p.body.matchAll(/href="(\/go\?[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const bySource = new Map<string, string>();
    for (const g of goLinks) { const src = new URLSearchParams(g.split("?")[1]).get("s") ?? "?"; const k = /^(ebay|amazon|tcgplayer)/.test(src) ? src.replace(/[-_].*/, "") : "store"; if (!bySource.has(k)) bySource.set(k, g); }
    const resolved: string[] = [];
    for (const g of bySource.values()) { const x = await get(base + g, { manual: true }); if (x.location) resolved.push(x.location); }
    const L = linksIn(p.body + resolved.map((u) => ` href="${u.replace(/&/g, "&amp;")}"`).join(""));
    ebayTotal += L.ebay.length; ebayTagged += L.ebayTagged.length;
    amzTotal += L.amazon.length; amzTagged += L.amazonTagged.length;
    tcgTotal += L.tcg.length; tcgTagged += L.tcgTagged.length;
    const stores = L.hrefs.filter((h) => !h.startsWith(base) && !/ebay|amazon|amzn|tcgplayer|google|facebook|twitter|x\.com|instagram|tiktok|reddit|youtube|bsky|discord|threads|github|vercel|schema\.org|w3\.org|fonts\.|cdn|images|\.(png|jpe?g|webp|svg|css|js)(\?|$)/i.test(h));
    if (stores.length) outbound.push(stores[0]);
    pages.push({ url: u, status: p.status, ms: p.ms, kb: Math.round(p.body.length / 1024), h1: h1Count(p.body), canonical: can, robots: rob, ebay: `${L.ebayTagged.length}/${L.ebay.length}`, amazon: `${L.amazonTagged.length}/${L.amazon.length}`, tcg: `${L.tcgTagged.length}/${L.tcg.length}` });
    if (p.status !== 200) add("RED", `sitemap page ${u} → ${p.status}`);
    else {
      if (rob?.includes("noindex")) add("RED", `sitemap page is noindex: ${u}`);
      if (can && can !== u && can.replace(/\/$/, "") !== u.replace(/\/$/, "")) add("WARN", `sitemap page canonical differs: ${u} → ${can}`);
      if (!can) add("WARN", `no canonical: ${u}`);
      if (h1Count(p.body) !== 1) add("WARN", `${h1Count(p.body)} h1 on ${u}`);
      if (p.ms > 3000) add("WARN", `${p.ms} ms for ${u}`);
      const untaggedEbay = L.ebay.filter((x) => !L.ebayTagged.includes(x));
      if (untaggedEbay.length) add("RED", `${untaggedEbay.length} eBay links without campid/customid on ${u} (e.g. ${untaggedEbay[0].slice(0, 160)})`);
      const untaggedAmz = L.amazon.filter((x) => !L.amazonTagged.includes(x));
      if (untaggedAmz.length) add("RED", `${untaggedAmz.length} Amazon links without tag= on ${u} (e.g. ${untaggedAmz[0].slice(0, 160)})`);
    }
  }
  r.pages = pages;
  r.affiliate = { ebay: `${ebayTagged}/${ebayTotal}`, amazon: `${amzTagged}/${amzTotal}`, tcgplayer: `${tcgTagged}/${tcgTotal}` };
  if (sample.length && ebayTotal === 0) add("INFO", "no eBay links in the sampled pages (may be hub pages or client-drawn)");
  if (sample.length && amzTotal === 0) add("INFO", "no Amazon links in the sampled pages");

  // Outbound store links (first one per page, up to 4)
  const outs: unknown[] = [];
  for (const o of outbound.slice(0, 4)) {
    const x = await get(o, { ua: UA_BROWSER, timeout: 20000 });
    outs.push({ url: o.slice(0, 160), status: x.status, error: x.error });
    if (x.status === 404 || x.status === 410 || (x.status >= 500) || x.status === 0) add("WARN", `outbound link ${x.status || x.error}: ${o.slice(0, 160)}`);
  }
  r.outbound = outs;

  // eBay deletion endpoint
  const del = await get(base + "/api/ebay/marketplace-deletion?challenge_code=healthcheck");
  const del2 = del.status === 404 ? await get(base + "/api/ebay/account-deletion?challenge_code=healthcheck") : null;
  const d = del2 ?? del;
  r.ebayDeletion = { path: del2 ? "account-deletion" : "marketplace-deletion", status: d.status, body: d.body.slice(0, 120) };
  if (d.status === 200 && !/challengeResponse/.test(d.body)) add("WARN", `eBay deletion endpoint 200 without challengeResponse`);
  else if (d.status !== 200) add("INFO", `eBay deletion endpoint → ${d.status} ${d.body.slice(0, 80)}`);

  return { r, sample };
}

async function consoleErrors(urls: { site: string; url: string }[]) {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("playwright unavailable; console check skipped");
    return;
  }
  const browser = await chromium.launch();
  for (const { site, url } of urls) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA_BROWSER.replace("Windows NT 10.0; Win64; x64", "Linux; Android 14; Pixel 8") + " Mobile" });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 200)));
    const failed: string[] = [];
    page.on("response", (res) => {
      const u = res.url();
      if (res.status() >= 400 && new URL(u).host.endsWith(new URL(url).host.replace(/^www\./, ""))) failed.push(`${res.status()} ${u.slice(0, 140)}`);
    });
    try {
      const t = Date.now();
      await page.goto(url, { waitUntil: "load", timeout: 45000 });
      await page.waitForTimeout(2500);
      const lcpish = Date.now() - t;
      const filtered = errs.filter((e) => !/googletagmanager|google-analytics|doubleclick|adsbygoogle|Failed to load resource: net::ERR_BLOCKED/i.test(e));
      console.log(`[console] ${site} ${url} load=${lcpish}ms errors=${filtered.length} failedSameSite=${failed.length}`);
      for (const e of filtered.slice(0, 5)) console.log("   ", e);
      for (const f of failed.slice(0, 5)) console.log("    resp", f);
      if (filtered.length) issues.push({ site, level: "WARN", what: `${filtered.length} console errors on ${url}: ${filtered[0]}` });
      if (failed.length) issues.push({ site, level: "WARN", what: `${failed.length} own-site requests failed on ${url}: ${failed[0]}` });
      if (lcpish > 8000) issues.push({ site, level: "WARN", what: `mobile load ${lcpish} ms on ${url}` });
    } catch (e) {
      issues.push({ site, level: "WARN", what: `browser could not load ${url}: ${String((e as Error).message).slice(0, 120)}` });
    }
    await ctx.close();
  }
  await browser.close();
}

async function main() {
  const only = (process.env.LIVE_HEALTH_SITES ?? process.argv[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const sites = only.length ? SITES.filter((s) => only.includes(s.host)) : SITES;
  const results = await Promise.all(sites.map(async (s) => ({ s, out: await checkSite(s).catch((e) => ({ r: { error: String(e) }, sample: [] as string[] })) })));
  const browse: { site: string; url: string }[] = [];
  for (const { s, out } of results) {
    report[s.host] = out.r;
    browse.push({ site: s.host, url: `https://${s.canonicalHost}/` });
    if (out.sample[0]) browse.push({ site: s.host, url: out.sample[out.sample.length > 2 ? 2 : 0] });
  }
  await consoleErrors(browse);
  for (const [host, r] of Object.entries(report)) {
    console.log(`\n===== ${host}`);
    console.log(JSON.stringify(r, null, 1));
  }
  console.log("\n===== ISSUES");
  for (const lvl of ["RED", "WARN", "INFO"] as const) for (const i of issues.filter((x) => x.level === lvl)) console.log(`${lvl.padEnd(4)} ${i.site.padEnd(22)} ${i.what}`);
  writeFileSync("live-health.json", JSON.stringify({ at: new Date().toISOString(), report, issues }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
