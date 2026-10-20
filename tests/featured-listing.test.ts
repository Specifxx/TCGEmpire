import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURED_LISTINGS, featuredListingFor } from "../src/lib/featured-listings";

// A featured eBay listing on a card page (owner, 2026-10-19). DECISIONS.md,
// "A featured eBay listing on a card page".
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("the Seraphine Signature listing is featured on its own card page until it lapses", () => {
  const f = featuredListingFor("seraphine-starry-eyed-songstress-rad-174s-167", Date.parse("2026-10-21T00:00:00Z"));
  assert.equal(f?.itemId, "117475654360");
  assert.equal(featuredListingFor("seraphine-starry-eyed-songstress-rad-174-167", Date.parse("2026-10-21T00:00:00Z")), null, "only that printing");
  assert.equal(featuredListingFor(f!.cardSlug, Date.parse(`${f!.until}T00:00:00Z`)), null, "lapses on its until date");
});

test("every entry is an eBay listing with a dated price check and an end date", () => {
  for (const f of FEATURED_LISTINGS) {
    assert.match(f.url, /^https:\/\/www\.ebay\.[a-z.]+\/itm\/\d+$/);
    assert.ok(f.url.endsWith(f.itemId));
    assert.match(f.retailer, /^ebay_/);
    assert.ok(Date.parse(f.checked) < Date.parse(f.until));
  }
});

test("the box is labelled, affiliate-tagged, dated, and sits apart from the comparison", () => {
  const box = read("src/components/FeaturedListingBox.tsx");
  assert.match(box, />Featured listing</);
  assert.match(box, /<PaidLinkTag /);
  assert.match(box, /Not part of the price comparison below/);
  assert.match(box, /affiliateUrl\(listing\.url/);
  assert.match(box, /at our check on \{checked\}/);
  const page = read("src/app/card/[id]/page.tsx");
  assert.ok(page.indexOf("<FeaturedListingBox") < page.indexOf("<CardPriceComparison"), "above the comparison");
  assert.doesNotMatch(read("src/components/CardMarketSection.tsx"), /featured/i, "never a row of it");
});
