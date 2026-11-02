// Weekly store vetting for every Compare Empire site (.github/workflows/store-vetting.yml).
//
// Why: a price comparison site that sends buyers to "the cheapest store on the
// internet" sends them to scam shops unless something checks the shops. Every
// site's stores are a hand-picked registry in its own repo; this job reads all
// of them and looks at each store's domain from the outside, the way a careful
// buyer would (docs/store-vetting.md has the criteria; owner, 2026-11-02):
//
//   RED (the run fails, GitHub emails the owner; remove or explain the store):
//     banned      on data/store-vetting/banned.json (a known scam, on any site)
//     dead        the domain does not resolve or answer at all
//     parked      the page says the domain is for sale or parked
//     moved       the home page now redirects to a different domain
//   LOOK (listed in the "Store vetting" issue, checked by hand):
//     young       the domain was registered under a year ago (RDAP)
//     trustpilot  rated under 2.5 on Trustpilot with 10+ reviews
//     no-contact  the home page shows no email, phone, contact or policy page
//     no-domain   the store has no domain of its own (a *.myshopify.com address)
//
// A store that blocks us (403, 429, a bot challenge) is "unknown", never dead:
// we never work around bot protection. Anything this job cannot read is unknown,
// never a false OK and never a false alarm.
//
//   node scripts/store-vetting.mjs              (in Actions: GITHUB_TOKEN, GITHUB_REPOSITORY)
//   DRY_RUN=1 node scripts/store-vetting.mjs    (prints the issue body, writes nothing)
//   ONLY=riftcompare,opcompare node scripts/store-vetting.mjs
//
// No dependencies. This repo is public: the issue lists store domains only.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = process.env.GITHUB_REPOSITORY || "Specifxx/TCGEmpire";
const TOKEN = process.env.GITHUB_TOKEN || "";
const DRY = Boolean(process.env.DRY_RUN);
const DAY = 86_400_000;
const UA = "Mozilla/5.0 (compatible; CompareEmpireStoreCheck/1.0; +https://riftcompare.com/how-we-pick-stores)";

/**
 * Where each site keeps its store registry. Paths are read from the repo's
 * default branch. A path ending in "/" is a folder: every .ts file in it.
 * When a card-engine site switches to compare-empire/card-engine, point it there.
 */
export const SITES = {
  riftcompare: { repo: "Specifxx/TCGEmpire", files: ["src/lib/retailers.ts", "src/lib/sealed-stores.ts"] },
  opcompare: { repo: "Specifxx/OpCompare", files: ["src/lib/stores.ts"] },
  mtgcompare: { repo: "Specifxx/mtgcompare", files: ["src/data/stores.json"] },
  dexcompare: { repo: "Specifxx/CompareEmpire", files: ["apps/dexcompare-sealed/src/data/stores.json"] },
  gundamcompare: { repo: "Specifxx/GundamCompare", files: ["src/content/stores.ts", "src/content/kit-stores.ts"] },
  lorcanacompare: { repo: "Specifxx/lorcanacompare", files: ["src/content/stores.ts"] },
  ygocompare: { repo: "Specifxx/ygocompare", files: ["src/content/stores.ts"] },
  cyberpunkcompare: { repo: "Specifxx/cyberpunkcompare", files: ["src/content/stores.ts"] },
  wargamecompare: { repo: "Specifxx/wargamecompare", files: ["src/data/stores.json"] },
  figurecompare: { repo: "Specifxx/figurecompare", files: ["src/content/stores.ts"] },
  kaeyoung: { repo: "Specifxx/Kaeyoung", files: ["src/content/stores.ts"] },
  camcompare: { repo: "Specifxx/Camcompare", files: ["src/lib/retailers.ts"] },
  compareempire: {
    repo: "Specifxx/compareempiretake2",
    files: ["src/lib/retailers.ts", "src/lib/retailers-uk.ts", "src/lib/retailers-us.ts", "scripts/scrapers/categories/"],
  },
};

/** Hosts in a registry that are not stores we vet: marketplaces, CDNs, references. */
const NOT_A_STORE =
  /(^|\.)(ebay\.[a-z.]+|amazon\.[a-z.]+|tcgplayer\.com|cardmarket\.com|cardtrader\.com|shopify\.com|shopifycdn\.com|cloudfront\.net|githubusercontent\.com|github\.com|schema\.org|w3\.org|google\.[a-z.]+|googleapis\.com|gstatic\.com|youtube\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|wikipedia\.org|example\.com|riftcompare\.com|archive\.org|bigcommerce\.com|wixstatic\.com|squarespace\.com|ecwid\.com|klaviyo\.com|imgix\.net|awin1\.com|impact\.com|partnerize\.com|rakuten\.com|cj\.com|linksynergy\.com|uvsgames\.com|riftbound\.com)$/;

/** Two-label public suffixes we meet, so "shop.example.com.au" has the domain "example.com.au". */
const SECOND_LEVEL = new Set([
  "com.au", "net.au", "org.au", "co.uk", "org.uk", "me.uk", "ltd.uk", "co.nz", "net.nz", "org.nz", "com.sg", "co.jp", "ne.jp",
  "com.my", "co.za", "co.kr", "com.hk", "com.br", "com.mx", "com.tw", "com.ph", "co.in", "com.cn",
]);

/** Every store host named in a registry file: base/site URLs and bare "site: 'host'" values. Pure. */
export function hostsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?=[/"'`?:#\s,)]|$)/gi)) out.add(m[1]);
  for (const m of text.matchAll(/\b(?:site|base|host|domain)"?\s*:\s*["'`]([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\/[^"'`]*)?["'`]/gi)) out.add(m[1]);
  return [...out]
    .map((h) => h.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""))
    .filter((h) => !NOT_A_STORE.test(h) && !/^(cdn|images?|static|assets|media|img)\./.test(h));
}

/** The registrable domain of a host ("shop.example.com.au" -> "example.com.au"). Pure. */
export function domainOf(host) {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(last2) ? parts.slice(-3).join(".") : last2;
}

const PARKED = /(this domain (name )?(is|may be) for sale|buy this domain|domain is parked|parked free|courtesy of godaddy|hugedomains|dan\.com\/|sedo\.com|afternic|domain has expired|this domain has expired|account (has been )?suspended|store (is )?unavailable|this store does not exist|opening soon[^<]{0,40}password)/i;
const CONTACT = /(mailto:|tel:|href="[^"]*(contact|policies\/refund|refund-policy|returns|shipping-policy|about)[^"]*")/i;

/** What one home page response says about the store. Pure, for tests. */
export function judgePage({ status, finalHost, host, body }) {
  if (status === 403 || status === 429 || status === 503 || /cf-chl|challenge-platform|captcha/i.test(body ?? "")) return { state: "blocked" };
  if (status >= 500 || status === 404 || status === 410) return { state: "error", detail: `HTTP ${status}` };
  const flags = [];
  if (finalHost && domainOf(finalHost) !== domainOf(host) && !/myshopify\.com$/.test(finalHost)) flags.push({ kind: "moved", red: true, detail: `now redirects to ${finalHost}` });
  if (body && PARKED.test(body)) flags.push({ kind: "parked", red: true, detail: "the page says it is parked, for sale or closed" });
  if (body && body.length > 2000 && !CONTACT.test(body)) flags.push({ kind: "no-contact", red: false, detail: "no email, phone, contact or policy link on the home page" });
  return { state: "ok", flags };
}

/** Days since an RDAP record's registration event, or null. Pure. */
export function ageDays(rdap, now = Date.now()) {
  const ev = (rdap?.events ?? []).find((e) => /registration/i.test(e.eventAction ?? ""));
  const t = ev ? Date.parse(ev.eventDate) : NaN;
  return Number.isFinite(t) ? Math.floor((now - t) / DAY) : null;
}

/** Trustpilot's rating and count from its review page, or null when it has none. Pure. */
export function trustpilotFrom(html) {
  const rating = html.match(/"ratingValue"\s*:\s*"?([\d.]+)/);
  const count = html.match(/"reviewCount"\s*:\s*"?(\d+)/);
  if (!rating || !count) return null;
  return { rating: Number(rating[1]), reviews: Number(count[1]) };
}

// ---- network (never throws: anything unreadable is "unknown") ---------------

async function get(url, { timeout = 15_000, redirect = "follow", headers = {} } = {}) {
  try {
    const r = await fetch(url, { redirect, signal: AbortSignal.timeout(timeout), headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.5", ...headers } });
    const body = await r.text().catch(() => "");
    return { status: r.status, url: r.url, body: body.slice(0, 400_000) };
  } catch (e) {
    return { status: 0, error: String(e?.cause?.code || e?.name || e) };
  }
}

function gh(path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", "User-Agent": "store-vetting", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(init.headers ?? {}) },
  });
}

async function fileText(repo, path) {
  const r = await gh(`/repos/${repo}/contents/${path}`, { headers: { Accept: "application/vnd.github.raw" } });
  if (!r.ok) throw new Error(`${repo}/${path}: HTTP ${r.status}`);
  return r.text();
}

async function registryHosts(site) {
  const { repo, files } = SITES[site];
  const hosts = new Set();
  for (const f of files) {
    if (f.endsWith("/")) {
      const r = await gh(`/repos/${repo}/contents/${f.slice(0, -1)}`);
      if (!r.ok) throw new Error(`${repo}/${f}: HTTP ${r.status}`);
      for (const e of await r.json()) if (e.type === "file" && /\.(ts|json)$/.test(e.name)) for (const h of hostsIn(await fileText(repo, e.path))) hosts.add(h);
    } else for (const h of hostsIn(await fileText(repo, f))) hosts.add(h);
  }
  return [...hosts];
}

let rdapBase = null;
async function rdapFor(domain) {
  if (!rdapBase) {
    rdapBase = new Map();
    const r = await get("https://data.iana.org/rdap/dns.json", { timeout: 20_000 });
    try {
      for (const [tlds, urls] of JSON.parse(r.body).services) for (const t of tlds) rdapBase.set(t, urls[0]);
    } catch {}
  }
  const tld = domain.split(".").pop();
  const base = rdapBase.get(tld) ?? (domain.endsWith(".au") ? "https://rdap.cctld.au/rdap/" : null);
  if (!base) return null;
  const r = await get(`${base.replace(/\/?$/, "/")}domain/${domain}`, { timeout: 15_000, headers: { Accept: "application/rdap+json" } });
  if (r.status !== 200) return null;
  try {
    return JSON.parse(r.body);
  } catch {
    return null;
  }
}

/** Check one host. Returns { host, domain, state, flags[], age, trustpilot }. */
export async function vetHost(host, banned) {
  const domain = domainOf(host);
  const out = { host, domain, state: "unknown", flags: [], age: null, trustpilot: null };
  if (banned.has(domain) || banned.has(host)) {
    out.state = "ok";
    out.flags.push({ kind: "banned", red: true, detail: "on the banned list (a known scam)" });
    return out;
  }
  let home = await get(`https://${host}/`);
  if (home.status === 0) home = await get(`https://www.${host}/`);
  if (home.status === 0) home = await get(`http://${host}/`);
  if (home.status === 0) {
    out.state = "ok";
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|SSL|ERR_TLS/i.test(home.error ?? "")) out.flags.push({ kind: "dead", red: true, detail: `does not answer (${home.error})` });
    else out.state = "unknown";
    return out;
  }
  let finalHost = null;
  try {
    finalHost = new URL(home.url).host.replace(/^www\./, "");
  } catch {}
  const page = judgePage({ status: home.status, finalHost, host, body: home.body });
  out.state = page.state === "ok" ? "ok" : page.state === "blocked" ? "blocked" : "ok";
  if (page.state === "error") out.flags.push({ kind: "dead", red: true, detail: `home page answers ${page.detail}` });
  if (page.flags) out.flags.push(...page.flags);
  if (/\.myshopify\.com$/.test(host)) {
    out.flags.push({ kind: "no-domain", red: false, detail: "no domain of its own (myshopify.com address)" });
    return out;
  }
  const rdap = await rdapFor(domain);
  out.age = ageDays(rdap);
  if (out.age != null && out.age < 365) out.flags.push({ kind: "young", red: false, detail: `domain registered ${out.age} days ago` });
  const tp = await get(`https://www.trustpilot.com/review/${domain}`, { timeout: 12_000 });
  if (tp.status === 200) {
    out.trustpilot = trustpilotFrom(tp.body) ?? "none";
    if (out.trustpilot !== "none" && out.trustpilot.reviews >= 10 && out.trustpilot.rating < 2.5) {
      out.flags.push({ kind: "trustpilot", red: false, detail: `Trustpilot ${out.trustpilot.rating} from ${out.trustpilot.reviews} reviews` });
    }
  } else if (tp.status === 404) out.trustpilot = "none";
  return out;
}

async function pool(items, n, fn) {
  const res = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        res[k] = await fn(items[k]);
      }
    }),
  );
  return res;
}

// ---- the report --------------------------------------------------------------

export function issueBody(results, siteHosts, now = new Date()) {
  const sitesOf = (h) => Object.entries(siteHosts).filter(([, hs]) => hs.includes(h)).map(([s]) => s).join(", ");
  const red = results.filter((r) => r.flags.some((f) => f.red));
  const look = results.filter((r) => !r.flags.some((f) => f.red) && r.flags.length);
  const blocked = results.filter((r) => r.state === "blocked").length;
  const unknown = results.filter((r) => r.state === "unknown").length;
  const line = (r) => `- [ ] \`${r.host}\` (${sitesOf(r.host)}): ${r.flags.map((f) => f.detail).join("; ")}`;
  return [
    `Checked ${results.length} store domains across ${Object.keys(siteHosts).length} sites on ${now.toISOString().slice(0, 10)}. Criteria: \`docs/store-vetting.md\`.`,
    "",
    `### Remove or explain (${red.length})`,
    red.length ? red.map(line).join("\n") : "None.",
    "",
    `### Check by hand (${look.length})`,
    look.length ? look.map(line).join("\n") : "None.",
    "",
    `${blocked} stores blocked our check (normal for bot protection; never worked around) and ${unknown} could not be read this time. They are not flagged.`,
    "",
    'To deal with them, ask Claude: _"check the store vetting issue"_. A store that fails is removed from every site that lists it; a scam goes on `data/store-vetting/banned.json`.',
  ].join("\n");
}

async function upsertIssue(body, open) {
  const r = await gh(`/repos/${REPO}/issues?labels=store-vetting&state=all&per_page=5`);
  const [issue] = r.ok ? await r.json() : [];
  const title = "Store vetting";
  if (!issue) {
    if (!open) return;
    await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: ["store-vetting"] }) });
    return;
  }
  await gh(`/repos/${REPO}/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ title, body, state: open ? "open" : "closed", ...(open ? {} : { state_reason: "completed" }) }) });
}

async function main() {
  const banned = new Set(JSON.parse(readFileSync(new URL("../data/store-vetting/banned.json", import.meta.url), "utf8")).map((b) => b.domain));
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  const siteHosts = {};
  const problems = [];
  for (const site of Object.keys(SITES)) {
    if (only.length && !only.includes(site)) continue;
    try {
      siteHosts[site] = await registryHosts(site);
      console.log(`${site}: ${siteHosts[site].length} store hosts`);
    } catch (e) {
      problems.push(`${site}: could not read its store list (${e.message})`);
    }
  }
  const hosts = [...new Set(Object.values(siteHosts).flat())].sort();
  console.log(`${hosts.length} unique hosts`);
  const results = await pool(hosts, 8, (h) => vetHost(h, banned));
  const body = issueBody(results, siteHosts);
  writeFileSync("store-vetting.json", JSON.stringify({ at: new Date().toISOString(), siteHosts, results }, null, 1));
  console.log(body);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Store vetting\n\n${body}\n`);
  const red = results.filter((r) => r.flags.some((f) => f.red));
  const look = results.filter((r) => r.flags.length);
  if (!DRY && TOKEN && !only.length) await upsertIssue(body, look.length > 0);
  for (const p of problems) console.log(`::error::${p}`);
  for (const r of red) console.log(`::error::${r.host}: ${r.flags.filter((f) => f.red).map((f) => f.detail).join("; ")}`);
  if (problems.length || red.length) process.exit(1);
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) main().catch((e) => (console.error(e), process.exit(1)));
