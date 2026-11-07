import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURED_LISTINGS, featuredListingFor, homeFeaturedListing } from "../src/lib/featured-listings";

// A featured eBay listing on a card page (owner, 2026-10-19). DECISIONS.md,
// "A featured eBay listing on a card page".
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("the Seraphine Signature auction is featured on the homes and its card until it ends (owner, 2026-11-07)", () => {
  const slug = "seraphine-starry-eyed-songstress-rad-174s-167";
  const before = Date.parse("2026-11-11T08:01:19Z");
  const after = Date.parse("2026-11-11T08:01:20Z");
  assert.equal(homeFeaturedListing(before)?.itemId, "117507452881");
  assert.equal(featuredListingFor(slug, before)?.itemId, "117507452881");
  assert.equal(homeFeaturedListing(after), null, "gone the second the auction ends");
  assert.equal(featuredListingFor(slug, after), null);
});

test("the box hides itself in the browser at the end time, and both homes mount it", () => {
  const box = read("src/components/FeaturedListingBox.tsx");
  assert.match(box, /^"use client";/);
  assert.match(box, /now >= endAt\) return null/);
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    assert.match(read(f), /<HomeFeaturedListing \/>/, f);
  }
});

test("every entry is an eBay listing with a dated price check and an end date", () => {
  for (const f of FEATURED_LISTINGS) {
    assert.match(f.url, /^https:\/\/www\.ebay\.[a-z.]+\/itm\/\d+$/);
    assert.ok(f.url.endsWith(f.itemId));
    assert.match(f.retailer, /^ebay_/);
    assert.ok(Date.parse(f.checked) < Date.parse(f.until));
    if (f.endsAt) assert.ok(Date.parse(f.endsAt) < Date.parse(`${f.until}T00:00:00Z`), "until never outlasts the listing by more than a day");
    if (f.format === "auction") assert.ok(f.endsAt, "an auction carries its end time");
  }
});

test("the box is labelled, affiliate-tagged, dated, and sits apart from the comparison", () => {
  const box = read("src/components/FeaturedListingBox.tsx");
  assert.match(box, />Featured listing</);
  assert.match(box, /<PaidLinkTag /);
  assert.match(box, /Not part of the comparison/);
  assert.match(box, /affiliateUrl\(listing\.url/);
  assert.match(box, /at our check on \{checked\}/);
  const page = read("src/app/card/[id]/page.tsx");
  assert.ok(page.indexOf("<FeaturedListingBox") < page.indexOf("<CardPriceComparison"), "above the comparison");
  assert.doesNotMatch(read("src/components/CardMarketSection.tsx"), /featured/i, "never a row of it");
});

test("the quick view shows the same featured listing, from the same list", () => {
  const qv = read("src/components/QuickView.tsx");
  assert.match(qv, /featuredListingFor\(card\.slug\)/);
  assert.match(qv, /<FeaturedListingBox listing=\{featured\}/);
});
