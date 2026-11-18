/**
 * SEARCH CONSOLE LONG-TAIL PAGE-TYPE REPORT — read-only.
 *
 * Which page TEMPLATES (card, set, printing, sealed, hub, guide…) earn Google impressions, per site,
 * and how much of each template's sitemap does. For every domain property GSC_SA_KEY reads
 * (DIAG = comma list to narrow):
 *  - 90 days of page rows, grouped by template (first path segment, market prefix kept, slugs as *):
 *    pages in the sitemap, pages with impressions, share, clicks, impressions, impression-weighted
 *    position, and impressions before / after 10 Nov 2026 (the core update), per day.
 *  - the long-tail intent of each template's searches: share of impressions whose query names
 *    price/cheapest, a country, "list"/"tracker"/"value", or a card number.
 *  - three sample pages per template, fetched live: HTML size, visible text characters, links,
 *    noindex. A template whose pages are mostly navigation is a thin-page risk.
 * Counts, paths and search terms only.
 *
 * Usage: GSC_SA_KEY=... [DIAG=sc-domain:example.com] npx tsx scripts/gsc-pagetypes.ts
 */
import { createSign } from "node:crypto";

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const UPDATE = "2026-11-10";
const MARKETS = new Set(["us", "uk", "au", "ca", "nz", "eu", "sg", "jp", "de", "fr"]);

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

type Row = { keys: string[]; clicks: number; impressions: number; position: number };
let tok = "";
async function q(property: string, start: string, end: string, dimensions: string[], startRow = 0): Promise<Row[]> {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit: 25000, startRow }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  return ((await r.json()) as { rows?: Row[] }).rows ?? [];
}
async function qAll(property: string, start: string, end: string, dimensions: string[], max = 100_000): Promise<Row[]> {
  const out: Row[] = [];
  for (let s = 0; s < max; s += 25000) {
    const rows = await q(property, start, end, dimensions, s);
    out.push(...rows);
    if (rows.length < 25000) break;
  }
  return out;
}

/** Template key of a URL: host-free path, market prefix kept, every later segment a `*`. */
export function template(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "?";
  }
  const seg = u.pathname.split("/").filter(Boolean);
  if (!seg.length) return "/";
  const head: string[] = [];
  let i = 0;
  if (MARKETS.has(seg[0].toLowerCase()) && seg.length > 1) head.push(seg[i++].toLowerCase());
  head.push(seg[i++]);
  // a fixed second word (e.g. /us/type/hobby-boxes, /sealed/booster-box) stays when it is short and slug-free
  if (seg.length > i + 1 && /^[a-z]{2,12}$/.test(seg[i])) head.push(seg[i++]);
  const rest = seg.length - i;
  return `/${head.join("/")}${"/*".repeat(rest)}`;
}

const fetchText = async (url: string, ms = 20000): Promise<string | null> => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CompareEmpireAudit/1.0)" }, signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
};

async function sitemapUrls(host: string): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];
  const queue = [`https://${host}/sitemap.xml`];
  const robots = await fetchText(`https://${host}/robots.txt`);
  for (const m of robots?.matchAll(/^sitemap:\s*(\S+)/gim) ?? []) queue.push(m[1]);
  let n = 0;
  while (queue.length && n < 80) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    n++;
    const xml = await fetchText(sm, 30000);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else urls.push(...locs);
  }
  return [...new Set(urls)];
}

function pageStats(html: string) {
  const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer)[\s\S]*?<\/\1>/gi, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  const links = (html.match(/<a\s/gi) ?? []).length;
  return { kb: Math.round(html.length / 1024), chars: text.length, links, noindex };
}

const INTENT: [string, RegExp][] = [
  ["price", /\b(price|prices|cheapest|cheap|cost|value|worth|deal|sale|buy)\b/],
  ["country", /\b(australia|aus|au|uk|canada|nz|new zealand|usa|us|europe|singapore)\b/],
  ["list/tracker", /\b(list|tracker|checklist|set list|all cards|release)\b/],
  ["number", /\b[a-z]{1,5}\d{0,3}-\d{2,4}\b|\b\d{1,3}\/\d{1,3}\b/],
];

async function report(property: string) {
  const host = property.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const end = Date.now() - 2 * DAY;
  const start = ymd(end - 89 * DAY);
  const pages = await qAll(property, start, ymd(end), ["page", "date"], 200_000);
  if (!pages.length) return console.log(`\n=== ${property}: no search data in 90 days`);
  const pq = await qAll(property, start, ymd(end), ["page", "query"], 100_000);
  const sm = await sitemapUrls(host.startsWith("www.") ? host : host);

  type T = { pages: Set<string>; c: number; i: number; pw: number; pre: number; post: number; intent: Record<string, number>; qi: number; sm: number; best: Map<string, number> };
  const T = new Map<string, T>();
  const get = (k: string) => {
    let t = T.get(k);
    if (!t) T.set(k, (t = { pages: new Set(), c: 0, i: 0, pw: 0, pre: 0, post: 0, intent: {}, qi: 0, sm: 0, best: new Map() }));
    return t;
  };
  const preDays = Math.max(1, (Date.parse(UPDATE) - Date.parse(start)) / DAY);
  const postDays = Math.max(1, (end - Date.parse(UPDATE)) / DAY + 1);
  for (const r of pages) {
    const t = get(template(r.keys[0]));
    t.pages.add(r.keys[0]);
    t.c += r.clicks;
    t.i += r.impressions;
    t.pw += r.position * r.impressions;
    if (r.keys[1] < UPDATE) t.pre += r.impressions;
    else t.post += r.impressions;
    t.best.set(r.keys[0], (t.best.get(r.keys[0]) ?? 0) + r.impressions);
  }
  for (const r of pq) {
    const t = get(template(r.keys[0]));
    t.qi += r.impressions;
    for (const [name, re] of INTENT) if (re.test(r.keys[1].toLowerCase())) t.intent[name] = (t.intent[name] ?? 0) + r.impressions;
  }
  for (const u of sm) get(template(u)).sm++;

  const tot = [...T.values()].reduce((a, t) => a + t.i, 0);
  console.log(`\n=== ${property}  ${start}..${ymd(end)}  sitemap ${sm.length} URLs  impressions ${tot}`);
  console.log(`  ${"template".padEnd(30)} ${"sitemap".padStart(7)} ${"w/impr".padStart(6)} ${"share".padStart(5)} ${"clicks".padStart(6)} ${"impr".padStart(8)} ${"pos".padStart(5)} ${"pre/d".padStart(6)} ${"post/d".padStart(6)}  intent (price/country/list/number % of impr)`);
  const list = [...T.entries()].filter(([, t]) => t.i > 0 || t.sm >= 20).sort((a, b) => b[1].i - a[1].i).slice(0, 18);
  for (const [k, t] of list) {
    const share = t.sm ? `${Math.round((100 * Math.min(t.pages.size, t.sm)) / t.sm)}%` : "-";
    const pct = (n?: number) => (t.qi ? Math.round((100 * (n ?? 0)) / t.qi) : 0);
    console.log(
      `  ${k.slice(0, 30).padEnd(30)} ${String(t.sm).padStart(7)} ${String(t.pages.size).padStart(6)} ${share.padStart(5)} ${String(t.c).padStart(6)} ${String(t.i).padStart(8)} ${(t.i ? t.pw / t.i : 0).toFixed(1).padStart(5)} ${(t.pre / preDays).toFixed(0).padStart(6)} ${(t.post / postDays).toFixed(0).padStart(6)}  ${pct(t.intent.price)}/${pct(t.intent.country)}/${pct(t.intent["list/tracker"])}/${pct(t.intent.number)}`,
    );
  }
  // samples: the top-impression page of the top 8 templates, plus one sitemap page that earned nothing
  console.log(`  -- samples (kb html / visible chars / links / noindex)`);
  for (const [k, t] of list.slice(0, 8)) {
    const top = [...t.best.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const none = sm.find((u) => template(u) === k && !t.pages.has(u));
    for (const [label, u] of [["top", top], ["zero", none]] as const) {
      if (!u) continue;
      const html = await fetchText(u);
      const s = html ? pageStats(html) : null;
      console.log(`    ${k.slice(0, 26).padEnd(26)} ${label.padEnd(4)} ${s ? `${s.kb}kb ${s.chars}ch ${s.links}a${s.noindex ? " NOINDEX" : ""}` : "fetch failed"}  ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 70)}`);
    }
  }
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  tok = await token();
  let props = (process.env.DIAG ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!props.length) {
    const sites = ((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as { siteEntry?: { siteUrl: string }[] }).siteEntry ?? [];
    props = sites.map((s) => s.siteUrl).filter((s) => s.startsWith("sc-domain:")).sort();
  }
  for (const p of props) {
    try {
      await report(p);
    } catch (e) {
      console.log(`== ${p}: unavailable (${(e as Error).message})`);
    }
  }
}

if (process.argv[1]?.endsWith("gsc-pagetypes.ts")) {
  main().catch((e) => {
    console.log(`failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
