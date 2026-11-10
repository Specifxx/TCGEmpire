// WEEKLY AFFILIATE GAP AUDIT FOR EVERY COMPARE SITE — read-only.
//
// 2026-11-08 (owner: "make sure all of our websites are making money … let me know if there are
// any gaps"). Reads each live site the way a visitor does (home page plus up to PAGES product
// pages, server HTML only), follows each site's own /go redirect without leaving it, and sorts
// every outbound link with src/lib/affiliate-gaps.ts:
//
//   tracked   eBay (our EPN campaign), Amazon (a tag), TCGplayer (Impact), Awin, another network
//   BROKEN    an eBay/Amazon/TCGplayer link without our tag, or a store we joined on Awin linked
//             without its Awin deep link: the run fails red, so the ops monitor shows it
//   gaps      untracked links to a store whose programme we know (the next application)
//
// The table goes to the job summary and gaps.json to the run's artifact; the weekly check-in
// reads both. Nothing is written anywhere else. Polite: one request at a time per site.
//
// Usage: npx tsx scripts/affiliate-gap-audit.ts   (SITES=kaeyoung.com,… to narrow, PAGES=6)
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { addLink, emptyTally, hostOf, trackedShare, type SiteTally } from "../src/lib/affiliate-gaps";

const ALL = [
  "https://riftcompare.com",
  "https://opcompare.app",
  "https://dexcompare.app",
  "https://mtgcompare.app",
  "https://gundamcompare.com",
  "https://lorcanacompare.com",
  "https://ygocompare.com",
  "https://cyberpunkcompare.com",
  "https://bandaicompare.com",
  "https://compareempire.com",
  "https://www.camcompare.app",
  "https://wargamecompare.com",
  "https://figurecompare.com",
  "https://kaeyoung.com",
  "https://scentcompare.app",
  "https://sportscardcompare.com",
  "https://motorcompare.app",
];
const pick = (process.env.SITES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SITES = pick.length ? ALL.filter((o) => pick.some((p) => o.includes(p))) : ALL;
const PAGES = Number(process.env.PAGES ?? 6);
const GO_LIMIT = Number(process.env.GO_LIMIT ?? 60);
const UA = "Mozilla/5.0 (compatible; CompareEmpireAffiliateAudit/1.0; +https://compareempire.com)";
const PRODUCT = /^\/(?:[a-z]{2}\/)?(card|sealed|product|p|figure|camera|cameras|lens|lenses|phones|laptops|tvs)\/[^/]+\/?$/;
const FALLBACK = /^\/(?:[a-z]{2}\/)?[a-z-]+\/[a-z0-9-]{14,}\/?$/;
const GO = /^\/(go|out|api\/go|api\/out)(\/|$)/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function html(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${r.status} on ${url}`);
  return r.text();
}

function hrefs(page: string, base: string): URL[] {
  const out: URL[] = [];
  for (const m of page.matchAll(/<a\b[^>]*?\shref="([^"]+)"/gi)) {
    try {
      out.push(new URL(m[1]!.replace(/&amp;/g, "&"), base));
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/** Where a site's own /go link sends a visitor: one hop, never followed off the site. */
async function resolveGo(u: URL): Promise<string | null> {
  try {
    const r = await fetch(u, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
    const loc = r.headers.get("location");
    return loc ? new URL(loc, u).toString() : null;
  } catch {
    return null;
  }
}

async function joinedAwinDomains(): Promise<string[]> {
  try {
    const r = await fetch("https://raw.githubusercontent.com/Specifxx/compareempiretake2/HEAD/data/awin/programmes.json", { headers: { "user-agent": UA } });
    const j = (await r.json()) as { joined?: Array<{ domains?: string[] }> };
    return (j.joined ?? []).flatMap((p) => p.domains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""));
  } catch {
    return [];
  }
}

async function auditSite(origin: string, joined: string[]): Promise<SiteTally> {
  const t = emptyTally(hostOf(origin));
  try {
    const home = await html(origin);
    const base = new URL(origin);
    const internal = hrefs(home, origin).filter((u) => u.hostname === base.hostname || u.hostname === `www.${base.hostname}` || `www.${u.hostname}` === base.hostname);
    let products = [...new Set(internal.filter((u) => PRODUCT.test(u.pathname)).map((u) => u.pathname))];
    if (products.length < 3) products = [...new Set([...products, ...internal.filter((u) => FALLBACK.test(u.pathname)).map((u) => u.pathname)])];
    const pages: Array<[string, string]> = [[origin, home]];
    for (const p of products.slice(0, PAGES)) {
      await sleep(500);
      try {
        pages.push([new URL(p, origin).toString(), await html(new URL(p, origin).toString())]);
      } catch {
        /* one missing page is not the audit's business (the crawl audit covers it) */
      }
    }
    t.pages = pages.length;
    let goSeen = 0;
    for (const [url, body] of pages) {
      for (const u of hrefs(body, url)) {
        const local = u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
        if (!local) {
          addLink(t, u.toString(), joined);
          continue;
        }
        if (!GO.test(u.pathname) || goSeen >= GO_LIMIT) continue;
        goSeen++;
        await sleep(150);
        const dest = await resolveGo(u);
        if (dest) addLink(t, dest, joined);
      }
    }
  } catch (e) {
    t.error = e instanceof Error ? e.message : String(e);
  }
  return t;
}

function summary(results: SiteTally[]): string {
  const lines = [
    "## Affiliate gap audit",
    "",
    "| Site | Pages | Tracked share | eBay | Amazon | TCGplayer | Awin | Other networks | Untracked store links | Broken | Programme gaps |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const t of results) {
    if (t.error) {
      lines.push(`| ${t.site} | – | – | – | – | – | – | – | – | – | could not read: ${t.error} |`);
      continue;
    }
    const gaps = Object.entries(t.programmeGaps).sort((a, b) => b[1].links - a[1].links).map(([h, g]) => `${h} (${g.network}, ${g.links})`).join(", ");
    lines.push(`| ${t.site} | ${t.pages} | ${trackedShare(t)}% | ${t.tracked.ebay} | ${t.tracked.amazon} | ${t.tracked.tcgplayer} | ${t.tracked.awin} | ${t.tracked.network} | ${t.storeLinks} | ${t.broken.length ? `**${t.broken.length}**` : 0} | ${gaps || "–"} |`);
  }
  const broken = results.flatMap((t) => t.broken.map((b) => `- **${t.site}** ${b.kind}: ${b.url}`));
  if (broken.length) lines.push("", "### Broken (money we are owed and lose)", "", ...broken);
  lines.push("", "### Most-linked untracked stores per site", "");
  for (const t of results) {
    const top = Object.entries(t.storeHosts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => `${h} ${n}`).join(", ");
    if (top) lines.push(`- **${t.site}**: ${top}`);
  }
  return lines.join("\n");
}

async function main() {
  const joined = await joinedAwinDomains();
  console.log(`Awin joined domains: ${joined.join(", ") || "(none read)"}`);
  const results: SiteTally[] = [];
  for (const origin of SITES) {
    const t = await auditSite(origin, joined);
    console.log(`${t.site}: ${t.error ?? `${t.pages} pages, ${trackedShare(t)}% tracked, ${t.broken.length} broken`}`);
    results.push(t);
  }
  const md = summary(results);
  console.log(`\n${md}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/affiliate-gaps.json", JSON.stringify({ checkedAt: new Date().toISOString(), awinJoined: joined, results }, null, 2));
  if (results.some((t) => t.broken.length)) {
    console.error("Broken affiliate links found (see the table).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
