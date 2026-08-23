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
export {}; // module scope — avoids global-name collisions with other probe scripts
import { readFileSync } from "node:fs";
import { SCRAPE_HEADERS as UA, robotsAllows } from "../src/lib/scrape-http";
import { EU_ANCHOR_ISO } from "../src/lib/country";
import { RETAILER_LIST } from "../src/lib/retailers";

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
  currency: string; currencyAgrees: boolean; inStock: number; total: number;
  handles: string[]; sample: string; shippingPolicy: boolean;
}

async function probe(name: string, base: string): Promise<ProbeResult> {
  const blank = { name, base, currency: "n/a", currencyAgrees: false, inStock: 0, total: 0, handles: [] as string[], sample: "", shippingPolicy: false };
  const d = await discover(base);
  if (!d.isShopify) return { ...blank, ok: false, reason: "not Shopify (no /sitemap.xml)" };
  if (!d.robotsOk) return { ...blank, ok: false, reason: "robots.txt disallows the products.json feed" };
  if (!d.handles.length) return { ...blank, ok: false, reason: d.anyRiftbound ? "Shopify, riftbound sealed-only" : "Shopify, no riftbound collection" };

  let inStock = 0, total = 0, sample = "", firstHandle = "", firstPrice = "";
  for (const h of d.handles.slice(0, 6)) {
    for (let page = 1; page <= 6; page++) {
      const j = await fetchText(`${base}/collections/${h}/products.json?country=${CC}&limit=250&page=${page}`);
      if (!j) break;
      let arr: any[]; try { arr = JSON.parse(j).products; } catch { break; }
      if (!arr || !arr.length) break;
      total += arr.length;
      for (const p of arr) {
        const v = (p.variants || []).find((v: any) => v.available);
        if (!v) continue;
        inStock++;
        if (!sample) { sample = `${String(p.title).slice(0, 30)} €${v.price}`; firstHandle = p.handle; firstPrice = v.price; }
      }
      if (arr.length < 250) break;
    }
  }
  if (!inStock) return { ...blank, ok: false, reason: `no in-stock singles (${total} products listed)`, total, handles: d.handles };

  const cur = await provenCurrency(base, firstHandle, firstPrice);
  const shippingPolicy = (await fetchText(`${base}/policies/shipping-policy`)) != null;
  // EUR IS THE WHOLE POINT. A store serving another currency to a Spanish
  // shopper would have its numbers filed as EUR cents by the importer, which is
  // worse than not tracking it at all — a wrong price outranks a right one.
  const ok = cur.cur === "EUR";
  return {
    name, base, ok,
    reason: ok ? "ok" : `serves ${cur.cur} to a ?country=${CC} shopper, not EUR`,
    currency: cur.cur, currencyAgrees: cur.agrees, inStock, total,
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

async function main() {
  const file = process.argv[2];
  const stores: { name: string; base: string }[] = file
    ? JSON.parse(readFileSync(file, "utf8")).map((c: any) => ({ name: c.name, base: String(c.base).replace(/\/$/, "") }))
    : RETAILER_LIST.filter((r) => r.country === "EU").map((r) => ({ name: r.name, base: r.base }));

  console.log(`Probing ${stores.length} store(s) with ?country=${CC} …\n`);
  const results = await pool(stores, 8, (s) => probe(s.name, s.base));
  const good = results.filter((r) => r.ok).sort((a, b) => b.inStock - a.inStock);

  for (const r of good) {
    console.log(
      `${r.name.padEnd(28)} ✓ cur=${r.currency}${r.currencyAgrees ? "" : "(page≠feed)"} ` +
      `policy=${r.shippingPolicy ? "y" : "n"} inStock=${String(r.inStock).padStart(4)} (of ${String(r.total).padStart(4)})` +
      `  [${r.handles.slice(0, 3).join(",")}]  e.g. ${r.sample}`,
    );
  }
  console.log(`\n── rejected ──`);
  for (const r of results.filter((x) => !x.ok)) console.log(`${r.name.padEnd(28)} ✗ ${r.reason}`);
  console.log(`\n${good.length} of ${stores.length} usable.`);
  // Machine-readable, so a retailers.ts block can be generated from a real run
  // rather than hand-transcribed off the log.
  console.log(`\n──JSON──\n${JSON.stringify(good, null, 1)}`);
}

main();
