/**
 * scripts/seo-audit.ts: Lighthouse SEO category (mobile) for one live site, on the home page and one indexable page
 * from each of the sitemap's biggest path groups (product, listing, guide…). Read-only.
 *
 *   CHROME_PATH=… npx tsx scripts/seo-audit.ts https://riftcompare.com
 *
 * Prints one line per page (score and the failing audits with their first offending items) and, last, a line
 * `SEOJSON {…}` with the same data, so a run's log is enough to read the results. Run by seo-audit.yml.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = (process.argv[2] ?? "").replace(/\/$/, "");
if (!origin) throw new Error("usage: seo-audit.ts <origin>");
const UA = "Mozilla/5.0 (compatible; SeoAuditBot/1.0)";

async function get(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function sitemapUrls(): Promise<string[]> {
  const out: string[] = [];
  const queue = [`${origin}/sitemap.xml`];
  const seen = new Set<string>();
  while (queue.length && out.length < 20000 && seen.size < 8) {
    const u = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    let xml = "";
    try {
      xml = await get(u);
    } catch {
      continue;
    }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    if (/<sitemapindex/i.test(xml)) queue.push(...locs.slice(0, 6));
    else out.push(...locs);
  }
  return out;
}

function pickPages(urls: string[]): string[] {
  const host = new URL(origin).host.replace(/^www\./, "");
  const groups = new Map<string, string[]>();
  for (const u of urls) {
    let p: URL;
    try {
      p = new URL(u);
    } catch {
      continue;
    }
    if (p.host.replace(/^www\./, "") !== host || p.search) continue;
    const seg = p.pathname.split("/").filter(Boolean);
    if (!seg.length) continue;
    // a regional prefix (/uk, /au…) is not a page type
    const key = /^(uk|au|eu|sg|ca|nz|us)$/.test(seg[0]) && seg[1] ? `${seg[0]}/${seg[1]}` : seg[0];
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p.toString());
  }
  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  return ranked.map(([, list]) => list[Math.floor(list.length / 3)]);
}

interface Fail {
  id: string;
  title: string;
  score: number | null;
  items: string[];
}

function lighthouse(url: string): { score: number; fails: Fail[] } {
  const dir = mkdtempSync(join(tmpdir(), "seo-audit-"));
  const out = join(dir, "r.json");
  execFileSync(
    "npx",
    [
      "--no-install",
      "lighthouse",
      url,
      "--form-factor=mobile",
      "--screenEmulation.mobile=true",
      "--screenEmulation.width=390",
      "--screenEmulation.height=844",
      "--screenEmulation.deviceScaleFactor=2",
      "--only-categories=seo",
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--quiet",
      "--output=json",
      `--output-path=${out}`,
    ],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 180_000 },
  );
  const lhr = JSON.parse(readFileSync(out, "utf8"));
  const cat = lhr.categories.seo;
  const fails: Fail[] = [];
  for (const ref of cat.auditRefs) {
    const a = lhr.audits[ref.id];
    if (!a || a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "manual" || a.scoreDisplayMode === "informative") continue;
    if (a.score === 1) continue;
    const items = (a.details?.items ?? []).slice(0, 4).map((i: any) => {
      const bits = [i.node?.snippet, i.source?.snippet, i.url, i.link?.text, i.text, i.reason, i.href, i.statistic]
        .filter(Boolean)
        .map((s: unknown) => String(s).replace(/\s+/g, " ").slice(0, 140));
      return bits.join(" | ");
    });
    fails.push({ id: ref.id, title: a.title, score: a.score, items: items.filter(Boolean) });
  }
  return { score: Math.round(cat.score * 100), fails };
}

(async () => {
  let urls: string[] = [];
  try {
    urls = await sitemapUrls();
  } catch (e) {
    console.log("sitemap failed", String(e));
  }
  const pages = [`${origin}/`, ...pickPages(urls)];
  const results: any[] = [];
  for (const url of pages) {
    try {
      const r = lighthouse(url);
      results.push({ url, ...r });
      console.log(`${r.score}  ${url}`);
      for (const f of r.fails) console.log(`     FAIL ${f.id}: ${f.title}${f.items.length ? "  <- " + f.items.join(" ;; ") : ""}`);
    } catch (e) {
      results.push({ url, score: null, error: String(e).slice(0, 200) });
      console.log(`ERR  ${url} ${String(e).slice(0, 200)}`);
    }
  }
  console.log("SEOJSON " + JSON.stringify({ origin, sitemapUrls: urls.length, results }));
})();
