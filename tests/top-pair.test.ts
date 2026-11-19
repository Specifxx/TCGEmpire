import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { paidPair, pctMore } from "../src/lib/top-pair";

// The top-pair A/B (2026-11-19, DECISIONS.md "eBay and TCGplayer as two buttons under the phone's Buy").

const paid = (href: string) => href.startsWith("paid:");
const row = (priceCents: number, retailer: string, href: string, isFoil = false) => ({ priceCents, retailer, buyHref: href, isFoil });

test("an unpaid store is cheapest: eBay's and TCGplayer's own cheapest rows within 20%", () => {
  const prices = [row(1000, "shop_a", "store:a"), row(1050, "tcgplayer", "paid:t1"), row(1100, "ebay_us", "paid:e1"), row(1150, "tcgplayer", "paid:t2")];
  const pair = paidPair(prices, paid);
  assert.ok(pair);
  assert.equal(pair.tcg, prices[1]);
  assert.equal(pair.ebay, prices[2]);
});

test("nothing when the cheapest row already pays, or no marketplace is within 20%", () => {
  assert.equal(paidPair([row(1000, "tcgplayer", "paid:t"), row(1100, "ebay_us", "paid:e")], paid), null);
  assert.equal(paidPair([row(1000, "shop_a", "store:a"), row(1300, "ebay_us", "paid:e")], paid), null);
});

test("one side alone is fine, and a foil is never offered against a non-foil", () => {
  const pair = paidPair([row(1000, "shop_a", "store:a"), row(1010, "ebay_us", "paid:e", true), row(1100, "ebay_us", "paid:e2")], paid);
  assert.ok(pair);
  assert.equal(pair.ebay?.buyHref, "paid:e2");
  assert.equal(pair.tcg, null);
});

test("pctMore", () => {
  assert.equal(pctMore(1080, 1000), "+8%");
  assert.equal(pctMore(1000, 1000), "");
});

test("the top block keeps the cheapest's Buy and draws the pair only in arm pair, never on the server", () => {
  const src = readFileSync(join(process.cwd(), "src/components/CardMobileBuy.tsx"), "utf8");
  assert.match(src, /useState<TopArm>\("line"\)/);
  assert.match(src, /surface="card_top_buy"/);
  assert.match(src, /surface="card_top_pair"/);
  assert.match(src, /alt && !showPair/);
  const out = readFileSync(join(process.cwd(), "src/components/OutboundLink.tsx"), "utf8");
  assert.match(out, /top_arm: topArmNow\(\)/);
});
