import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const listing = (i: number, c = "US") => ({ cardId: `e${i}`, cardName: `Card ${i}`, url: `https://www.ebay.com/itm/${i}`, imageUrl: `https://i.ebayimg.com/${i}.jpg`, priceCents: 100 * i, currency: "USD", country: c });
const pick = (i: number) => ({ cardId: `t${i}`, name: `Tcg ${i}`, url: `https://www.tcgplayer.com/product/${i}`, imageUrl: `https://img/${i}.jpg`, priceCents: 200 * i });

test("the in-page block takes up to three eBay tiles, then TCGplayer's, six at most, and drops a side with fewer than two", async () => {
  const { inlineTiles } = await import("../src/components/InlineAds");
  const data = { set: "x", ebay: [1, 2, 3, 4, 5].map((i) => listing(i)), tcg: [1, 2, 3, 4, 5].map(pick) } as never;
  const r = inlineTiles(data, "US");
  assert.equal(r.ebay.length, 3);
  assert.equal(r.tcg.length, 3);
  assert.match(r.ebay[0].href, /inline_us/);
  assert.match(r.tcg[0].href, /tcg_inline/);
  const onlyTcg = inlineTiles({ set: "x", ebay: [listing(1)], tcg: [1, 2, 3, 4, 5, 6, 7].map(pick) } as never, "US");
  assert.equal(onlyTcg.ebay.length, 0, "one eBay tile is not a row");
  assert.equal(onlyTcg.tcg.length, 6);
  assert.deepEqual(inlineTiles({ set: "x", ebay: [], tcg: [pick(1), pick(2)] } as never, "US"), { ebay: [], tcg: [] }, "fewer than three tiles show nothing");
});

test("the block is eBay and TCGplayer only, labelled, sponsored, ad-free aware, browser only", () => {
  const s = code("src/components/InlineAds.tsx");
  assert.match(s, /^"use client";/);
  assert.match(s, /data-ad-placement=""/, "hidden under the ad-free hint, and the phone dock yields to it");
  assert.match(s, /if \(adFree \|\| data === null\) return null;/);
  assert.match(s, />Ad<\/span>/);
  assert.match(s, /surface="inline_ads"/);
  assert.doesNotMatch(s, /amazon|fetch ?tcg|position:\s*fixed|\bfixed\b|sticky/i, "no Amazon, no Fetch, nothing floating");
  assert.ok(s.indexOf('brand: "eBay"') < s.indexOf('brand: "TCGplayer"'), "eBay first");
  assert.match(s, /minHeight: BLOCK_MIN_H/, "height reserved (CLS 0)");
  assert.match(read("src/components/OutboundLink.tsx"), /\| "inline_ads"/);
  assert.doesNotMatch(read("src/components/OutboundLink.tsx"), /"side_rails"|"mini_picks"/);
});

test("the side rails and the small strips are gone; the phone dock stays", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/SideRails.tsx")));
  assert.ok(!existsSync(join(ROOT, "src/components/MiniPicks.tsx")));
  assert.match(read("src/app/layout.tsx"), /<PhoneDockAds \/>/);
  assert.doesNotMatch(read("src/app/globals.css"), /rail-scroll|side-rail/);
});

test("one block per page: where it sits, and never on an article, a quick view or beside a price", async () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) assert.doesNotMatch(code(f), /<(EbayPicks|TcgplayerPicks|InlineAds)\b/, `${f}: HomeSections renders it`);
  assert.equal(code("src/components/home/HomeSections.tsx").match(/<InlineAds\b/g)?.length, 1);
  assert.equal(code("src/app/card/[id]/page.tsx").match(/<InlineAds\b/g)?.length, 1);
  assert.doesNotMatch(code("src/app/card/[id]/page.tsx"), /<(MiniPicks|TcgplayerPicks)\b/);
  assert.equal(code("src/components/SealedProductView.tsx").match(/<InlineAds\b/g)?.length, 1);
  assert.equal(code("src/app/sets/[set]/page.tsx").match(/<InlineAds\b/g)?.length, 1);
  assert.doesNotMatch(code("src/app/sets/[set]/page.tsx"), /<(EbayPicks|TcgplayerPicks)\b/);
  assert.match(code("src/components/browse/BrowseView.tsx"), /<InlineAds\b/);
  for (const f of ["src/components/QuickView.tsx", "src/components/SealedQuickView.tsx", "src/components/ArticleView.tsx"]) assert.doesNotMatch(code(f), /<InlineAds\b/, `${f}: no block here`);
  // The footer zone (InlineAdsZone) places it only where the page has none and never under Mediavine (articles, guides).
  const { inlineAdsAllowed } = await import("../src/lib/ad-routes");
  for (const p of ["/", "/au", "/card/jinx", "/sealed/some-box", "/sets/origins", "/browse", "/blog/some-post", "/guides/some-guide", "/account"]) assert.equal(inlineAdsAllowed(p), false, p);
  for (const p of ["/sealed", "/movers", "/trade"]) assert.equal(inlineAdsAllowed(p), true, p);
});

test("the card page's block sits after the price comparison, never above or beside it", () => {
  const s = read("src/app/card/[id]/page.tsx");
  assert.ok(s.indexOf("<InlineAds") > s.indexOf("<EbayCardPanel"), "after the price table and the eBay panel");
  assert.ok(s.indexOf("<InlineAds") > s.indexOf("<PriceDropAlertCta"), "after the alert and price tiles");
});
