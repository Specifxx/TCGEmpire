// Amazon's Creators API prices on the sealed pages (2026-11-05): fetched by a CDN-cached route at request time, matched by
// the sealed classifier, shown 24 hours with the time, never stored, never a store row or the best price.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { credentialsFor, itemsOf, pickListing, tokenEndpoint, type Item } from "../src/lib/amazon-creators";
import { amazonItemUrl, amazonTitleMatches, median, pickAmazonItem } from "../src/lib/amazon-live";

test("the token endpoint follows the credential version, else the store's home region", () => {
  assert.equal(tokenEndpoint("3.1", "AU"), "https://api.amazon.com/auth/o2/token");
  assert.equal(tokenEndpoint("3.3", "US"), "https://api.amazon.co.jp/auth/o2/token");
  assert.equal(tokenEndpoint(undefined, "UK"), "https://api.amazon.co.uk/auth/o2/token");
  assert.equal(tokenEndpoint(undefined, "AU"), "https://api.amazon.co.jp/auth/o2/token");
});

test("one credential serves every store: the AU-named variables are the default, a market's own win", () => {
  const au = { AMAZON_CREATORS_AU_CLIENT_ID: " a ", AMAZON_CREATORS_AU_CLIENT_SECRET: "b", AMAZON_CREATORS_AU_VERSION: "3.3" };
  assert.equal(credentialsFor("US", {}), null);
  assert.deepEqual(credentialsFor("AU", au), { id: "a", secret: "b", version: "3.3" });
  assert.deepEqual(credentialsFor("US", au), { id: "a", secret: "b", version: "3.3" });
  assert.deepEqual(credentialsFor("US", { ...au, AMAZON_CREATORS_US_CLIENT_ID: "u", AMAZON_CREATORS_US_CLIENT_SECRET: "v" }), { id: "u", secret: "v", version: "3.1" });
});

const listing = (amount: number, o: Partial<{ cond: string; avail: string; cur: string; box: boolean; seller: string }> = {}) => ({
  price: { money: { amount, currency: o.cur ?? "USD" } },
  condition: { value: o.cond ?? "New" },
  availability: { type: o.avail ?? "IN_STOCK" },
  isBuyBoxWinner: o.box,
  merchantInfo: { name: o.seller ?? "Amazon.com" },
});
const item = (...listings: ReturnType<typeof listing>[]): Item => ({ asin: "B000000001", offersV2: { listings } });

test("the shown price is the new, in-stock buy box in the store's currency, else the cheapest such listing", () => {
  assert.deepEqual(pickListing(item(listing(130), listing(125, { box: true })), "USD"), { amount: 125, seller: undefined });
  assert.deepEqual(pickListing(item(listing(130, { seller: "Card Shop" }), listing(128)), "USD"), { amount: 128, seller: undefined });
  assert.equal(pickListing(item(listing(10, { cond: "Used" })), "USD"), null, "used is never shown");
  assert.equal(pickListing(item(listing(10, { avail: "OUT_OF_STOCK" })), "USD"), null);
  assert.equal(pickListing(item(listing(10, { cur: "AUD" })), "USD"), null, "another currency is another store");
  assert.equal(pickListing({ asin: "B000000001", offersV2: null }, "USD"), null);
  assert.deepEqual(itemsOf({ searchResult: { items: [item()] } }).length, 1);
});

test("an Amazon title is this product only when the sealed classifier reads the same set and product type", () => {
  const box = { productType: "Booster Box", setCode: "OGN" };
  assert.ok(amazonTitleMatches("Riftbound League of Legends TCG: Origins Booster Box (24 packs)", box));
  assert.ok(!amazonTitleMatches("Riftbound Origins Booster Pack", box), "a pack is not the box");
  assert.ok(!amazonTitleMatches("Riftbound Origins Booster Case (6 boxes)", box), "a case is not the box");
  assert.ok(!amazonTitleMatches("Riftbound Spiritforged Booster Box", box), "another set");
  assert.ok(!amazonTitleMatches("Pokemon TCG Origins Booster Box", box), "another game");
  const items = [
    { asin: "B0CASE00001", title: "Riftbound Origins Booster Case (6 Booster Boxes)", price: 600 },
    { asin: "B0FAKE00001", title: "Riftbound League of Legends TCG Origins Booster Box", price: 400 },
    { asin: "B0BOX000001", title: "Riftbound League of Legends TCG Origins Booster Box", price: 115 },
  ];
  assert.deepEqual(pickAmazonItem(items, box, 10000), { asin: "B0BOX000001", cents: 11500 }, "the case and the fantasy price are passed over");
  assert.equal(pickAmazonItem(items.slice(0, 1), box, 10000), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), undefined);
});

test("an item link goes to Amazon's own page with the market's tag and the sub id", () => {
  assert.equal(amazonItemUrl("B0ABCDEFGH", "US", "amazon_sealed-sealed"), "https://www.amazon.com/dp/B0ABCDEFGH?tag=riftcompare-20&ascsubtag=amazon_sealed-sealed");
  assert.match(amazonItemUrl("B0ABCDEFGH", "AU", "x")!, /amazon\.com\.au\/dp\/.*tag=riftcompare-22/);
  assert.equal(amazonItemUrl("B0ABCDEFGH", "SG", "x"), null, "no Amazon Singapore");
  assert.equal(amazonItemUrl("not-an-asin", "US", "x"), null);
});

const walk = (d: string): string[] => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));

test("the Creators API client is reached only through lib/amazon-live.ts, only from the Amazon route; the credentials are named nowhere else", () => {
  for (const f of [...walk("src/app"), ...walk("src/components"), ...walk("src/lib")].filter((f) => /\.tsx?$/.test(f))) {
    const s = fs.readFileSync(f, "utf8");
    if (f !== "src/lib/amazon-creators.ts" && f !== "src/lib/amazon-live.ts") assert.ok(!/amazon-creators/.test(s), `${f} imports the Creators API client`);
    if (/from "@\/lib\/amazon-live"/.test(s)) assert.equal(f, "src/app/api/amazon/sealed/[slug]/route.ts", `${f} reads live Amazon prices`);
    if (!/^src\/lib\/(amazon-creators|ops\/checks)\.ts$/.test(f)) assert.ok(!/AMAZON_CREATORS/.test(s), `${f} names the credentials`);
  }
  const route = fs.readFileSync("src/app/api/amazon/sealed/[slug]/route.ts", "utf8");
  assert.match(route, /s-maxage=21600/, "the answer sits in the CDN six hours: four calls a day per product and market at most");
  assert.match(route, /X-Robots-Tag/);
  const slot = fs.readFileSync("src/components/AmazonLiveSlot.tsx", "utf8");
  assert.match(slot, /24 \* 3600_000/, "the browser shows a price under 24 hours old only");
  assert.match(slot, /accurate as of the date\/time indicated/, "Amazon's disclaimer beside the price");
});
