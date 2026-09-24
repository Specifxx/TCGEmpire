import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RETAILER_LIST } from "../src/lib/retailers";
import { SEALED_ONLY_STORES, PRODUCT_PAGE_STORES, parseProductPage } from "../src/lib/sealed-stores";
import { offerCurrencyOk, storeCurrency } from "../src/lib/offer-currency";
import { currencyOf, type Country } from "../src/lib/country";

// 1c, 2026-09-24: Sky Fox Games' CAD prices were shown as US$ for ten days,
// because a row's market IS its currency. DECISIONS.md, "Sold-out pre-orders
// ranked as the cheapest".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");

// Storefronts verified CAD-only (Shopify /cart.js "currency": "CAD"). Whatever
// market someone registers them in, they must never price in USD.
const KNOWN_CAD_HOSTS = ["skyfoxgames.com", "cryptmtg.com"];

test("no tracked store is configured into a market it cannot price in", () => {
  const all = [...RETAILER_LIST.map((r) => ({ key: r.key, country: (r.country ?? "AU") as Country })), ...SEALED_ONLY_STORES.map((s) => ({ key: s.key, country: s.country as Country }))];
  const wrong = all.filter((s) => storeCurrency(s.key) !== currencyOf(s.country));
  assert.deepEqual(wrong, [], "a store whose currency differs from its market's would be refused on every page");
});

test("a non-USD store never renders in the US market without conversion", () => {
  const stores = [...RETAILER_LIST, ...SEALED_ONLY_STORES] as { key: string; base?: string }[];
  for (const h of KNOWN_CAD_HOSTS) {
    const s = stores.find((x) => x.base && host(x.base) === h);
    if (!s) continue; // not tracked (yet) — nothing to render
    assert.equal(storeCurrency(s.key), "CAD", `${h} is a CAD storefront`);
    assert.equal(offerCurrencyOk(s.key, "US"), false, `${h} must be refused in the US market`);
    assert.equal(offerCurrencyOk(s.key, "CA"), true);
  }
  assert.equal(storeCurrency("skyfoxgames"), "CAD");
  assert.equal(offerCurrencyOk("skyfoxgames", "US"), false);
  // Marketplace sources write each market's own currency — never refused.
  assert.equal(offerCurrencyOk("ebay_us", "US"), true);
  assert.equal(offerCurrencyOk("tcgplayer", "US"), true);
  // Every US-market store that renders is USD.
  for (const s of [...RETAILER_LIST, ...SEALED_ONLY_STORES]) {
    if (offerCurrencyOk(s.key, "US") && ((s as { country?: string }).country ?? "AU") === "US") {
      assert.equal(storeCurrency(s.key), "USD", s.key);
    }
  }
});

test("the guard is applied where prices are read AND where they are written", () => {
  const sealed = read("src/lib/sealed-import.ts");
  assert.match(sealed, /if \(!offerCurrencyOk\(r\.retailer, country\)\) continue;/, "live sealed groups");
  assert.match(sealed, /storeCurrency\(store\.key\) !== currencyOf\(cc\)/, "sealed importer");
  assert.match(sealed, /page\.currency && page\.currency !== store\.currency/, "product-page importer checks the page's own currency");
  assert.match(read("src/lib/price-import.ts"), /if \(!offerCurrencyOk\(store\.key, cc\)\)/, "singles importer");
});

test("product pages: price, currency and availability come from the page's own schema.org data", () => {
  const bigcommerce = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Riftbound: League of Legends TCG: Radiance - Booster Box (PREORDER)","offers":{"@type":"Offer","price":"129.97","priceCurrency":"USD","availability" : "https://schema.org/PreOrder"}}</script>`;
  assert.deepEqual(parseProductPage(bigcommerce), {
    title: "Riftbound: League of Legends TCG: Radiance - Booster Box (PREORDER)",
    priceCents: 12997,
    currency: "USD",
    available: true,
    imageUrl: null,
  });
  // Magento: no Product JSON-LD, meta tags with content on the next line.
  const magento = `<meta property="og:title" content="Booster Box (24) | Radiance Riftbound"/>
    <meta property="product:price:amount"
          content="139.99"/>
    <meta property="product:price:currency"
          content="USD"/>
    <meta itemprop="availability"
          content="https://schema.org/OutOfStock">`;
  const mm = parseProductPage(magento);
  assert.equal(mm?.priceCents, 13999);
  assert.equal(mm?.available, false, "Miniature Market's box read as sold out, as its page says");
  assert.equal(parseProductPage("<html>no price</html>"), null);
  for (const s of PRODUCT_PAGE_STORES) assert.ok(s.crawlDelayMs >= 10_000, `${s.key} asks for Crawl-delay: 10`);
});
