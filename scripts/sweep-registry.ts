// Registry-driven store sweep for AU/US/UK/SG/CA/EU — the generalisation of
// probe-eu-stores.ts's `--registry` mode to every market this site tracks.
//
// WHY THIS EXISTS: the EU and SG markets were swept against the official UVS
// Games retailer registry (the data behind locator.riftbound.uvsgames.com,
// api.riftbound.uvsgames.com/api/v2/game-stores/?game_id=3 — unauthenticated,
// paginated, 8,500+ stores worldwide). AU/US/UK/CA never got the same
// treatment; their RETAILERS entries came from ad-hoc web-search batches. This
// script applies the exact same bar the EU pass established
// (MIN_SINGLES_FOR_STORE in-stock, collector-numbered singles — see
// lib/woocommerce.ts) against the FULL registry for a chosen set of markets,
// so "we're missing stores" stops being a guess.
//
// Read-only. No database import anywhere in this file — it never writes to
// Postgres. It only reads the registry and each candidate's public storefront
// feed, and writes its own progress/results to a local JSON file.
//
//   npx tsx scripts/sweep-registry.ts                          # US,CA,UK,AU
//   npx tsx scripts/sweep-registry.ts --markets US,CA,UK,AU,SG,EU
//   npx tsx scripts/sweep-registry.ts --limit 50               # smoke test
//   npx tsx scripts/sweep-registry.ts --only somestore.com     # one host
//   npx tsx scripts/sweep-registry.ts --resume                 # continue a run
//   npx tsx scripts/sweep-registry.ts --report-only            # re-print a finished run
//
// OUTPUT: --out (default scratch/sweep-registry.json) is rewritten after every
// store finishes, so a crash or a Ctrl-C loses nothing — --resume picks up
// where it left off (only re-running hosts that were rate-limited or
// unreachable last time). The console report at the end prints, per market: a
// ranked table of new stores that cleared the bar, a platform histogram of the
// rejected non-Shopify stores (the input to any future adapter decision),
// tracked stores that now return fewer than the minimum, and a ready-to-paste
// retailers.ts block for everything that cleared the bar with a proven
// currency. These are sweep artefacts, not application code — read the log,
// hand-review the generated block, then paste it into retailers.ts yourself.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "../src/lib/scrape-http";
import { isoCountry, isEuIso, COUNTRIES, type Country } from "../src/lib/country";
import { RETAILERS, RETAILER_LIST } from "../src/lib/retailers";
import {
  CONVENTIONAL_SINGLES_HANDLES,
  isSinglesTitle,
  MIN_SINGLES_FOR_STORE,
  WOO_STORE_API,
  discoverWooRiftboundCategories,
  fetchWooCategory,
  wooVariants,
  decodeEntities,
} from "../src/lib/woocommerce";

type Market = Country;
const ALL_MARKETS: Market[] = ["AU", "US", "UK", "SG", "CA", "EU"];

const NON_SINGLE =
  /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;

// Store "websites" that are not webshops — social profiles, marketplaces this
// site deliberately keeps out of RETAILERS (see lib/pending-platforms.ts), and
// map links. About half the registry's `website` field is one of these.
const NOT_A_SHOP =
  /facebook|instagram|linktr|whatsapp|tiktok|twitter|x\.com|youtube|discord|google\.com|maps\.app|line\.me|wa\.me|t\.me|carousell|shopee|lazada|ebay\.|amazon\.|etsy\.com|tcgplayer\.com|cardmarket\.com/i;

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function fetchRes(url: string, timeoutMs = 15000): Promise<Response | null> {
  try {
    return await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}
async function fetchText(url: string, timeoutMs = 20000): Promise<string | null> {
  const res = await fetchRes(url, timeoutMs);
  if (!res || !res.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}
async function fetchJson<T>(url: string, timeoutMs = 45000): Promise<T | null> {
  const res = await fetchRes(url, timeoutMs);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
// ONE RETRY, same rationale as probe-eu-stores.ts: this fetch decides whether a
// store is Shopify at all, and a single timed-out request under concurrency
// would reject a real store outright.
async function fetchSitemap(base: string): Promise<string | null> {
  return (await fetchText(`${base}/sitemap.xml`, 20000)) ?? (await fetchText(`${base}/sitemap.xml`, 20000));
}

// ── domain helpers ───────────────────────────────────────────────────────────
const THREE_LABEL_SUFFIXES = new Set(["co.uk", "com.au", "com.sg", "co.nz", "com.mx", "co.ca"]);
function apexDomain(host: string): string {
  const parts = host.toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (THREE_LABEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}
function trackedApexes(): Set<string> {
  const set = new Set<string>();
  for (const r of RETAILER_LIST) {
    try {
      set.add(apexDomain(new URL(r.base).hostname.replace(/^www\./, "")));
    } catch {
      /* malformed base — ignore */
    }
  }
  return set;
}
function suggestKey(host: string, taken: Set<string>): string {
  let base = host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^(shop|singles|store)\./, "")
    .replace(/\.[a-z.]+$/i, "")
    .replace(/[^a-z0-9]+/g, "");
  if (!base) base = "store";
  let key = base;
  let n = 2;
  while (taken.has(key) || RETAILERS[key]) {
    key = `${base}${n}`;
    n++;
  }
  return key;
}

// ── the official registry ────────────────────────────────────────────────────
const REGISTRY = "https://api.riftbound.uvsgames.com/api/v2/game-stores/?game_id=3&page_size=200&page=";
interface RegistryRow {
  store?: { name?: string; website?: string; country?: string };
}
interface RegistryPage {
  total: number;
  results: RegistryRow[];
}
async function registryRows(): Promise<RegistryRow[]> {
  const first = await fetchJson<RegistryPage>(REGISTRY + "1");
  if (!first) throw new Error("registry unreachable");
  const pages = Math.ceil(first.total / 200);
  console.log(`Official registry: ${first.total} stores worldwide, ${pages} pages …`);
  const all: RegistryRow[] = [...first.results];
  for (let p = 2; p <= pages; p++) {
    const r = await fetchJson<RegistryPage>(REGISTRY + p);
    if (r?.results) all.push(...r.results);
  }
  return all;
}
function marketFor(rawCountry: string): Market | null {
  const c = (rawCountry ?? "").trim().toUpperCase();
  if (c === "US") return "US";
  if (c === "GB") return "UK";
  if (c === "CA") return "CA";
  if (c === "AU") return "AU";
  if (c === "SG") return "SG";
  if (isEuIso(c)) return "EU";
  return null;
}

interface Candidate {
  host: string;
  base: string;
  name: string;
  market: Market;
  registryCountry: string;
  trackedKey?: string;
  configuredHandles?: string[];
}

async function registryCandidates(markets: Set<Market>): Promise<Candidate[]> {
  const rows = await registryRows();
  const tracked = trackedApexes();
  const byHost = new Map<string, Candidate>();
  for (const row of rows) {
    const s = row.store ?? {};
    const market = marketFor(String(s.country ?? ""));
    if (!market || !markets.has(market)) continue;
    const w = String(s.website ?? "").trim();
    if (!w || NOT_A_SHOP.test(w)) continue;
    const host = w
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (!host.includes(".")) continue;
    if (byHost.has(host)) continue;
    if (tracked.has(apexDomain(host))) continue; // already in RETAILERS
    byHost.set(host, { host, base: `https://${host}`, name: String(s.name ?? host), market, registryCountry: String(s.country ?? "") });
  }
  console.log(`${byHost.size} unique, untracked, non-social shop domains across the requested markets.`);
  return [...byHost.values()];
}

function trackedCandidates(markets: Set<Market>): Candidate[] {
  return RETAILER_LIST.filter((r) => markets.has((r.country ?? "AU") as Market)).map((r) => {
    let host = r.key;
    try {
      host = new URL(r.base).hostname.replace(/^www\./, "");
    } catch {
      /* keep key as fallback host */
    }
    return {
      host,
      base: r.base,
      name: r.name,
      market: (r.country ?? "AU") as Market,
      registryCountry: "(tracked)",
      trackedKey: r.key,
      configuredHandles: r.collections,
    };
  });
}

// ── platform detection ───────────────────────────────────────────────────────
type Platform =
  | "shopify"
  | "woocommerce"
  | "crystal-commerce"
  | "bigcommerce"
  | "wix"
  | "squarespace"
  | "magento"
  | "prestashop"
  | "shopware"
  | "ecwid"
  | "cloudflare-blocked"
  | "unreachable"
  | "other";

async function detectPlatform(base: string): Promise<{ platform: Platform; finalHost: string; riftboundMentioned: boolean }> {
  const fallbackHost = (() => {
    try {
      return new URL(base).hostname.replace(/^www\./, "");
    } catch {
      return base;
    }
  })();
  const res = await fetchRes(`${base}/`, 15000);
  if (!res) return { platform: "unreachable", finalHost: fallbackHost, riftboundMentioned: false };
  if (isRateLimited(res)) return { platform: "cloudflare-blocked", finalHost: fallbackHost, riftboundMentioned: false };
  let finalHost = fallbackHost;
  try {
    finalHost = new URL(res.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep fallback */
  }
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  const lower = body.toLowerCase();
  const riftboundMentioned = /riftbound/i.test(body);
  if (res.status === 403 && /cloudflare|just a moment|cf-mitigated|challenge-platform/i.test(lower)) {
    return { platform: "cloudflare-blocked", finalHost, riftboundMentioned };
  }
  if (res.headers.has("x-shopid") || /cdn\.shopify\.com/.test(lower) || /shopify\.theme/i.test(body)) {
    return { platform: "shopify", finalHost, riftboundMentioned };
  }
  if (/woocommerce|wp-content|wp-json/i.test(lower)) {
    const woo = await fetchJson<unknown[]>(`${base}${WOO_STORE_API}/products?per_page=1`, 12000);
    if (Array.isArray(woo)) return { platform: "woocommerce", finalHost, riftboundMentioned };
  }
  if (/crystalcommerce|\/catalog\/[a-z0-9_-]+\/\d+/i.test(lower)) return { platform: "crystal-commerce", finalHost, riftboundMentioned };
  if (/bigcommerce|stencil-utils/i.test(lower)) return { platform: "bigcommerce", finalHost, riftboundMentioned };
  if (/wix\.com|wixstatic/i.test(lower)) return { platform: "wix", finalHost, riftboundMentioned };
  if (/squarespace/i.test(lower)) return { platform: "squarespace", finalHost, riftboundMentioned };
  if (/mage\.|\/static\/version/i.test(body)) return { platform: "magento", finalHost, riftboundMentioned };
  if (/prestashop/i.test(lower)) return { platform: "prestashop", finalHost, riftboundMentioned };
  if (/shopware/i.test(lower)) return { platform: "shopware", finalHost, riftboundMentioned };
  if (/ecwid/i.test(lower)) return { platform: "ecwid", finalHost, riftboundMentioned };
  return { platform: "other", finalHost, riftboundMentioned };
}

async function riftboundPresence(base: string, homepageAlreadyHasIt: boolean): Promise<boolean> {
  if (homepageAlreadyHasIt) return true;
  const html = await fetchText(`${base}/search?q=riftbound`, 12000);
  return !!html && /riftbound/i.test(html);
}

// ── Shopify discovery + counting ────────────────────────────────────────────
async function discoverHandlesViaSitemap(base: string): Promise<Set<string>> {
  const index = await fetchSitemap(base);
  let sitemaps = index
    ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u))
    : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  for (const sm of sitemaps.slice(0, 8)) {
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (/riftbound/i.test(h) && !NON_SINGLE.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) handles.add(h);
    }
  }
  return handles;
}
async function collectionsJsonScan(base: string): Promise<string[]> {
  const found = new Set<string>();
  for (let page = 1; page <= 4; page++) {
    const j = await fetchText(`${base}/collections.json?limit=250&page=${page}`, 15000);
    if (!j) break;
    let data: { collections?: { handle?: string; title?: string }[] };
    try {
      data = JSON.parse(j);
    } catch {
      break;
    }
    const cols = data.collections ?? [];
    if (!cols.length) break;
    for (const c of cols) {
      const handle = String(c.handle ?? "");
      const title = String(c.title ?? "");
      if (/riftbound/i.test(`${handle} ${title}`) && !NON_SINGLE.test(handle) && !NON_SINGLE.test(title)) found.add(handle);
    }
    if (cols.length < 250) break;
  }
  return [...found];
}
// Sitemap discovery ∪ the conventional BinderPOS handles ∪ a /collections.json
// title scan ∪ any handle already configured on a tracked store's entry. The
// collections.json scan catches a collection with no "riftbound" in its HANDLE
// but "Riftbound" in its TITLE — e.g. Toy Snowman's
// "magic-the-gathering-singles-copy", which sitemap discovery cannot find.
async function discoverHandles(base: string, extra: string[] = []): Promise<string[]> {
  const sitemapHandles = await discoverHandlesViaSitemap(base);
  await sleep(REQUEST_DELAY_MS);
  const scanHandles = await collectionsJsonScan(base);
  const handles = new Set<string>([...sitemapHandles, ...scanHandles, ...CONVENTIONAL_SINGLES_HANDLES, ...extra]);
  return [...handles].slice(0, 10);
}

interface CountResult {
  singles: number;
  inStock: number;
  total: number;
  sample: string;
  firstHandle: string;
  firstPrice: string;
  rateLimited: boolean;
}
async function countSingles(base: string, handles: string[], iso: string): Promise<CountResult> {
  let inStock = 0,
    singles = 0,
    total = 0,
    sample = "",
    firstHandle = "",
    firstPrice = "";
  let rateLimited = false;
  const seenHandles = new Set<string>();
  for (const h of handles) {
    for (let page = 1; page <= 8; page++) {
      await sleep(REQUEST_DELAY_MS);
      const res = await fetchRes(`${base}/collections/${h}/products.json?country=${iso}&limit=250&page=${page}`, 15000);
      if (!res) break;
      if (isRateLimited(res)) {
        rateLimited = true;
        break;
      }
      if (!res.ok) break;
      let bodyText: string;
      try {
        bodyText = await res.text();
      } catch {
        break;
      }
      let arr: { handle: string; title: string; variants?: { available?: boolean; price?: string }[] }[];
      try {
        arr = JSON.parse(bodyText).products;
      } catch {
        break;
      }
      if (!arr || !arr.length) break;
      for (const p of arr) {
        if (seenHandles.has(p.handle)) continue;
        seenHandles.add(p.handle);
        total++;
        const v = (p.variants ?? []).find((v) => v.available);
        if (!v || !v.price) continue;
        inStock++;
        const isSingle = isSinglesTitle(String(p.title));
        if (isSingle) singles++;
        // Sample a SINGLE if we have one — a sealed sample on a store being
        // judged for singles would be exactly the misreading this exists to prevent.
        if (isSingle && !firstHandle) {
          sample = `${String(p.title).slice(0, 40)} ${v.price}`;
          firstHandle = p.handle;
          firstPrice = v.price;
        }
      }
      if (arr.length < 250) break;
    }
    if (rateLimited) break;
  }
  if (!firstHandle && !rateLimited) {
    // Nothing to prove currency against yet — fall back to any in-stock product
    // purely so the currency check can still run and be reported.
    for (const h of handles.slice(0, 2)) {
      await sleep(REQUEST_DELAY_MS);
      const j = await fetchText(`${base}/collections/${h}/products.json?country=${iso}&limit=250`, 15000);
      if (!j) continue;
      let arr: { handle: string; title: string; variants?: { available?: boolean; price?: string }[] }[];
      try {
        arr = JSON.parse(j).products;
      } catch {
        continue;
      }
      const p = (arr ?? []).find((x) => (x.variants ?? []).some((v) => v.available));
      const v = p?.variants?.find((v) => v.available);
      if (p && v?.price) {
        sample = `${String(p.title).slice(0, 40)} ${v.price}`;
        firstHandle = p.handle;
        firstPrice = v.price;
        break;
      }
    }
  }
  return { singles, inStock, total, sample, firstHandle, firstPrice, rateLimited };
}

// The currency the store REALLY charges a shopper in `iso`, read off the
// product page served under the same ?country= the real importer scrapes with.
async function provenCurrency(base: string, handle: string, feedPrice: string, iso: string): Promise<{ cur: string; agrees: boolean }> {
  const html = (await fetchText(`${base}/products/${handle}?country=${iso}`, 15000)) ?? "";
  const cur =
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/property="og:price:currency"\s+content="([A-Z]{3})"/)?.[1] ??
    html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ??
    "?";
  const prices = [...html.matchAll(/"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/g)].map((m) => m[1]);
  return { cur, agrees: prices.includes(feedPrice) || prices.includes(String(Number(feedPrice))) };
}
async function hasShippingPolicy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/policies/shipping-policy`, { method: "HEAD", headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (res.ok) return true;
    if (res.status === 405) {
      const g = await fetchRes(`${base}/policies/shipping-policy`, 12000);
      return !!g?.ok;
    }
    return false;
  } catch {
    return false;
  }
}

// ── WooCommerce counting (same singles bar, no currency-conversion adapter) ─
async function countWooSingles(base: string, configuredSlugs: string[]): Promise<{ singles: number; inStock: number; currency: string; sample: string }> {
  const categoryIds = await discoverWooRiftboundCategories(base, configuredSlugs);
  let singles = 0,
    inStock = 0,
    currency = "",
    sample = "";
  const seen = new Set<number>();
  for (const [i, id] of categoryIds.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const products = await fetchWooCategory(base, id);
    for (const p of products) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const name = decodeEntities(p.name);
      if (!currency && p.prices?.currency_code) currency = p.prices.currency_code;
      const avail = wooVariants(p).some((v) => v.available);
      if (avail) inStock++;
      if (avail && isSinglesTitle(name)) {
        singles++;
        if (!sample) sample = name.slice(0, 40);
      }
    }
  }
  return { singles, inStock, currency, sample };
}

// ── one candidate, start to finish ──────────────────────────────────────────
type Verdict = "ok" | "thin" | "wrong-currency" | "not-shopify" | "robots" | "rate-limited" | "unreachable" | "no-stock" | "already-tracked";

interface SweepResult {
  host: string;
  base: string;
  name: string;
  market: Market;
  registryCountry: string;
  trackedKey?: string;
  verdict: Verdict;
  platform: Platform;
  robotsOk: boolean;
  rateLimited: boolean;
  riftboundMentioned: boolean;
  handles: string[];
  singles: number;
  inStock: number;
  total: number;
  currency: string;
  currencyAgrees: boolean;
  sample: string;
  shippingPolicy: boolean;
  suggestedKey?: string;
  finalHost: string;
  ms: number;
  at: string;
  error?: string;
}

async function sweepOne(c: Candidate, taken: Set<string>, trackedApexSet: Set<string>): Promise<SweepResult> {
  const start = Date.now();
  const blank: SweepResult = {
    host: c.host,
    base: c.base,
    name: c.name,
    market: c.market,
    registryCountry: c.registryCountry,
    trackedKey: c.trackedKey,
    verdict: "unreachable",
    platform: "unreachable",
    robotsOk: false,
    rateLimited: false,
    riftboundMentioned: false,
    handles: [],
    singles: 0,
    inStock: 0,
    total: 0,
    currency: "n/a",
    currencyAgrees: false,
    sample: "",
    shippingPolicy: false,
    finalHost: c.host,
    ms: 0,
    at: new Date().toISOString(),
  };
  try {
    const allowed = await robotsAllows(c.base);
    const robotsOk = allowed("/collections/riftbound/products.json") && allowed("/sitemap.xml");
    if (!robotsOk) return { ...blank, verdict: "robots", robotsOk, ms: Date.now() - start };

    await sleep(REQUEST_DELAY_MS);
    const det = await detectPlatform(c.base);
    if (det.platform === "cloudflare-blocked") {
      return { ...blank, verdict: "rate-limited", rateLimited: true, platform: det.platform, finalHost: det.finalHost, ms: Date.now() - start };
    }
    if (det.platform === "unreachable") {
      return { ...blank, verdict: "unreachable", platform: det.platform, finalHost: det.finalHost, ms: Date.now() - start };
    }

    // A registry entry can point at a domain that just redirects into a store we
    // already track (aliases, old domains) — catch that here, after the real
    // redirect, rather than trusting the registry's literal website field.
    if (!c.trackedKey && trackedApexSet.has(apexDomain(det.finalHost))) {
      return { ...blank, verdict: "already-tracked", platform: det.platform, robotsOk, finalHost: det.finalHost, ms: Date.now() - start };
    }

    if (det.platform !== "shopify" && det.platform !== "woocommerce") {
      await sleep(REQUEST_DELAY_MS);
      const riftboundMentioned = await riftboundPresence(c.base, det.riftboundMentioned);
      return { ...blank, verdict: "not-shopify", platform: det.platform, riftboundMentioned, robotsOk, finalHost: det.finalHost, ms: Date.now() - start };
    }

    const iso = isoCountry(c.market);

    if (det.platform === "woocommerce") {
      await sleep(REQUEST_DELAY_MS);
      const woo = await countWooSingles(c.base, c.configuredHandles ?? []);
      const verdict: Verdict = woo.singles >= MIN_SINGLES_FOR_STORE ? "ok" : "thin";
      return {
        ...blank,
        verdict,
        platform: "woocommerce",
        robotsOk,
        finalHost: det.finalHost,
        singles: woo.singles,
        inStock: woo.inStock,
        currency: woo.currency || "n/a",
        sample: woo.sample,
        ms: Date.now() - start,
      };
    }

    // Shopify
    await sleep(REQUEST_DELAY_MS);
    const handles = await discoverHandles(c.base, c.configuredHandles ?? []);
    if (!handles.length) return { ...blank, verdict: "no-stock", platform: "shopify", robotsOk, finalHost: det.finalHost, ms: Date.now() - start };

    const cnt = await countSingles(c.base, handles, iso);
    if (cnt.rateLimited) {
      return { ...blank, verdict: "rate-limited", rateLimited: true, platform: "shopify", robotsOk, handles, finalHost: det.finalHost, ms: Date.now() - start };
    }
    if (cnt.singles < MIN_SINGLES_FOR_STORE) {
      return {
        ...blank,
        verdict: cnt.total === 0 ? "no-stock" : "thin",
        platform: "shopify",
        robotsOk,
        handles,
        singles: cnt.singles,
        inStock: cnt.inStock,
        total: cnt.total,
        sample: cnt.sample,
        finalHost: det.finalHost,
        ms: Date.now() - start,
      };
    }
    if (!cnt.firstHandle) {
      return {
        ...blank,
        verdict: "no-stock",
        platform: "shopify",
        robotsOk,
        handles,
        singles: cnt.singles,
        inStock: cnt.inStock,
        total: cnt.total,
        finalHost: det.finalHost,
        ms: Date.now() - start,
      };
    }

    await sleep(REQUEST_DELAY_MS);
    const cur = await provenCurrency(c.base, cnt.firstHandle, cnt.firstPrice, iso);
    await sleep(REQUEST_DELAY_MS);
    const policy = await hasShippingPolicy(c.base);
    // The whole point: a store serving another currency to this market's shopper
    // would have its numbers filed under the wrong currency — worse than not
    // tracking it at all, so this is what actually decides "ok".
    const ok = cur.cur === COUNTRIES[c.market].currency;
    const suggestedKey = ok && !c.trackedKey ? suggestKey(det.finalHost || c.host, taken) : undefined;
    if (suggestedKey) taken.add(suggestedKey);

    return {
      ...blank,
      verdict: ok ? "ok" : "wrong-currency",
      platform: "shopify",
      robotsOk,
      handles,
      singles: cnt.singles,
      inStock: cnt.inStock,
      total: cnt.total,
      currency: cur.cur,
      currencyAgrees: cur.agrees,
      sample: cnt.sample,
      shippingPolicy: policy,
      suggestedKey,
      finalHost: det.finalHost,
      ms: Date.now() - start,
    };
  } catch (e) {
    return { ...blank, verdict: "unreachable", error: String((e as Error)?.message ?? e), ms: Date.now() - start };
  }
}

// Run `limit` sweeps at a time — across stores, never within one (each store's
// own requests stay sequential with REQUEST_DELAY_MS between them).
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>, onDone?: (r: R) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        const r = await fn(items[i]);
        out[i] = r;
        done++;
        onDone?.(r);
        if (done % 25 === 0) console.log(`  … ${done}/${items.length} done`);
      }
    }),
  );
  return out;
}

// ── CLI + progress file ──────────────────────────────────────────────────────
interface Args {
  markets: Market[];
  limit?: number;
  only?: string;
  out: string;
  resume: boolean;
  concurrency: number;
  tracked: boolean;
  reportOnly: boolean;
}
function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  const marketsArg = get("--markets");
  const requested = (marketsArg ? marketsArg.split(",") : ["US", "CA", "UK", "AU"]).map((m) => m.trim().toUpperCase());
  const markets = requested.filter((m): m is Market => (ALL_MARKETS as string[]).includes(m));
  for (const m of requested) if (!markets.includes(m as Market)) console.warn(`Ignoring unknown market "${m}".`);
  return {
    markets,
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    only: get("--only"),
    out: get("--out") ?? "scratch/sweep-registry.json",
    resume: has("--resume"),
    concurrency: get("--concurrency") ? Number(get("--concurrency")) : 8,
    tracked: !has("--no-tracked"),
    reportOnly: has("--report-only"),
  };
}

interface SweepFile {
  startedAt: string;
  args: Args;
  results: Record<string, SweepResult>;
}
function loadProgress(path: string): SweepFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function saveProgress(path: string, file: SweepFile): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 1));
  renameSync(tmp, path);
}

// ── per-market shipping placeholders, matching retailers.ts's own modal values ─
const SHIPPING_DEFAULTS: Record<Market, { flat: number; free: number; note: string }> = {
  AU: { flat: 200, free: 5000, note: "est. $2.00 · free over $50" },
  US: { flat: 250, free: 5000, note: "est. US$2.50 · free over US$50" },
  UK: { flat: 150, free: 3000, note: "est. £1.50 · free over £30" },
  SG: { flat: 250, free: 6000, note: "est. S$2.50 · free over S$60" },
  CA: { flat: 299, free: 7500, note: "est. C$2.99 · free over C$75" },
  EU: { flat: 495, free: 6000, note: "est. €4.95 · free over €60" },
};

function retailersBlock(all: SweepResult[]): string {
  const ok = all.filter((r) => r.verdict === "ok" && !r.trackedKey && r.suggestedKey);
  if (!ok.length) return "\n── retailers.ts block ──\n(no new stores cleared the bar this run)\n";
  const byMarket = new Map<Market, SweepResult[]>();
  for (const r of ok) {
    if (!byMarket.has(r.market)) byMarket.set(r.market, []);
    byMarket.get(r.market)!.push(r);
  }
  const conventional = new Set<string>(CONVENTIONAL_SINGLES_HANDLES);
  let out = "\n── retailers.ts block ──\n";
  for (const [market, rows] of byMarket) {
    rows.sort((a, b) => b.singles - a.singles);
    const d = SHIPPING_DEFAULTS[market];
    out += `\n  // ---- Registry sweep (${new Date().toISOString().slice(0, 10)}, scripts/sweep-registry.ts) — ${rows.length} store(s) cleared MIN_SINGLES_FOR_STORE ----\n`;
    for (const r of rows) {
      const preferred = r.handles.filter((h) => !conventional.has(h));
      const cols = (preferred.length ? preferred : r.handles).slice(0, 4);
      out += `  ${r.suggestedKey}: {\n`;
      out += `    key: "${r.suggestedKey}",\n`;
      out += `    name: "${r.name.replace(/"/g, '\\"')}",\n`;
      out += `    base: "https://${r.finalHost}",\n`;
      out += `    collections: [${cols.map((h) => `"${h}"`).join(", ")}],\n`;
      out += `    shippingFlatCents: ${d.flat},\n`;
      out += `    freeOverCents: ${d.free},\n`;
      out += `    shippingNote: "${d.note}",\n`;
      if (market !== "AU") out += `    country: "${market}",\n`;
      out += `  }, // sweep: ${r.singles} singles, cur=${r.currency}\n`;
    }
  }
  const withPolicy = ok.filter((r) => r.shippingPolicy).map((r) => r.suggestedKey);
  if (withPolicy.length) out += `\n  // add to STORES_WITH_POLICY: ${withPolicy.map((k) => `"${k}"`).join(", ")}\n`;
  return out;
}

function report(file: SweepFile): void {
  const all = Object.values(file.results);
  const markets = [...new Set(all.map((r) => r.market))].sort();

  for (const market of markets) {
    const results = all.filter((r) => r.market === market);
    const candidates = results.filter((r) => !r.trackedKey);
    const newOk = candidates.filter((r) => r.verdict === "ok").sort((a, b) => b.singles - a.singles);
    const dupes = candidates.filter((r) => r.verdict === "already-tracked").length;

    console.log(`\n════ ${market} — ${newOk.length} new store(s) clear the bar (of ${candidates.length} swept, ${dupes} already-tracked duplicates) ════`);
    for (const r of newOk) {
      console.log(
        `${r.name.slice(0, 28).padEnd(28)} ${r.finalHost.padEnd(30)} ${r.platform.padEnd(10)} ` +
          `singles=${String(r.singles).padStart(4)} inStock=${String(r.inStock).padStart(4)} cur=${r.currency}${r.currencyAgrees ? "" : "(page≠feed)"} ` +
          `policy=${r.shippingPolicy ? "y" : "n"} [${r.handles.slice(0, 2).join(",")}] e.g. ${r.sample}`,
      );
    }

    const rejectedNonShopify = candidates.filter(
      (r) => r.platform !== "shopify" && r.platform !== "woocommerce" && r.platform !== "unreachable" && r.platform !== "cloudflare-blocked",
    );
    const histogram = new Map<string, { total: number; riftbound: number }>();
    for (const r of rejectedNonShopify) {
      const e = histogram.get(r.platform) ?? { total: 0, riftbound: 0 };
      e.total++;
      if (r.riftboundMentioned) e.riftbound++;
      histogram.set(r.platform, e);
    }
    if (histogram.size) {
      console.log(`  platform histogram (non-Shopify, riftbound-mentioned/total):`);
      for (const [p, e] of [...histogram.entries()].sort((a, b) => b[1].riftbound - a[1].riftbound)) {
        console.log(`    ${p.padEnd(16)} ${e.riftbound}/${e.total}`);
      }
    }

    const trackedZero = results.filter((r) => r.trackedKey && r.verdict !== "ok" && r.platform !== "unreachable" && r.platform !== "cloudflare-blocked");
    if (trackedZero.length) {
      console.log(`  tracked stores now returning < ${MIN_SINGLES_FOR_STORE} singles (report only — nothing removed):`);
      for (const r of trackedZero) console.log(`    ${(r.trackedKey ?? "").padEnd(20)} ${r.finalHost.padEnd(30)} singles=${r.singles} verdict=${r.verdict}`);
    }
  }

  console.log(`\n════ combined non-Shopify platform histogram (all swept markets) — the input to any adapter decision ════`);
  const combined = new Map<string, { total: number; riftbound: number }>();
  for (const r of all) {
    if (r.trackedKey || r.platform === "shopify" || r.platform === "woocommerce" || r.platform === "unreachable" || r.platform === "cloudflare-blocked") continue;
    const e = combined.get(r.platform) ?? { total: 0, riftbound: 0 };
    e.total++;
    if (r.riftboundMentioned) e.riftbound++;
    combined.set(r.platform, e);
  }
  for (const [p, e] of [...combined.entries()].sort((a, b) => b[1].riftbound - a[1].riftbound)) {
    console.log(`  ${p.padEnd(16)} riftbound-mentioned=${e.riftbound} / total=${e.total}`);
  }

  console.log(retailersBlock(all));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.reportOnly) {
    const f = loadProgress(args.out);
    if (!f) {
      console.error(`No progress file at ${args.out} — nothing to report.`);
      process.exitCode = 1;
      return;
    }
    report(f);
    return;
  }

  const markets = new Set(args.markets);
  console.log(`Sweeping markets: ${[...markets].join(", ") || "(none)"}`);

  let candidates: Candidate[];
  if (args.only) {
    const host = args.only.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    const market = [...markets][0] ?? "US";
    candidates = [{ host, base: `https://${host}`, name: host, market, registryCountry: "(only)" }];
  } else {
    const registry = await registryCandidates(markets);
    const tracked = args.tracked ? trackedCandidates(markets) : [];
    candidates = [...tracked, ...registry];
  }
  if (args.limit) candidates = candidates.slice(0, args.limit);
  console.log(`${candidates.length} store(s) to sweep (${candidates.filter((c) => c.trackedKey).length} already tracked, re-checked for regressions).`);

  const file: SweepFile = (args.resume && loadProgress(args.out)) || { startedAt: new Date().toISOString(), args, results: {} };
  const retryable: Verdict[] = ["rate-limited", "unreachable"];
  const todo = args.resume ? candidates.filter((c) => !file.results[c.host] || retryable.includes(file.results[c.host].verdict)) : candidates;
  console.log(`${todo.length} to sweep this run${args.resume ? " (resuming)" : ""}.\n`);

  const taken = new Set<string>(Object.keys(RETAILERS));
  const trackedApexSet = trackedApexes();

  process.on("SIGINT", () => {
    console.log("\nInterrupted — saving progress and printing the report so far…");
    saveProgress(args.out, file);
    report(file);
    process.exit(130);
  });

  await pool(
    todo,
    args.concurrency,
    (c) => sweepOne(c, taken, trackedApexSet),
    (r) => {
      file.results[r.host] = r;
      saveProgress(args.out, file);
    },
  );

  saveProgress(args.out, file);
  report(file);
}

main();
