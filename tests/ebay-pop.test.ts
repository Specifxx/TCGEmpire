import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The eBay stand-out A/B (2026-11-19, DECISIONS.md "eBay stand-out row, 50/50").
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("arm pop makes eBay buttons bolder with a halo and tints the row that holds one; shape and colour only", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /html\[data-ebaypop="pop"\] a\[data-ebay\]:is\(\.btn-primary, \.btn-buy, \.btn-ad\) \{[^}]*font-weight: 800/);
  assert.match(css, /html\[data-ebaypop="pop"\] li:has\(a\[data-ebay\]/);
  assert.doesNotMatch(css, /data-ebaypop[^{]*\{[^}]*content:/, "the arm adds no words");
});

test("the arm is assigned in the browser and carried on buy_click", () => {
  const lib = read("src/lib/ebay-pop.ts");
  assert.match(lib, /EBAY_POP_KEY = "ebay-pop"/);
  assert.match(lib, /Math\.random\(\) < 0\.5/);
  assert.match(read("src/components/EbayBtnArm.tsx"), /applyEbayPop\(\)/);
  assert.match(read("src/components/OutboundLink.tsx"), /ebay_pop: ebayPopNow\(\)/);
});
