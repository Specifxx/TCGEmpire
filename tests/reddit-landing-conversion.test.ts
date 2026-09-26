import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyEntry } from "../src/lib/entry-source";
import { affiliateUrl, ebaySearchUrl } from "../src/lib/affiliate";
import { getArticle } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Reddit landings → the rest of the site and eBay (2026-09-26). DECISIONS.md,
// "Reddit landings: the pre-order CTA, the eBay strip and click attribution".
//
// The owner grows the site by posting blog and /radiance-preorders links on
// Reddit. On a phone those posts are 10–14 screens long and their only eBay
// path sat 70–86% of the way down; the pre-order CTA reached three hand-picked
// slugs, not the spoiler posts actually being shared; and none of it could be
// measured — the strip and the pre-order table sent buy_click with no page or
// placement, EPN's customid reported the pre-order page as "home", and one
// QuickView eBay link fired nothing at all. This file pins each fix.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOST = "riftcompare.com";

test("entry buckets: Reddit is recognised with or without a referrer", () => {
  assert.equal(classifyEntry("https://www.reddit.com/r/riftboundtcg/comments/x", HOST, ""), "reddit");
  assert.equal(classifyEntry("https://old.reddit.com/", HOST, ""), "reddit");
  assert.equal(classifyEntry("https://out.reddit.com/t3_abc", HOST, ""), "reddit");
  // The Reddit Android app's referrer is not an https URL at all.
  assert.equal(classifyEntry("android-app://com.reddit.frontpage/", HOST, ""), "reddit");
  // The apps often send NO referrer — a utm_source on the posted link is the fix.
  assert.equal(classifyEntry("", HOST, "?utm_source=reddit&utm_medium=social"), "reddit");
});

test("entry buckets: search, social, our own emails, internal, direct, other", () => {
  assert.equal(classifyEntry("https://www.google.com/", HOST, ""), "search");
  assert.equal(classifyEntry("https://www.google.com.au/", HOST, ""), "search");
  assert.equal(classifyEntry("https://www.bing.com/search?q=riftbound", HOST, ""), "search");
  assert.equal(classifyEntry("https://duckduckgo.com/", HOST, ""), "search");
  assert.equal(classifyEntry("https://t.co/abc", HOST, ""), "social");
  assert.equal(classifyEntry("https://discord.com/channels/1/2", HOST, ""), "discord");
  // The values lib/email.ts, the release-day mail and the Discord bot really use.
  assert.equal(classifyEntry("", HOST, "?utm_source=email&utm_medium=email"), "email");
  assert.equal(classifyEntry("", HOST, "?utm_source=newsletter"), "email");
  assert.equal(classifyEntry("", HOST, "?utm_source=discord-bot"), "discord");
  assert.equal(classifyEntry(`https://${HOST}/blog`, HOST, ""), "internal");
  assert.equal(classifyEntry("", HOST, ""), "direct");
  assert.equal(classifyEntry("https://example.org/", HOST, ""), "other");
  // A garbage referrer never throws.
  assert.equal(classifyEntry("not a url", HOST, ""), "other");
});

test("every buy_click carries the entry bucket, captured once per tab in the layout", () => {
  const link = read("src/components/OutboundLink.tsx");
  assert.match(link, /entry: readEntrySource\(\),/);
  assert.match(read("src/components/ReferralCapture.tsx"), /captureEntrySource\(\);/);
  // First touch: a stored value is never overwritten by a later page load.
  assert.match(read("src/lib/entry-source.ts"), /if \(sessionStorage\.getItem\(KEY\)\) return;/);
});

test("the article eBay strip reports its page and WHERE it sat", () => {
  const strip = read("src/components/ArticleShopStrip.tsx");
  assert.match(strip, /pageType="article"/);
  assert.match(strip, /surface=\{placement === "inline" \? "shop_strip_inline" : "shop_strip_end"\}/);
  // …and EPN's own earnings report can split the two the same way.
  assert.match(strip, /placement === "inline" \? "guide-inline" : "guide-strip"/);
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /<ArticleShopStrip key=\{i\} items=\{article\.shop\} placement="inline" \/>/);
  assert.match(view, /!shopPlaced && article\.shop && article\.shop\.length > 0 && <ArticleShopStrip items=\{article\.shop\} \/>/);
});

test("the Reddit-shared posts carry the eBay strip mid-article, not at the foot", () => {
  for (const slug of [
    "riftbound-ksante-radiance-spoiler",
    "riftbound-seraphine-radiance-spoiler",
    "riftbound-neeko-blending-in-spoiler",
    "riftbound-radiance-spoilers",
    "riftbound-radiance-leaked-mechanics",
  ]) {
    const a = getArticle(slug);
    assert.ok(a, slug);
    assert.ok(a!.shop && a!.shop.length > 0, `${slug} needs a shop array for its [[shop]] marker`);
    const at = a!.body.indexOf("\n[[shop]]\n");
    assert.ok(at > 0, `${slug} must place the strip with its own [[shop]] line`);
    // Ahead of the last third of the body — the old default sat after all of it.
    assert.ok(at / a!.body.length < 0.6, `${slug}: [[shop]] at ${Math.round((at * 100) / a!.body.length)}% of the body`);
  }
});

test("pre-order table clicks name their page — to EPN and to buy_click", () => {
  const table = read("src/components/PreorderPriceTable.tsx");
  assert.match(table, /href=\{affiliateUrl\(l\.url, l\.retailer, page\)\}/);
  assert.match(table, /pageType=\{pageType\}/);
  assert.match(table, /surface="table"/);
  assert.match(read("src/app/radiance-preorders/page.tsx"), /<PreorderPriceTable [^>]*page="\/radiance-preorders"/);
  assert.match(read("src/components/sets/RadianceHub.tsx"), /<PreorderPriceTable [^>]*page="\/sets\/radiance"/);
  // Functionally: the page segment reaches the eBay customid, and "home" is gone.
  const url = new URL(affiliateUrl("https://www.ebay.com/itm/1", "ebay", "/radiance-preorders"));
  assert.match(url.searchParams.get("customid") ?? "", /radiance-preorders/);
  assert.doesNotMatch(url.searchParams.get("customid") ?? "", /-home\b/);
});

test("QuickView has no eBay link that skips buy_click", () => {
  const qv = read("src/components/QuickView.tsx");
  // The old zero-stock search was a bare <a rel={outboundRel(…)}>.
  assert.doesNotMatch(qv, /rel=\{outboundRel\(/);
  assert.equal((qv.match(/retailer="ebay_no_listing"/g) ?? []).length, 2, "both zero-stock eBay searches are OutboundLinks");
});

test("sealed eBay links go to the visitor's own eBay in all six markets", () => {
  for (const f of ["src/app/sealed/page.tsx", "src/components/SealedQuickView.tsx"]) {
    const src = read(f);
    // A host MAP is quoted string values; prose explaining the old bug is fine.
    assert.doesNotMatch(src, /"ebay\.com\.au"|"ebay\.co\.uk"/, `${f} must not carry its own eBay host map`);
    assert.match(src, /ebaySearchUrl\(country, [^)]+, "sealed-(page|quickview)"\)/, `${f} uses the shared helper with a source`);
  }
  // What the old AU/US/UK copies got wrong: these three fell back to .com.au.
  assert.match(ebaySearchUrl("CA", "Riftbound booster box", "sealed-page"), /^https:\/\/www\.ebay\.ca\//);
  assert.match(ebaySearchUrl("EU", "Riftbound booster box", "sealed-page"), /^https:\/\/www\.ebay\.es\//);
  // Singapore has no EPN program; the shared helper reroutes it to ebay.com.
  assert.doesNotMatch(ebaySearchUrl("SG", "Riftbound booster box", "sealed-page"), /ebay\.com\.au/);
});

test("an alert offered on a card with no price never promises a drop", () => {
  const cta = read("src/components/PriceDropAlertCta.tsx");
  // The compact (QuickView) variant used to hard-code the drop wording.
  assert.doesNotMatch(cta, />Price-drop alert:</);
  assert.match(cta, /\{copy\.label\}:/);
  assert.match(cta, /Email me when I can pre-order it/);
  assert.match(cta, /notice: !unpriced \? "drop" : preorder \? "preorder" : "stock"/);
  const qv = read("src/components/QuickView.tsx");
  assert.match(qv, /unpriced=\{prices !== null && inStock\.length === 0 && !hasNoRetailChannel\(card\.setCode\)\}/);
  assert.match(qv, /preorder=\{isPreorderSetCode\(card\.setCode\)\}/);
  // Never a flash of the wrong promise: the row waits for the prices.
  assert.match(qv, /pending=\{prices === null\}/);
  assert.match(cta, /if \(!loaded \|\| pending\) return/);
  assert.match(read("src/app/card/[id]/page.tsx"), /preorder=\{isPreorderSetCode\(card\.setCode\)\}/);
  const modal = read("src/components/PriceAlertModal.tsx");
  assert.match(modal, /preorder: \{ heading: "Get a pre-order email"/);
  assert.match(modal, /\{NOTICE_COPY\[notice\]\.heading\}/);
});
