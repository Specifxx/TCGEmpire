import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { affiliateUrl, ebayAffiliateUrl } from "../src/lib/affiliate";

// The homepage's eBay pass (DECISIONS.md, "The homepage's eBay column",
// 2026-09-26): an eBay button on every row of "Riftbound card prices today",
// "Cheapest on eBay" first in Today's Top Deals, the "Most popular" shelf back,
// and eBay Picks clicks that name their page.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Source without comments, so a comment quoting a banned word cannot fail a test
// and a comment cannot satisfy one.
const code = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("Cheapest on eBay left Today's Top Deals for Deal Finder (2026-09-30)", () => {
  const src = read("src/components/TodaysTopDeals.tsx");
  assert.doesNotMatch(src, /<CheapestOnEbay\b/);
  assert.match(read("src/app/tools/deal-finder/page.tsx"), /<CheapestOnEbay\b/);
});

test("the Most popular shelf is back and carries the ItemList on every home", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    assert.match(code(f), /popularCards=\{popularCards\}/, f);
  }
  // No home has a price table any more (2026-10-02), so the shelf always carries it.
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    assert.match(code(f), /\bpopularItemList\n\s*showTopDeals=\{false\}/, f);
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

// Owner, 2026-09-30: "Remove the plus tags on both biggest savings and rising
// cards. Get rid of cheapest sealed."
test("Today's Top Deals: no Cheapest sealed column, no tier chip on the gated columns", () => {
  const src = read("src/components/TodaysTopDeals.tsx");
  const cols = src.slice(src.indexOf("const COLUMNS: ColumnDef[] = ["), src.indexOf("];", src.indexOf("const COLUMNS: ColumnDef[] = [")));
  assert.doesNotMatch(cols, /cheapestSealed/);
  assert.match(cols, /savingsVsMarket/);
  assert.match(cols, /risingCards/);
  assert.doesNotMatch(src, /<span className="chip bg-gold\/20 text-gold">/);
});
