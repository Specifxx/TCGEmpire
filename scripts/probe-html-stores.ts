// Probe for BIGCOMMERCE / SHOPWARE stores — the sibling of probe-woocommerce-stores.ts
// for stores read from their category pages (lib/storefront-html.ts).
//
// Proves, to the same standard as the other probes: the category path answers
// with a server-rendered product grid, robots.txt permits it, which currency
// the page states, how many products are in stock, and how many of those are
// SINGLES (isSinglesTitle) rather than sealed — the number that decides whether
// a store is worth adding to RETAILERS. Read-only (no DB).
//
//   npx tsx scripts/probe-html-stores.ts candidates.json
//   candidates: [{ name, base, country, platform: "bigcommerce"|"shopware", paths: ["/tcgs/riftbound/riftbound-singles/"] }]
export {};
import { readFileSync } from "node:fs";
import { currencyOf } from "../src/lib/country";
import { fetchHtmlCategory, type HtmlPlatform } from "../src/lib/storefront-html";
import { isSinglesTitle } from "../src/lib/woocommerce";

interface Candidate { name: string; base: string; country: "AU" | "US" | "UK" | "SG" | "CA" | "EU"; platform: HtmlPlatform; paths: string[] }

async function main() {
  const file = process.argv[2];
  const stores: Candidate[] = JSON.parse(readFileSync(file, "utf8"));
  for (const s of stores) {
    const currency = currencyOf(s.country);
    console.log(`\n== ${s.name} (${s.base}, ${s.country} ${currency}, ${s.platform})`);
    for (const path of s.paths) {
      const { products, failed } = await fetchHtmlCategory(s.base, path, s.platform, currency, 12);
      const stated = products.find((p) => p.currency)?.currency ?? "?";
      const inStock = products.filter((p) => p.variants.some((v) => v.available));
      const singles = inStock.filter((p) => isSinglesTitle(p.title));
      console.log(`  ${failed ? "✗" : "✓"} ${path}  products=${products.length} inStock=${inStock.length} singles=${singles.length} stated=${stated}`);
      for (const p of [...singles.slice(0, 4), ...inStock.filter((p) => !isSinglesTitle(p.title)).slice(0, 4)]) {
        console.log(`      ${p.title.slice(0, 70).padEnd(70)} ${p.variants[0].price} ${p.url}`);
      }
    }
  }
}

main();
