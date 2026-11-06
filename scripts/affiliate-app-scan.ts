// Which of the stores we compare run a SELF-SERVE affiliate programme?
//
// 2026-11-06 (owner: "stop depending on one earner"). Outside the US every best-price button
// on every Compare site goes to an independent Shopify or WooCommerce store, and none of
// them pays us: the only income is eBay's flat 3%. Many such stores run an affiliate app
// (GoAffPro, UpPromote, Refersion, Shopify Collabs, Affiliatly, Social Snowball, LeadDyno…)
// with a public sign-up page nobody has to be emailed about. This finds them.
//
// It reads data/affiliate-scan/hosts.json (every store host across the TCG sites and
// WargameCompare, compiled from each repo's store list on 2026-11-06) and makes AT MOST
// four polite requests per host: the home page, then /pages/affiliate, /pages/affiliates
// and /pages/affiliate-program. A 403, 429 or challenge page is a result, never worked
// around. It prints a markdown table (the Actions job summary) and writes results.json
// beside the hosts file. It never writes to the database and runs only by hand
// (.github/workflows/affiliate-app-scan.yml).
//
// Once a store is signed up, its commission parameter goes in STORE_PARTNER_DEALS
// (src/lib/store-partner-deals.ts) here, and the equivalent list on the sister site.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface HostEntry { host: string; sites: string[] }
interface Result {
  host: string;
  sites: string[];
  status: "signal" | "page" | "none" | "blocked" | "error";
  app?: string;
  signupUrl?: string;
  note?: string;
}

const APPS: Array<[string, RegExp]> = [
  ["GoAffPro", /goaffpro\.com|\/apps\/goaffpro/i],
  ["UpPromote", /uppromote\.com|secomapp\.com\/affiliate|\/apps\/uppromote/i],
  ["Refersion", /refersion\.com/i],
  ["Shopify Collabs", /collabs\.shopify\.com|shopify-collabs|\/collabs\/?/i],
  ["Affiliatly", /affiliatly\.com/i],
  ["Social Snowball", /socialsnowball\.io/i],
  ["LeadDyno", /leaddyno\.com/i],
  ["Tapfiliate", /tapfiliate\.com/i],
  ["BixGrow", /bixgrow\.com/i],
  ["Rakuten", /linksynergy\.com|rakutenadvertising/i],
  ["Impact", /impact\.com\/|impactradius/i],
  ["Awin / ShareASale", /awin1\.com|shareasale\.com/i],
  ["CJ", /cj\.com|dpbolvw|anrdoezrs/i],
  ["Commission Factory", /commissionfactory\.com/i],
  ["Partnerize", /partnerize\.com|prf\.hn/i],
  ["FlexOffers", /flexoffers\.com/i],
];
const BLOCK = /cf-browser-verification|challenge-platform|just a moment|access denied|captcha|incapsula|_Incapsula_Resource|perimeterx|px-captcha|datadome/i;
const AFFILIATE_LINK = /href="([^"]*affiliat[^"]*)"/i;
const PAGES = ["/pages/affiliate", "/pages/affiliates", "/pages/affiliate-program"];
const UA = "Mozilla/5.0 (compatible; RiftCompare affiliate-programme check; +https://riftcompare.com/stores)";
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || 6);
const LIMIT = Number(process.env.SCAN_LIMIT || 0);

async function get(url: string): Promise<{ status: number; text: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: ctl.signal });
    const text = res.ok || res.status === 403 || res.status === 429 ? (await res.text()).slice(0, 600_000) : "";
    return { status: res.status, text };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function detect(text: string): string | undefined {
  for (const [name, re] of APPS) if (re.test(text)) return name;
  return undefined;
}

async function scan(e: HostEntry): Promise<Result> {
  const base = `https://${e.host}`;
  const home = await get(base);
  if (!home) return { host: e.host, sites: e.sites, status: "error", note: "unreachable" };
  if (home.status === 403 || home.status === 429 || BLOCK.test(home.text)) {
    return { host: e.host, sites: e.sites, status: "blocked", note: `home ${home.status}` };
  }
  if (home.status >= 400) return { host: e.host, sites: e.sites, status: "error", note: `home ${home.status}` };
  const app = detect(home.text);
  const link = home.text.match(AFFILIATE_LINK)?.[1];
  const linkUrl = link ? new URL(link, base).toString() : undefined;
  const candidates = linkUrl && !/mailto:/i.test(linkUrl) ? [linkUrl, ...PAGES.map((p) => base + p)] : PAGES.map((p) => base + p);
  for (const url of candidates.slice(0, 4)) {
    const page = await get(url);
    if (!page || page.status !== 200) continue;
    // Shopify answers a missing page with its 404 template at status 404, so a 200 here is a real page.
    if (!/affiliat/i.test(page.text)) continue;
    const pageApp = detect(page.text) ?? app;
    return { host: e.host, sites: e.sites, status: "page", app: pageApp, signupUrl: url };
  }
  if (app) return { host: e.host, sites: e.sites, status: "signal", app, note: "app script on the home page, no sign-up page found" };
  return { host: e.host, sites: e.sites, status: "none" };
}

async function main() {
  const dir = resolve(process.cwd(), "data/affiliate-scan");
  let hosts: HostEntry[] = JSON.parse(readFileSync(resolve(dir, "hosts.json"), "utf8"));
  if (LIMIT) hosts = hosts.slice(0, LIMIT);
  const results: Result[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < hosts.length) {
        const e = hosts[i++];
        const r = await scan(e);
        results.push(r);
        if (r.status === "page" || r.status === "signal") console.log(`${r.status}  ${r.host}  ${r.app ?? "?"}  ${r.signupUrl ?? ""}`);
      }
    }),
  );
  results.sort((a, b) => a.host.localeCompare(b.host));
  writeFileSync(resolve(dir, "results.json"), JSON.stringify({ scannedAt: new Date().toISOString(), results }, null, 1));
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const found = results.filter((r) => r.status === "page" || r.status === "signal");
  const lines = [
    `# Affiliate programme scan: ${hosts.length} store hosts`,
    "",
    Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · "),
    "",
    "| Store | Sites | App / network | Sign-up page |",
    "|---|---|---|---|",
    ...found.map((r) => `| ${r.host} | ${r.sites.join(", ")} | ${r.app ?? "unknown"} | ${r.signupUrl ?? r.note ?? ""} |`),
  ];
  const md = lines.join("\n");
  console.log("\n" + md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
