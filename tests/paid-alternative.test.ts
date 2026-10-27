import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PAID_ALTERNATIVE_BAND, paidAlternative, paidAlternativeName } from "../src/lib/paid-alternative";

// The phone Cheapest block's "or US$X on TCGplayer" line (2026-10-27,
// DECISIONS.md "The phone Cheapest block names the paid marketplace").

const paid = (href: string) => href.startsWith("paid:");
const row = (priceCents: number, href: string) => ({ priceCents, buyHref: href });

test("a store is cheapest and TCGplayer is within the band: name TCGplayer with how much more it is", () => {
  const prices = [row(1000, "store:a"), row(1050, "store:b"), row(1080, "paid:tcg")];
  const alt = paidAlternative(prices, paid);
  assert.ok(alt);
  assert.equal(alt.row, prices[2]);
  assert.equal(alt.pctMore, 8);
});

test("nothing when the cheapest row already pays, when no row pays, or past the band", () => {
  assert.equal(paidAlternative([row(1000, "paid:ebay"), row(900, "paid:tcg")], paid), null);
  assert.equal(paidAlternative([row(1000, "store:a"), row(1100, "store:b")], paid), null);
  assert.equal(paidAlternative([row(1000, "store:a"), row(1000 * PAID_ALTERNATIVE_BAND + 1, "paid:tcg")], paid), null);
  assert.equal(paidAlternative([], paid), null);
});

test("a tie reads as no difference, never as cheaper", () => {
  const alt = paidAlternative([row(1000, "store:a"), row(1000, "paid:tcg")], paid);
  assert.equal(alt?.pctMore, 0);
});

test("marketplace names", () => {
  assert.equal(paidAlternativeName("ebay_us", "eBay (seller123)"), "eBay");
  assert.equal(paidAlternativeName("tcgplayer", "TCGplayer"), "TCGplayer");
  assert.equal(paidAlternativeName("cherry", "Cherry Collectables"), "Cherry Collectables");
});

test("the line sits inside CardTopBuy only, measured by its own surface, and never re-sorts", () => {
  const src = readFileSync(join(process.cwd(), "src/components/CardMobileBuy.tsx"), "utf8");
  assert.match(src, /paidAlternative\(prices\)/);
  assert.match(src, /surface="card_top_alt"/);
  assert.match(src, /<PaidLinkTag/);
  assert.doesNotMatch(src, /\.sort\(/);
});
