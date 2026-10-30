/**
 * CRAWLABILITY AUDIT FOR EVERY COMPARE SITE — read-only.
 *
 * Google indexes with a smartphone crawler and spends little on a small site, so this
 * reads each site the way that crawler does (Googlebot smartphone user agent, no
 * JavaScript, one redirect at a time) and reports what would cost us pages:
 *
 *   robots.txt     what is disallowed, which sitemaps it names
 *   sitemap        URL count, URLs on another host, duplicates
 *   sample pages   status, redirect hops, HTML size, time, canonical, noindex, one h1,
 *                  visible text and a price in the SERVER html (not only after JS)
 *   crawl          breadth-first from the homepage (CRAWL pages): depth reached, broken
 *                  internal links, indexable pages missing from the sitemap, sitemap URLs
 *                  the crawl never linked to
 *   Search Console sitemaps submitted (and when Google last read them), pages with
 *                  impressions in 28 days, and URL Inspection of the sample
 *
 * Usage: GSC_SA_KEY=... SITES=riftcompare.com,opcompare.app npx tsx scripts/crawl-audit-sites.ts
 */
import { createSign } from "node:crypto";

const ALL = [
  "https://riftcompare.com",
  "https://opcompare.app",
  "https://mtgcompare.app",
  "https://dexcompare.app",
  "https://gundamcompare.com",
  "https://lorcanacompare.com",
  "https://ygocompare.com",
  "https://www.camcompare.app",
  "https://compareempire.com",
  "https://wargamecompare.com",
  "https://figurecompare.com",
  "https://kaeyoung.com",
];
const pick = (process.env.SITES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SITES = pick.length ? ALL.filter((o) => pick.some((p) => o.includes(p))) : ALL;
const SAMPLE = Number(process.env.SAMPLE ?? 25);
const CRAWL = Number(process.env.CRAWL ?? 250);
const UA =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (u: string) => {
  const x = new URL(u);
  return `${x.origin}${x.pathname.replace(/\/+$/, "") || "/"}`;
};
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

async function get(url: string, timeout = 30_000) {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,application/xml" }, signal: AbortSignal.timeout(timeout) });
  const body = await r.text();
  return { r, body, ms: Date.now() - t0 };
}

async function follow(url: string) {
  let cur = url;
  for (let hops = 0; hops < 6; hops++) {
    const res = await get(cur);
    const loc = res.r.headers.get("location");
    if (res.r.status >= 300 && res.r.status < 400 && loc) {
      cur = new URL(loc, cur).toString();
      continue;
    }
    return { ...res, final: cur, hops };
  }
  throw new Error("redirect loop");
}

type Page = {
  url: string; status: number; hops: number; final: string; ms: number; kb: number; cache: string;
  canonical: string | null; noindex: boolean; h1: number; text: number; price: boolean; bailout: boolean; links: string[];
};

function readPage(url: string, res: Awaited<ReturnType<typeof follow>>, origin: string): Page {
  const html = res.body;
  const text = html
    .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(header|footer|nav)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const host = new URL(origin).host;
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)"[^>]*>/gi)) {
    if (/\brel="[^"]*nofollow/i.test(m[0])) continue;
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), res.final);
      if (u.host !== host || u.search || /\.(xml|txt|json|png|jpe?g|webp|svg|ico|pdf)$/i.test(u.pathname) || u.pathname.startsWith("/api/") || u.pathname.startsWith("/_next/")) continue;
      links.add(norm(u.toString()));
    } catch {
      /* not a URL */
    }
  }
  const robotsMeta = /<meta[^>]+name="(robots|googlebot)"[^>]+content="([^"]*)"/i.exec(html)?.[2] ?? "";
  return {
    url, status: res.r.status, hops: res.hops, final: res.final, ms: res.ms, kb: Math.round(html.length / 1024),
    cache: res.r.headers.get("x-vercel-cache") ?? "-",
    canonical: /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(html)?.[1] ?? null,
    noindex: /noindex/i.test(robotsMeta) || /noindex/i.test(res.r.headers.get("x-robots-tag") ?? ""),
    h1: (html.match(/<h1[\s>]/gi) ?? []).length,
    text: text.trim().length,
    price: /(?:US\$|A\$|NZ\$|C\$|CA\$|S\$|SG\$|[$£€])\s?\d[\d,]*(?:\.\d\d)?|\d[\d.,]*\s?(?:€|kr)/.test(text),
    bailout: html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING"),
    links: [...links],
  };
}

async function sitemap(origin: string, named: string[]) {
  const roots = named.length ? named : [`${origin}/sitemap.xml`];
  const urls: string[] = [];
  const notes: string[] = [];
  const queue = [...roots];
  const seen = new Set<string>();
  while (queue.length && seen.size < 60) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { r, body, final } = await follow(sm);
      if (r.status !== 200) {
        notes.push(`${sm} -> ${r.status}`);
        continue;
      }
      if (final !== sm) notes.push(`${sm} redirects to ${final}`);
      if (/<sitemapindex/i.test(body)) queue.push(...locs(body));
      else urls.push(...locs(body));
    } catch (e) {
      notes.push(`${sm}: ${(e as Error).message}`);
    }
  }
  return { urls, notes, files: seen.size };
}

async function token(): Promise<string | null> {
  if (!process.env.GSC_SA_KEY) return null;
  const sa = JSON.parse(process.env.GSC_SA_KEY) as { client_email: string; private_key: string };
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
  return ((await r.json()) as { access_token?: string }).access_token ?? null;
}

async function gsc<T>(tok: string, path: string, body?: unknown): Promise<T | null> {
  const r = await fetch(`https://searchconsole.googleapis.com${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()) as T;
}

async function audit(origin: string, tok: string | null, properties: string[]) {
  const host = new URL(origin).host;
  console.log(`\n\n################ ${origin}`);

  // robots.txt
  let named: string[] = [];
  try {
    const { r, body, final } = await follow(`${origin}/robots.txt`);
    console.log(`robots.txt ${r.status}${final !== `${origin}/robots.txt` ? ` (via ${final})` : ""}`);
    named = [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const rules = body.split("\n").map((l) => l.trim()).filter((l) => /^(user-agent|disallow|allow|crawl-delay)/i.test(l));
    console.log(`  ${rules.slice(0, 40).join("\n  ")}${rules.length > 40 ? `\n  … ${rules.length - 40} more` : ""}`);
    console.log(`  sitemaps named: ${named.join(", ") || "NONE"}`);
  } catch (e) {
    console.log(`robots.txt unreadable: ${(e as Error).message}`);
  }

  // sitemap
  const sm = await sitemap(origin, named);
  const inMap = new Set(sm.urls.map((u) => { try { return norm(u); } catch { return u; } }));
  const offHost = sm.urls.filter((u) => { try { return new URL(u).host !== host; } catch { return true; } });
  console.log(`sitemap: ${sm.urls.length} URLs in ${sm.files} file(s), ${inMap.size} distinct, ${offHost.length} on another host${offHost.length ? ` (e.g. ${offHost[0]})` : ""}`);
  for (const n of sm.notes.slice(0, 8)) console.log(`  ! ${n}`);

  // sample
  const step = Math.max(1, Math.floor(sm.urls.length / SAMPLE));
  const sample = [...new Set([`${origin}/`, ...sm.urls.filter((_, i) => i % step === 0).slice(0, SAMPLE)])];
  const pages: Page[] = [];
  for (const u of sample) {
    try {
      pages.push(readPage(u, await follow(u), origin));
    } catch (e) {
      console.log(`  ✗ ${u}: ${(e as Error).message}`);
    }
    await sleep(150);
  }
  console.log(`sample of ${pages.length}: status | hops | ms | KB | cache | canonical | noindex | h1 | text | price | path`);
  for (const p of pages) {
    const can = p.canonical ? (norm(new URL(p.canonical, p.final).toString()) === norm(p.final) ? "self" : `-> ${p.canonical}`) : "NONE";
    console.log(`  ${p.status} | ${p.hops} | ${p.ms} | ${p.kb} | ${p.cache} | ${can} | ${p.noindex ? "NOINDEX" : "-"} | ${p.h1} | ${p.text} | ${p.price ? "$" : "no $"}${p.bailout ? " | CSR BAILOUT" : ""} | ${p.url.replace(origin, "") || "/"}`);
  }
  const ms = pages.map((p) => p.ms).sort((a, b) => a - b);
  const kb = pages.map((p) => p.kb).sort((a, b) => a - b);
  console.log(`  median ${ms[ms.length >> 1]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms; median ${kb[kb.length >> 1]} KB, max ${kb[kb.length - 1]} KB; ${pages.filter((p) => !p.price).length} without a price in server HTML; ${pages.filter((p) => p.noindex).length} noindex; ${pages.filter((p) => p.status !== 200).length} not 200`);

  // crawl
  const depth = new Map<string, number>([[norm(`${origin}/`), 0]]);
  const inbound = new Map<string, number>();
  const crawled = new Map<string, Page>();
  const broken: string[] = [];
  let frontier = [norm(`${origin}/`)];
  while (frontier.length && crawled.size < CRAWL) {
    const batch = frontier.splice(0, 4);
    const got = await Promise.all(batch.map(async (u) => {
      try {
        return readPage(u, await follow(u), origin);
      } catch {
        return null;
      }
    }));
    for (const p of got) {
      if (!p) continue;
      crawled.set(p.url, p);
      if (p.status >= 400) broken.push(`${p.url.replace(origin, "")} (${p.status})`);
      const d = depth.get(p.url) ?? 0;
      for (const l of p.links) {
        inbound.set(l, (inbound.get(l) ?? 0) + 1);
        if (!depth.has(l)) {
          depth.set(l, d + 1);
          frontier.push(l);
        }
      }
    }
    frontier.sort((a, b) => depth.get(a)! - depth.get(b)!);
    await sleep(100);
  }
  const byDepth = new Map<number, number>();
  for (const u of depth.keys()) byDepth.set(depth.get(u)!, (byDepth.get(depth.get(u)!) ?? 0) + 1);
  const linked = [...depth.keys()];
  const notInMap = [...crawled.values()].filter((p) => p.status === 200 && !p.noindex && norm(p.final) === p.url && !inMap.has(p.url) && !(p.canonical && norm(new URL(p.canonical, p.final).toString()) !== p.url));
  const mapNotLinked = [...inMap].filter((u) => !depth.has(u));
  const linkedNoindex = [...crawled.values()].filter((p) => p.noindex);
  console.log(`crawl: ${crawled.size} pages fetched, ${linked.length} distinct internal links discovered; URLs by click depth: ${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `d${d}=${n}`).join(" ")}`);
  console.log(`  homepage links to ${crawled.get(norm(`${origin}/`))?.links.length ?? 0} internal pages`);
  console.log(`  broken: ${broken.length}${broken.length ? ` e.g. ${broken.slice(0, 6).join(", ")}` : ""}`);
  console.log(`  indexable but NOT in sitemap: ${notInMap.length}${notInMap.length ? ` e.g. ${notInMap.slice(0, 8).map((p) => p.url.replace(origin, "")).join(", ")}` : ""}`);
  console.log(`  linked but noindex: ${linkedNoindex.length}${linkedNoindex.length ? ` e.g. ${linkedNoindex.slice(0, 6).map((p) => p.url.replace(origin, "")).join(", ")}` : ""}`);
  console.log(`  sitemap URLs not among the ${linked.length} links found so far: ${mapNotLinked.length} of ${inMap.size}${mapNotLinked.length ? ` e.g. ${mapNotLinked.slice(0, 5).map((u) => u.replace(origin, "")).join(", ")}` : ""}`);

  // Search Console
  if (!tok) return;
  const bare = host.replace(/^www\./, "");
  const props = properties.filter((p) => p === `sc-domain:${bare}` || p.includes(`//${host}/`) || p.includes(`//${bare}/`) || p.includes(`//www.${bare}/`));
  if (!props.length) return console.log(`Search Console: no property readable for ${host}`);
  for (const prop of props) {
    const enc = encodeURIComponent(prop);
    const maps = await gsc<{ sitemap?: { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { submitted?: string }[] }[] }>(tok, `/webmasters/v3/sites/${enc}/sitemaps`);
    console.log(`Search Console ${prop}: sitemaps ${maps?.sitemap?.length ?? 0}`);
    for (const s of maps?.sitemap ?? []) {
      console.log(`  ${s.path} submitted ${s.lastSubmitted?.slice(0, 10) ?? "-"} read ${s.lastDownloaded?.slice(0, 10) ?? "never"}${s.isPending ? " PENDING" : ""} errors ${s.errors ?? 0} warnings ${s.warnings ?? 0} urls ${s.contents?.map((c) => c.submitted).join("/") ?? "-"}`);
    }
    const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const sa = await gsc<{ rows?: { keys: string[]; clicks: number; impressions: number }[] }>(tok, `/webmasters/v3/sites/${enc}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ["page"], rowLimit: 25000 });
    const rows = sa?.rows ?? [];
    console.log(`  pages with impressions ${start}..${end}: ${rows.length}, clicks ${rows.reduce((a, r) => a + r.clicks, 0)}, impressions ${rows.reduce((a, r) => a + r.impressions, 0)}`);
  }
  const prop = props.find((p) => p.startsWith("sc-domain:")) ?? props[0];
  const tally = new Map<string, string[]>();
  for (const p of pages) {
    const j = await gsc<{ inspectionResult?: { indexStatusResult?: { coverageState?: string; googleCanonical?: string; crawledAs?: string } } }>(tok, "/v1/urlInspection/index:inspect", { inspectionUrl: p.final, siteUrl: prop });
    const s = j?.inspectionResult?.indexStatusResult;
    const k = s?.coverageState ?? "no answer";
    const extra = s?.googleCanonical && norm(s.googleCanonical) !== norm(p.final) ? ` (Google canonical ${s.googleCanonical})` : "";
    tally.set(k, [...(tally.get(k) ?? []), `${p.final.replace(origin, "") || "/"}${extra}`]);
    await sleep(150);
  }
  console.log(`  URL Inspection of the sample:`);
  for (const [k, us] of [...tally].sort((a, b) => b[1].length - a[1].length)) console.log(`    ${String(us.length).padStart(3)} ${k}: ${us.slice(0, 5).join(", ")}`);
}

async function main() {
  const tok = await token().catch(() => null);
  const list = tok ? await gsc<{ siteEntry?: { siteUrl: string }[] }>(tok, "/webmasters/v3/sites") : null;
  const properties = list?.siteEntry?.map((s) => s.siteUrl) ?? [];
  console.log(`Search Console properties readable: ${properties.length ? properties.join(", ") : "none"}`);
  for (const o of SITES) {
    try {
      await audit(o, tok, properties);
    } catch (e) {
      console.log(`\n${o}: audit failed: ${(e as Error).message}`);
    }
  }
}

void main();
