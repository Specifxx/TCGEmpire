import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cheapestEbayItemByCard, PRICE_TABLE_SIZE } from "../src/lib/price-table";
import { affiliateUrl, ebayAffiliateUrl } from "../src/lib/affiliate";

// The homepage's eBay pass (DECISIONS.md, "The homepage's eBay column",
// 2026-09-26): an eBay button on every row of "Riftbound card prices today",
// "Cheapest on eBay" first in Today's Top Deals, the "Most popular" shelf back,
// and eBay Picks clicks that name their page.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Source without comments, so a comment quoting a banned word cannot fail a test
// and a comment cannot satisfy one.
const code = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("cheapestEbayItemByCard keeps the lowest item price per card", () => {
  const best = cheapestEbayItemByCard([
    { cardId: "a", priceCents: 500, url: "https://www.ebay.com/itm/1" },
    { cardId: "a", priceCents: 300, url: "https://www.ebay.com/itm/2" },
    { cardId: "b", priceCents: 900, url: "https://www.ebay.com/itm/3" },
    { cardId: "a", priceCents: 300, url: "https://www.ebay.com/itm/4" },
  ]);
  assert.deepEqual(best.get("a"), { priceCents: 300, url: "https://www.ebay.com/itm/2" }, "first seen wins a tie");
  assert.deepEqual(best.get("b"), { priceCents: 900, url: "https://www.ebay.com/itm/3" });
  assert.equal(best.size, 2);
});

test("the table's eBay read is scoped, bounded, inside the table's own cache, and never cross-border", () => {
  const src = code("src/lib/price-table.ts");
  assert.match(src, /const TABLE_EBAY_KEY: Partial<Record<Country, string>> = \{ AU: "ebay", US: "ebay_us", UK: "ebay_uk", SG: "ebay_sg", EU: "ebay_eu" \};/);
  assert.doesNotMatch(src, /ebay_ca/, "Canada's eBay rows are US listings with unquoted postage");
  const read_ = src.slice(src.indexOf("function readTableEbay"), src.indexOf("async function computePriceTable"));
  assert.match(read_, /where: \{ cardId: \{ in: ids \}, country, retailer, inStock: true \}/);
  assert.match(read_, /select: \{ cardId: true, priceCents: true, url: true \}/);
  assert.match(read_, /take: PRICE_TABLE_SIZE \* 4/);
  assert.match(read_, /\.catch\(/, "fails open");
  assert.equal(PRICE_TABLE_SIZE, 15);
  assert.match(src, /readTableEbay\(ids, country\)/, "read inside computePriceTable, i.e. inside its unstable_cache");
  assert.match(src, /\["home-price-table-v3", country\]/, "a new key: the cached value's shape changed");
  assert.doesNotMatch(src, /getCheapestOnEbay\(|getEbayRowsMemoized\(|minByCard\(/, "no self-cached loader inside this cache (db.ts rule 6)");
  // "Cheapest" can never read above the eBay figure beside it.
  assert.match(src, /priceCents: Math\.min\(c\[field\] as number, ebayBest\.get\(c\.id\)\?\.priceCents \?\? Infinity\)/);
});

test("PriceTodayTable: an eBay button on every row, disclosed above the first, never nested in the row link", () => {
  const t = code("src/components/home/PriceTodayTable.tsx");
  // The five pinned headers stay; eBay is a sixth, last column.
  for (const col of ["Card", "Set", "Cheapest", "Stores in stock", "7-day change", "eBay"]) assert.ok(t.includes(`>${col}</th>`), col);
  assert.ok(t.indexOf(">7-day change</th>") < t.indexOf(">eBay</th>"), "eBay after our own data");
  // Disclosure before the rows, for everyone (no premium check anywhere here).
  const disclosure = t.indexOf('<AffiliateDisclosure partner="ebay" tight />');
  const firstRows = t.indexOf("<ul ");
  assert.ok(disclosure > 0 && disclosure < firstRows, "the EPN disclosure sits above the first row");
  assert.doesNotMatch(t, /usePremium|adFree|data-ad-placement/, "a buy path, shown to every visitor");
  // Phone rows: the card link closes before the eBay button opens.
  const li = t.slice(t.indexOf("<li key={r.id}"), t.indexOf("</li>"));
  assert.ok(li.indexOf("</Link>") > 0 && li.indexOf("</Link>") < li.indexOf("{ebayCell(r, i)}"), "sibling links, never nested");
  // Both layouts render the same cell.
  assert.equal(t.split("{ebayCell(r, i)}").length - 1, 2);
  assert.match(t, /affiliateUrl\(r\.ebay\.url, "home_table", homePath\)/, "the listing link names its page to EPN");
  // The footnote says what the column is and claims nothing it cannot back.
  assert.match(t, /eBay: the cheapest in-stock listing we track for each card in this market \(item price, postage extra\)/);
  assert.doesNotMatch(t, /cheaper on eBay|\blive\b|guarantee|gold/i);
  // Phones: the key line is CSS-hidden, not removed.
  assert.match(t, /<span className="hidden sm:inline">\s*Updated daily\./);
});

test("PriceRowEbay: a direct listing only in the page's market, the visitor's own eBay otherwise, filled only when lowest", () => {
  const c = code("src/components/home/PriceRowEbay.tsx");
  assert.match(c, /const \{ country \} = useCountry\(\);/);
  assert.match(c, /const direct = listing && country === pageCountry \? listing : null;/);
  assert.match(c, /const lowest = direct != null && direct\.priceCents <= cheapestCents;/);
  assert.match(c, /ebaySearchUrl\(country, riftboundEbayQuery\(searchName\), "home-table"\)/);
  assert.match(c, /surface="price_table_ebay"/);
  assert.match(c, /pageType="homepage"/);
  assert.match(c, /\$\{lowest \? "btn-ebay" : "btn-ebay-ghost"\} w-\[4\.75rem\]/, "fixed width: the search → listing swap cannot shift the row");
  assert.match(c, /\{price \?\? "Search"\}/, "a search never shows a price");
  // WCAG 2.5.3: the accessible name starts with the visible words ("eBay
  // Search"), so no aria-label, a real space between the spans, an sr-only tail.
  assert.doesNotMatch(c, /aria-label=/);
  assert.match(c, /<span className="font-extrabold">eBay<\/span>\{" "\}\s*<span className="num font-semibold">/);
  assert.match(c, /<span className="sr-only">/);
  assert.doesNotMatch(c, /usePremium|gold|cheaper|guarantee/i);
  assert.match(read("src/components/OutboundLink.tsx"), /\| "price_table_ebay"/);
});

test("Cheapest on eBay opens Today's Top Deals", () => {
  const src = read("src/components/TodaysTopDeals.tsx");
  const heading = src.indexOf("Today&apos;s Top Deals</h2>");
  const block = src.indexOf("<CheapestOnEbay rows={ebayRows}");
  const pills = src.indexOf('role="tablist" aria-label="Filter deals by price"');
  assert.ok(heading > 0 && heading < block && block < pills);
});

test("the Most popular shelf is back, and the price table keeps the only ItemList for those cards", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    const src = code(f);
    assert.match(src, /popularCards=\{popularCards\}/, f);
    assert.match(src, /popularItemList=\{priceTable\.length === 0\}/, f);
  }
  const home = code("src/components/home/HomeSections.tsx");
  assert.match(home, /popularItemList = true,/);
  assert.match(home, /\.\.\.\(popularItemList && popularCards\.length > 0/);
  assert.match(read("src/components/home/PopularCardsCarousel.tsx"), /label: "Most popular",/);
});

test("eBay Picks clicks name their page to EPN, and an unknown page keeps the stored URL", () => {
  const c = code("src/components/EbayPicksLive.tsx");
  assert.match(c, /const PICKS_PAGE: Record<string, string> = \{ homepage: "\/", browse: "\/browse", set_hub: "\/sets", article: "\/blog" \};/);
  assert.match(c, /href=\{pageType && PICKS_PAGE\[pageType\] \? affiliateUrl\(l\.url, `picks_\$\{l\.country\.toLowerCase\(\)\}`, PICKS_PAGE\[pageType\]\) : l\.url\}/);
  assert.match(read("src/components/ArticleView.tsx"), /<EbayPicks\s+className="mt-8"\s+pageType="article"/);
  assert.match(read("src/app/sets/[set]/page.tsx"), /<EbayPicks\s+pageType="set_hub"/);
});

test("a Singapore Picks click still says Singapore to EPN after the re-tag", () => {
  // Stored at import: an ebay.com.sg listing is rerouted to www.ebay.com with
  // customid rc-sg (lib/affiliate.ts). Re-tagging rebuilds the id from rc-us,
  // so the Picks source has to carry the market.
  const stored = ebayAffiliateUrl("https://www.ebay.com.sg/itm/137597929650");
  assert.equal(new URL(stored).hostname, "www.ebay.com");
  assert.match(new URL(stored).searchParams.get("customid") ?? "", /^rc-sg\b/);
  const sg = new URL(affiliateUrl(stored, "picks_sg", "/")).searchParams.get("customid") ?? "";
  const us = new URL(affiliateUrl(ebayAffiliateUrl("https://www.ebay.com/itm/137597929650"), "picks_us", "/")).searchParams.get("customid") ?? "";
  assert.match(sg, /picks_sg-home/);
  assert.notEqual(sg, us, "Singapore and US Picks clicks stay separable");
});
