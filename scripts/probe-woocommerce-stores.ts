// Market-scan probe for WOOCOMMERCE stores — the sibling of probe-eu-stores.ts,
// which only understands Shopify.
//
// WHY THIS EXISTS: the 2026-08-23 eurozone sweep found that Spain's Riftbound
// retail is overwhelmingly NOT on Shopify (~150 Spanish shops found, 9 usable),
// and WooCommerce was the largest blocked bucket by a wide margin. WooCommerce
// ships the WordPress **Store API** — /wp-json/wc/store/v1/* — which is designed
// to be read unauthenticated by a headless storefront, so it is the direct
// equivalent of Shopify's products.json and needs no key.
//
// WHAT IT PROVES, in the same order and to the same standard as the Shopify probe:
//   1. the Store API answers at all (a shop can disable it, and a 404 there is
//      indistinguishable from "no stock" unless it is checked separately);
//   2. robots.txt permits the endpoint;
//   3. a Riftbound product CATEGORY exists (or a search finds Riftbound products);
//   4. products are in stock;
//   5. currency_code is EUR — read off the API itself, which is strictly better
//      evidence than the Shopify path gets (there the currency has to be re-read
//      from a product page because products.json carries no currency at all);
//   6. how many of those products are SINGLES rather than sealed — the number
//      that decides whether a store is worth adding, since the singles importer
//      matches on collector numbers and sealed simply never matches.
//
// Read-only (no DB).
//   npx tsx scripts/probe-woocommerce-stores.ts                  # tracked Woo stores
//   npx tsx scripts/probe-woocommerce-stores.ts candidates.json  # a candidate file
export {}; // module scope — avoids global-name collisions with other probe scripts
import { readFileSync } from "node:fs";
import { SCRAPE_HEADERS as UA, robotsAllows } from "../src/lib/scrape-http";
import { RETAILER_LIST } from "../src/lib/retailers";
import { WOO_STORE_API, decodeEntities, wooPriceString, isSinglesTitle, type WooProduct } from "../src/lib/woocommerce";

const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection|sobre|caja|mazo|display|deck|torneo|evento|ticket|entrada/i;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

interface WooCategory { id: number; name: string; slug: string; count: number }

async function riftboundCategories(base: string): Promise<WooCategory[]> {
  const out: WooCategory[] = [];
  for (let page = 1; page <= 5; page++) {
    const cats = await fetchJson<WooCategory[]>(`${base}${WOO_STORE_API}/products/categories?per_page=100&page=${page}`);
    if (!cats || !cats.length) break;
    out.push(...cats);
    if (cats.length < 100) break;
  }
  // Match on BOTH name and slug: Spanish shops routinely slug a category in
  // Spanish ("cartas-sueltas-riftbound") but also name it in English, and vice
  // versa. Require "riftbound", never bare "rift" — Pokémon's "Paradox Rift"
  // would otherwise match on every one of these shops.
  return out.filter((c) => /riftbound/i.test(`${c.name} ${c.slug}`));
}

async function productsIn(base: string, query: string): Promise<WooProduct[]> {
  const out: WooProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const ps = await fetchJson<WooProduct[]>(`${base}${WOO_STORE_API}/products?per_page=100&page=${page}&${query}`);
    if (!ps || !ps.length) break;
    out.push(...ps);
    if (ps.length < 100) break;
  }
  return out;
}

async function probe(name: string, base: string): Promise<string> {
  const allowed = await robotsAllows(base);
  if (!allowed(`${WOO_STORE_API}/products`)) return `${name.padEnd(28)} ✗ robots.txt disallows the Store API`;

  // One cheap call decides whether this is even a Woo store with the API on.
  const ping = await fetchJson<WooProduct[]>(`${base}${WOO_STORE_API}/products?per_page=1`);
  if (!ping) return `${name.padEnd(28)} ✗ no WooCommerce Store API (not Woo, or the API is disabled)`;

  const cats = await riftboundCategories(base);
  let products: WooProduct[] = [];
  const singleCats = cats.filter((c) => !NON_SINGLE.test(`${c.name} ${c.slug}`));
  for (const c of singleCats) products.push(...(await productsIn(base, `category=${c.id}`)));
  // Fallback: no usable category, so ask the search index directly. Kept separate
  // from the category path because search matches the DESCRIPTION too and pulls in
  // "compatible with Riftbound" accessories — fine as a last resort, wrong as a default.
  if (!products.length) products = await productsIn(base, `search=riftbound`);

  const seen = new Set<number>();
  products = products.filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (!products.length) {
    return `${name.padEnd(28)} ~ Woo API ok; riftbound: ${cats.length ? `${cats.length} cat(s), 0 products` : "none"}`;
  }

  const cur = products.find((p) => p.prices?.currency_code)?.prices?.currency_code ?? "?";
  const inStock = products.filter((p) => p.is_in_stock);
  const singles = inStock.filter((p) => isSinglesTitle(decodeEntities(p.name)));
  const variable = products.filter((p) => p.prices?.price_range).length;
  const sample = singles[0] ?? inStock[0];
  const sampleStr = sample ? `${decodeEntities(sample.name).slice(0, 34)} €${wooPriceString(sample)}` : "";
  const flag = cur === "EUR" ? "✓" : "✗";
  return (
    `${name.padEnd(28)} ${flag} cur=${cur} cats=${String(singleCats.length).padStart(2)} ` +
    `singles=${String(singles.length).padStart(4)} inStock=${String(inStock.length).padStart(4)} ` +
    `(of ${String(products.length).padStart(4)}, ${variable} variable)  e.g. ${sampleStr}`
  );
}

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
    : RETAILER_LIST.filter((r) => r.platform === "woocommerce").map((r) => ({ name: r.name, base: r.base }));

  console.log(`Probing ${stores.length} store(s) via the WooCommerce Store API …\n`);
  const lines = await pool(stores, 8, (s) => probe(s.name, s.base));
  for (const l of lines.filter((x) => x.includes("✓"))) console.log(l);
  console.log("\n── no singles / wrong currency / not Woo ──");
  for (const l of lines.filter((x) => !x.includes("✓"))) console.log(l);
}

main();
