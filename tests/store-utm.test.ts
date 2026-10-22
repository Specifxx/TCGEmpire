import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateUrl } from "../src/lib/affiliate";

test("plain store links carry our UTM tags; affiliate links don't", () => {
  const u = new URL(affiliateUrl("https://shop.example.com/products/x?variant=1", "shop", "https://riftcompare.com/card/abc"));
  assert.equal(u.searchParams.get("utm_source"), "riftcompare");
  assert.equal(u.searchParams.get("utm_medium"), "referral");
  assert.equal(u.searchParams.get("utm_campaign"), "card");
  assert.equal(u.searchParams.get("variant"), "1");
  assert.ok(!affiliateUrl("https://www.ebay.com.au/itm/1").includes("utm_source=riftcompare"));
  assert.ok(affiliateUrl("https://s.example.com/p?utm_source=x").includes("utm_source=x"));
});
