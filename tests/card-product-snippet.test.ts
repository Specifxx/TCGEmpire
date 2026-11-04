import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026-11-04 (DECISIONS.md, "Rift card pages are Product snippets, not Merchant
// listings"): the card page's Product markup carries ONE AggregateOffer and no
// per-store Offer nodes. A seller-bearing Offer made Google file every priced
// card page as a merchant listing and reject the AggregateOffer beside it.
test("the card page's JSON-LD offers are an AggregateOffer only", () => {
  const src = readFileSync(join(process.cwd(), "src/app/card/[id]/page.tsx"), "utf8");
  const start = src.indexOf("const offersLd = [");
  const end = src.indexOf("];", start);
  assert.ok(start > 0 && end > start, "offersLd block not found");
  const block = src.slice(start, end);
  assert.match(block, /"@type": "AggregateOffer"/);
  assert.doesNotMatch(block, /"@type": "Offer"/, "no per-store Offer nodes on the card page");
  assert.doesNotMatch(block, /seller:|shippingDetails|OfferShippingDetails/);
  assert.match(block, /priceValidUntil/);
});
