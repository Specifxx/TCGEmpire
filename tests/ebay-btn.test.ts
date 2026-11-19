import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The eBay-button A/B (2026-11-19, DECISIONS.md "eBay's own blue on its button, 50/50").
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("arm b colours only eBay links that wear the filled site button, in eBay blue", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /html\[data-ebaybtn="b"\] a\[data-ebay\]\.btn-primary \{[^}]*#0064d2/);
});

test("eBay links carry data-ebay, buy_click carries the arm, the layout assigns it", () => {
  const link = read("src/components/OutboundLink.tsx");
  assert.match(link, /data-ebay=\{retailer\.startsWith\("ebay"\)/);
  assert.match(link, /ebay_btn: ebayBtnNow\(\)/);
  assert.match(read("src/app/layout.tsx"), /<EbayBtnArm \/>/);
});
