import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_DAYS, featureEndsAt, isEbayShortLink, judgeItem, parseEbayItemLink } from "../src/lib/featured/core";

// Premium members feature their own eBay listings on /featured (owner,
// 2026-11-07). DECISIONS.md, "Premium members feature their own eBay listings".
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("links: one item on an eBay site we can tag, or nothing", () => {
  assert.deepEqual(parseEbayItemLink("https://www.ebay.com.au/itm/117507452881?var=&mkcid=16"), { host: "ebay.com.au", itemId: "117507452881" });
  assert.deepEqual(parseEbayItemLink("https://www.ebay.com/itm/Riftbound-Jinx-Signature/407214784944"), { host: "ebay.com", itemId: "407214784944" });
  assert.deepEqual(parseEbayItemLink("https://m.ebay.co.uk/itm/123456789012"), { host: "ebay.co.uk", itemId: "123456789012" });
  assert.equal(parseEbayItemLink("https://www.ebay.de/itm/123456789012"), null, "no EPN rotation for eBay DE");
  assert.equal(parseEbayItemLink("https://www.ebay.com.au/sch/i.html?_nkw=riftbound"), null, "a search is not a listing");
  assert.equal(parseEbayItemLink("https://evil.example/itm/123456789012"), null);
  assert.equal(parseEbayItemLink("javascript:alert(1)"), null);
  assert.ok(isEbayShortLink("https://ebay.io/m/dXigXF"));
  assert.ok(!isEbayShortLink("https://www.ebay.com.au/itm/117507452881"));
});

const NOW = Date.parse("2026-11-07T02:00:00Z");
const ADDED = NOW - 3600_000;
const auction = {
  title: "Riftbound Radiance Seraphine, Starry-Eyed Songstress SIGNATURE 174*/167",
  buyingOptions: ["AUCTION"],
  currentBidPrice: { value: "1526.00", currency: "AUD" },
  bidCount: 33,
  itemEndDate: "2026-11-11T08:01:20.000Z",
  image: { imageUrl: "https://i.ebayimg.com/images/g/w-MAAeSwrv1q1qc6/s-l1600.jpg" },
  seller: { username: "bc-cards" },
  itemLocation: { city: "Kellyville", stateOrProvince: "NSW", country: "AU" },
  condition: "Ungraded",
};

test("a live Riftbound listing goes live with eBay's own figures", () => {
  const v = judgeItem(auction, NOW, ADDED);
  assert.equal(v.status, "live");
  assert.equal(v.facts?.priceCents, 152600);
  assert.equal(v.facts?.format, "auction");
  assert.equal(v.facts?.bids, 33);
  assert.equal(v.facts?.location, "Kellyville, NSW, AU");
  const bin = judgeItem({ ...auction, buyingOptions: ["FIXED_PRICE"], price: { value: "4690.70", currency: "AUD" }, currentBidPrice: undefined }, NOW, ADDED);
  assert.equal(bin.status, "live");
  assert.equal(bin.facts?.priceCents, 469070);
});

test("everything else is refused or ended, from eBay's answer alone", () => {
  assert.equal(judgeItem(null, NOW, ADDED).status, "ended", "404: sold, ended or removed");
  assert.equal(judgeItem({ ...auction, title: "Pokemon Charizard PSA 10" }, NOW, ADDED).status, "rejected");
  assert.equal(
    judgeItem({ ...auction, title: "Seraphine Signature 174*", localizedAspects: [{ name: "Game", value: "Riftbound: League of Legends TCG" }] }, NOW, ADDED).status,
    "live",
    "eBay's own Game aspect counts",
  );
  assert.equal(judgeItem({ ...auction, image: undefined }, NOW, ADDED).status, "rejected");
  assert.equal(judgeItem({ ...auction, itemEndDate: "2026-11-07T01:00:00Z" }, NOW, ADDED).status, "ended");
  assert.equal(judgeItem({ ...auction, estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }] }, NOW, ADDED).status, "ended");
  assert.equal(judgeItem(auction, NOW, NOW - FEATURE_DAYS * 86_400_000).status, "ended", "30 days at most");
});

test("a live row stops at its listing's end or 30 days after it was added", () => {
  assert.equal(featureEndsAt("2026-11-11T08:01:20Z", "2026-11-07T00:00:00Z"), Date.parse("2026-11-11T08:01:20Z"));
  assert.equal(featureEndsAt(null, "2026-11-07T00:00:00Z"), Date.parse("2026-12-07T00:00:00Z"));
});

test("Premium only, checked by the sweep, purged after it, labelled the seller's own", () => {
  assert.match(read("src/lib/featured/server.ts"), /isPremium\(user, "premium"\)/);
  assert.match(read("src/lib/featured/check.ts"), /isPremium\(byId\.get\(r\.userId\), "premium"\)/, "taken down when Premium ends");
  assert.match(read("scripts/import-ebay-auctions.ts"), /checkFeaturedSubmissions\(\)/);
  assert.match(read(".github/workflows/refresh-auctions.yml"), /api\/cron\/featured-listings/);
  assert.match(read("src/components/FeaturedListingBox.tsx"), /The seller&apos;s own listing/);
  assert.doesNotMatch(read("src/app/featured/page.tsx"), /from "@\/lib\/ebay"/, "the page never calls eBay");
});
