// Market-scan probe: mirrors the importer's sitemap-based discovery to find which
// EUROZONE TCG stores are Shopify AND expose Riftbound SINGLES collections in EUR.
//
// Modelled directly on probe-uk-stores.ts — read that file's header first; the
// reasoning about proving the currency rather than assuming it is identical and
// is not repeated here. One difference matters:
//
//   THE EU "MARKET" IS ~20 COUNTRIES, so there is no single ?country= to scrape
//   with. Every request here uses EU_ANCHOR_ISO (Spain) — the same value
//   isoCountry("EU") hands the real importer — so what this probe proves is
//   exactly what the importer will see, not an approximation of it. A store that
//   prices in EUR for a Spanish shopper prices in EUR for the whole eurozone;
//   one whose Shopify Markets does NOT cover Spain can still return some other
//   currency, and that is precisely the case the currency proof below catches.
//
// Read-only (no DB) — run it and read the log to decide the list.
//   npx tsx scripts/probe-eu-stores.ts                 # the tracked EU stores
//   npx tsx scripts/probe-eu-stores.ts candidates.json # a research candidate file
//   npx tsx scripts/probe-eu-stores.ts --registry      # EVERY eurozone retailer
//                                                        in the official registry
//
// ── --registry IS THE ONE THAT MATTERS FOR "ARE WE MISSING STORES?" ──────────
// UVS Games publishes the authoritative Riftbound retailer list — the data behind
// locator.riftbound.uvsgames.com — at api.riftbound.uvsgames.com/api/v2/game-stores/
// (game_id=3, unauthenticated, paginated). It is the complete registry, not a
// sample: 8,445 stores worldwide, 2,047 of them in the eurozone.
//
// Use it before concluding anything about coverage. Web search and hand-built
// candidate lists find whatever happens to rank; this finds every shop Riot's own
// partner programme knows about. When that sweep and a 421-domain search sweep
// return the SAME eleven stores, "there are only eleven" stops being a guess.
export {}; // module scope — avoids global-name collisions with other probe scripts
import { readFileSync } from "node:fs";
import { SCRAPE_HEADERS as UA, robotsAllows } from "../src/lib/scrape-http";
import { EU_ANCHOR_ISO } from "../src/lib/country";
import { RETAILER_LIST } from "../src/lib/retailers";
import { CONVENTIONAL_SINGLES_HANDLES, isSinglesTitle, MIN_SINGLES_FOR_STORE } from "../src/lib/woocommerce";

const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box/i;
const CC = EU_ANCHOR_ISO;

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

// ONE RETRY, and only here. Every other fetch in this script failing just makes
// a store look thinner than it is; this one decides `isShopify`, and a single
// timed-out request under 8-way concurrency rejects the store outright with a
// verdict ("not Shopify") that reads as settled fact. That is not hypothetical —
// it is what happened to El Duelista, the largest Spanish catalogue in the
// market, on the sweep that seeded RETAILERS' EU block.
async function fetchSitemap(base: string): Promise<string | null> {
  return (await fetchText(`${base}/sitemap.xml`)) ?? (await fetchText(`${base}/sitemap.xml`));
}

async function discover(base: string) {
  const allowed = await robotsAllows(base);
  const robotsOk = allowed("/collections/riftbound/products.json");
  const index = await fetchSitemap(base);
  let sitemaps = index ? [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /sitemap_collections/i.test(u)) : [];
  if (!sitemaps.length) sitemaps = [`${base}/sitemap_collections_1.xml`];
  const handles = new Set<string>();
  let anyRiftbound = false;
  for (const sm of sitemaps.slice(0, 8)) {
    const xml = await fetchText(sm);
    if (!xml) continue;
    for (const m of xml.matchAll(/\/collections\/([^<\/?#"]+)/g)) {
      const h = m[1];
      if (/riftbound/i.test(h) && !/\.(jpe?g|png|gif|webp|svg)$/i.test(h)) {
        anyRiftbound = true;
        if (!NON_SINGLE.test(h)) handles.add(h);
      }
    }
  }
  // `isShopify` is inferred from sitemap.xml resolving at all — Shopify always
  // serves one. A store that 404s here is on another platform (WooCommerce,
  // PrestaShop, Shopware are all common in this market) and has no products.json
  // for the importer to read, whatever else is true about it.
  // Union in the conventional BinderPOS handles, exactly as the importer does —
  // a probe that discovers less than the importer will reject stores the
  // importer could have priced. Four of the deepest eurozone singles catalogues
  // were rejected by an earlier sitemap-only version of this function while
  // serving 250 cards at /collections/riftbound-single.
  for (const h of CONVENTIONAL_SINGLES_HANDLES) handles.add(h);
  return { isShopify: index != null, handles: [...handles], anyRiftbound, robotsOk };
}

// The currency the store REALLY charges a eurozone shopper for `handle`, read off
// the product page served under the same ?country= the importer scrapes with.
async function provenCurrency(base: string, handle: string, feedPrice: string) {
  const html = (await fetchText(`${base}/products/${handle}?country=${CC}`)) ?? "";
  const cur =
    html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ??
    html.match(/property="og:price:currency"\s+content="([A-Z]{3})"/)?.[1] ??
    html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ??
    "?";
  const prices = [...html.matchAll(/"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/g)].map((m) => m[1]);
  return { cur, agrees: prices.includes(feedPrice) || prices.includes(String(Number(feedPrice))) };
}

export interface ProbeResult {
  name: string; base: string; ok: boolean; reason: string;
  currency: string; currencyAgrees: boolean;
  // singles = in-stock listings that carry a collector number, i.e. the only
  // ones the importer can turn into a price. inStock counts everything in the
  // Riftbound collections, sealed included, and is kept only for context —
  // ranking on it is the mistake that shipped 96 stores of which most priced
  // nothing (see isSinglesTitle in lib/woocommerce.ts).
  singles: number; inStock: number; total: number;
  handles: string[]; sample: string; shippingPolicy: boolean;
}

async function probe(name: string, base: string): Promise<ProbeResult> {
  const blank = { name, base, currency: "n/a", currencyAgrees: false, singles: 0, inStock: 0, total: 0, handles: [] as string[], sample: "", shippingPolicy: false };
  const d = await discover(base);
  if (!d.isShopify) return { ...blank, ok: false, reason: "not Shopify (no /sitemap.xml)" };
  if (!d.robotsOk) return { ...blank, ok: false, reason: "robots.txt disallows the products.json feed" };
  // `handles` now always contains the conventional ones, so it is never empty on
  // a Shopify store — emptiness is no longer the "nothing here" signal it was.
  // The singles count below is, which is the right signal anyway.

  let inStock = 0, singles = 0, total = 0, sample = "", firstHandle = "", firstPrice = "";
  const seenHandles = new Set<string>();
  for (const h of d.handles.slice(0, 8)) {
    for (let page = 1; page <= 8; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=${CC}&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      for (const p of arr) {
        // De-dup ACROSS collections. Stores routinely list the same card in
        // "riftbound" and "riftbound-singles"; counting it twice inflates a
        // store straight past the quality bar it should not clear.
        if (seenHandles.has(p.handle)) continue;
        seenHandles.add(p.handle);
        total++;
        const v = (p.variants || []).find((v: any) => v.available);
        if (!v) continue;
        inStock++;
        const isSingle = isSinglesTitle(String(p.title));
        if (isSingle) singles++;
        // Sample a SINGLE if we have one — a sealed sample on a store being
        // judged for singles is exactly the misreading this probe now exists
        // to prevent.
        if (isSingle && !firstHandle) { sample = `${String(p.title).slice(0, 34)} €${v.price}`; firstHandle = p.handle; firstPrice = v.price; }
      }
      if (arr.length < 250) break;
    }
  }
  if (!firstHandle) {
    // No single at all to prove the currency against — fall back to any in-stock
    // product purely so the currency check can still run and be reported.
    for (const h of d.handles.slice(0, 2)) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=${CC}&limit=250`);
      if (!j) continue;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { continue; }
      const p = (arr || []).find((x: any) => (x.variants || []).some((v: any) => v.available));
      if (p) {
        const v = p.variants.find((v: any) => v.available);
        sample = `${String(p.title).slice(0, 34)} €${v.price}`; firstHandle = p.handle; firstPrice = v.price;
        break;
      }
    }
  }
  if (singles < MIN_SINGLES_FOR_STORE) {
    return { ...blank, ok: false, reason: `${singles} in-stock singles (need ${MIN_SINGLES_FOR_STORE}+); ${inStock} in stock of ${total} listed`, singles, inStock, total, handles: d.handles, sample };
  }
  if (!firstHandle) return { ...blank, ok: false, reason: "nothing in stock to prove the currency against", singles, inStock, total, handles: d.handles };

  const cur = await provenCurrency(base, firstHandle, firstPrice);
  const shippingPolicy = (await fetchText(`${base}/policies/shipping-policy`)) != null;
  // EUR IS THE WHOLE POINT. A store serving another currency to a Spanish
  // shopper would have its numbers filed as EUR cents by the importer, which is
  // worse than not tracking it at all — a wrong price outranks a right one.
  const ok = cur.cur === "EUR";
  return {
    name, base, ok,
    reason: ok ? "ok" : `serves ${cur.cur} to a ?country=${CC} shopper, not EUR`,
    currency: cur.cur, currencyAgrees: cur.agrees, singles, inStock, total,
    handles: d.handles, sample, shippingPolicy,
  };
}

// Run `limit` probes at a time — enough to finish a 200-store sweep in minutes,
// low enough that this never looks like an attack on any one host (each store is
// hit sequentially inside its own probe; the parallelism is ACROSS stores).
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// Eurozone member states — the market's membership, used to filter the registry.
const EUROZONE = new Set(["AT","BE","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES"]);
const REGISTRY = "https://api.riftbound.uvsgames.com/api/v2/game-stores/?game_id=3&page_size=200&page=";
// Store "websites" that are not webshops. A social profile is a real contact
// channel and a useless scrape target, and roughly half the registry's website
// field is one of these.
const NOT_A_SHOP = /facebook|instagram|linktr|whatsapp|tiktok|twitter|youtube|discord|google\.com|maps\.app/i;

async function registryStores(): Promise<{ name: string; base: string }[]> {
  const first = await fetchJson<any>(REGISTRY + "1");
  if (!first) throw new Error("registry unreachable");
  const pages = Math.ceil(first.total / 200);
  console.log(`Official registry: ${first.total} stores worldwide, ${pages} pages …`);
  const all: any[] = [...first.results];
  for (let p = 2; p <= pages; p++) {
    const r = await fetchJson<any>(REGISTRY + p);
    if (r?.results) all.push(...r.results);
  }
  const byHost = new Map<string, { name: string; base: string }>();
  for (const row of all) {
    const s = row?.store ?? {};
    if (!EUROZONE.has(String(s.country ?? "").toUpperCase())) continue;
    const w = String(s.website ?? "").trim();
    if (!w || NOT_A_SHOP.test(w)) continue;
    const host = w.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (!host.includes(".")) continue;
    if (!byHost.has(host)) byHost.set(host, { name: String(s.name ?? host), base: `https://${host}` });
  }
  console.log(`${byHost.size} unique eurozone shop domains in the registry.`);
  return [...byHost.values()];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(45000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

async function main() {
  const file = process.argv[2];
  const stores: { name: string; base: string }[] =
    file === "--registry"
      ? await registryStores()
      : file
      ? JSON.parse(readFileSync(file, "utf8")).map((c: any) => ({ name: c.name, base: String(c.base).replace(/\/$/, "") }))
      : RETAILER_LIST.filter((r) => r.country === "EU").map((r) => ({ name: r.name, base: r.base }));

  console.log(`Probing ${stores.length} store(s) with ?country=${CC} …\n`);
  const results = await pool(stores, 8, (s) => probe(s.name, s.base));
  const good = results.filter((r) => r.ok).sort((a, b) => b.singles - a.singles);

  for (const r of good) {
    console.log(
      `${r.name.padEnd(28)} ✓ cur=${r.currency}${r.currencyAgrees ? "" : "(page≠feed)"} ` +
      `policy=${r.shippingPolicy ? "y" : "n"} singles=${String(r.singles).padStart(4)} ` +
      `inStock=${String(r.inStock).padStart(4)} (of ${String(r.total).padStart(4)})` +
      `  [${r.handles.slice(0, 3).join(",")}]  e.g. ${r.sample}`,
    );
  }
  console.log(`\n── rejected ──`);
  for (const r of results.filter((x) => !x.ok)) console.log(`${r.name.padEnd(28)} ✗ ${r.reason}`);
  console.log(`\n${good.length} of ${stores.length} clear the ${MIN_SINGLES_FOR_STORE}+ in-stock-singles bar.`);
  // Machine-readable, so a retailers.ts block can be generated from a real run
  // rather than hand-transcribed off the log.
  console.log(`\n──JSON──\n${JSON.stringify(good, null, 1)}`);
}

main();
