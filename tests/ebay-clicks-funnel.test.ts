import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ebaySealedQuery, ebaySearchUrl, riftboundEbayQuery } from "../src/lib/affiliate";
import { CURRENT_SET_WINDOW_DAYS, isCurrentSetCode } from "../src/lib/constants";
import { offerStock } from "../src/lib/sealed-offers";
import type { SealedGroup } from "../src/lib/sealed-import";
import { PreorderPriceTable } from "../src/components/PreorderPriceTable";
import { RadianceEbayPanel } from "../src/components/RadianceEbayPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Pushing eBay clicks, P1: the Radiance pre-order funnel, sealed, articles and
// the policy copy (2026-09-26, "Pushing eBay clicks" in DECISIONS.md).
//
// The owner asked for more eBay clicks, including where a store is cheaper. The
// settled position: eBay gets more places OUTSIDE every ranked comparison and a
// clearer look inside it, but a ranking never moves, a true figure is never
// hidden, eBay is never called cheaper, and every eBay link carries its
// disclosure. This file pins each placement to that position.
// ─────────────────────────────────────────────────────────────────────────────

// tsx compiles JSX with the classic runtime (React.createElement), as in
// tests/radiance-preorders-correctness.test.ts.
(globalThis as { React?: typeof React }).React = React;

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Source with // and {/* *\/} comments removed, so prose about a rule never trips it. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const nkw = (href: string) => new URL(href.replace(/&amp;/g, "&")).searchParams.get("_nkw") ?? "";
const customid = (href: string) => new URL(href.replace(/&amp;/g, "&")).searchParams.get("customid") ?? "";

// ── 1. ebaySealedQuery ──────────────────────────────────────────────────────

test("ebaySealedQuery: a booster box also finds UK/EU 'Booster Display' titles", () => {
  assert.equal(ebaySealedQuery("Radiance Booster Box", "Booster Box"), "Riftbound Radiance Booster (box,display)");
  assert.equal(ebaySealedQuery("radiance booster box", "Booster Box"), "Riftbound radiance booster (box,display)");
  assert.equal(ebaySealedQuery("Radiance BOOSTER  BOX", "Booster Box"), "Riftbound Radiance BOOSTER (box,display)");
  // "Riftbound" exactly once, as riftboundEbayQuery guarantees.
  assert.equal(ebaySealedQuery("Riftbound Origins Booster Box", "Booster Box"), "Riftbound Origins Booster (box,display)");
  // A box already titled "Display" has nothing to widen.
  assert.equal(ebaySealedQuery("Vendetta Booster Display", "Booster Box"), "Riftbound Vendetta Booster Display");
});

test("ebaySealedQuery: every other product type is riftboundEbayQuery(name), unchanged", () => {
  for (const [name, type] of [
    ["Radiance Booster Pack", "Booster Pack"],
    ["Radiance Vault Bundle", "Bundle"],
    ["Radiance Booster Box Case", "Booster Case"],
    ["Radiance Showdown Decks", "Showdown Decks"],
  ]) {
    assert.equal(ebaySealedQuery(name, type), riftboundEbayQuery(name), `${type} must not be rewritten`);
  }
});

test("ebaySealedQuery: the OR group survives the affiliate URL builder", () => {
  // riftboundEbayQuery drops commas; ebaySealedQuery must add its own after it.
  const href = ebaySearchUrl("UK", ebaySealedQuery("Radiance Booster Box", "Booster Box"), "preorders-box");
  assert.match(href, /^https:\/\/www\.ebay\.co\.uk\/sch\//);
  assert.equal(nkw(href), "Riftbound Radiance Booster (box,display)");
  assert.match(customid(href), /preorders-box/);
});

// ── 2. isCurrentSetCode ─────────────────────────────────────────────────────

test("isCurrentSetCode: unreleased, or released within the window", () => {
  assert.equal(CURRENT_SET_WINDOW_DAYS, 45);
  // Radiance before its 23 Oct 2026 release: a pre-order set is current.
  assert.equal(isCurrentSetCode("RAD", new Date("2026-09-26T12:00:00Z")), true);
  // …and after it, for 45 days.
  assert.equal(isCurrentSetCode("RAD", new Date("2026-10-23T12:00:00Z")), true);
  assert.equal(isCurrentSetCode("RAD", new Date("2026-12-07T00:00:00Z")), true, "day 45");
  assert.equal(isCurrentSetCode("RAD", new Date("2026-12-07T00:00:01Z")), false, "past day 45");
  // Vendetta (31 Jul 2026): current through 14 Sep, not on 26 Sep.
  assert.equal(isCurrentSetCode("VEN", new Date("2026-08-20T00:00:00Z")), true);
  assert.equal(isCurrentSetCode("VEN", new Date("2026-09-14T00:00:00Z")), true);
  assert.equal(isCurrentSetCode("VEN", new Date("2026-09-26T00:00:00Z")), false);
});

test("isCurrentSetCode: undated, unknown and empty codes are not current", () => {
  const now = new Date("2026-09-26T00:00:00Z");
  assert.equal(isCurrentSetCode("OGN", now), false, "a released set with no releasedOn");
  assert.equal(isCurrentSetCode("XYZ", now), false);
  assert.equal(isCurrentSetCode("", now), false);
  assert.equal(isCurrentSetCode(null, now), false);
  assert.equal(isCurrentSetCode(undefined, now), false);
});

// ── 3. PreorderPriceTable: presentation changes, ranking untouched ──────────

const NOW = Date.parse("2026-09-26T12:00:00Z");
type Listing = SealedGroup["listings"][number];
const L = (retailer: string, priceCents: number, inStock: boolean, url = `https://${retailer}.example/p`): Listing => ({
  retailer,
  retailerName: retailer,
  priceCents,
  url,
  inStock,
  lastSeen: new Date(NOW - 2 * 3600_000).toISOString(),
});
function group(groupKey: string, name: string, listings: Listing[]): SealedGroup {
  const open = listings.filter((l) => offerStock(l, NOW) === "open");
  return {
    groupKey,
    name,
    productType: groupKey.split("|")[1],
    setCode: "RAD",
    imageUrl: null,
    lowestPriceCents: open.length ? Math.min(...open.map((l) => l.priceCents)) : null,
    storeCount: new Set(open.map((l) => l.retailer)).size,
    msrpCents: null,
    atMsrp: false,
    overMsrpPct: null,
    firstSeenAt: null,
    listings,
  };
}
const BOX = group("RAD|Booster Box", "Radiance Booster Box", [
  L("gamenerdz", 12997, true),
  L("ebay_us", 19000, true, "https://www.ebay.com/itm/123"),
  L("tcgplayer", 22658, true, "https://www.tcgplayer.com/product/1"),
  L("manyrealms", 11999, false),
]);
const PACK = group("RAD|Booster Pack", "Radiance Booster Pack", [L("punkouter", 699, false)]);
const render = (page?: "/radiance-preorders" | "/sets/radiance", groups = [BOX, PACK]) =>
  renderToStaticMarkup(createElement(PreorderPriceTable, { groups, country: "US", currency: "USD", now: NOW, page }));
const section = (html: string, key: string) =>
  html.match(new RegExp(`<section[^>]*data-group="${key.replace("|", "\\|")}"[\\s\\S]*?</section>`))?.[0] ?? "";

test("pre-order table: the ranking is exactly what it was — cheapest open first, eBay where its price puts it", () => {
  const box = section(render(), "RAD|Booster Box");
  const rows = [...box.matchAll(/<li data-stock="(\w+)"[\s\S]*?<\/li>/g)].map(
    (m) => `${m[0].match(/truncate text-sm[^"]*">([^<]+)</)?.[1]}:${m[1]}`,
  );
  assert.deepEqual(rows, ["gamenerdz:open", "ebay_us:open", "tcgplayer:open", "manyrealms:soldout"]);
  // The true figure stays on the dearer eBay row.
  const ebayRow = box.match(/<li data-stock="open"[\s\S]*?ebay_us[\s\S]*?<\/li>/)?.[0] ?? "";
  assert.match(ebayRow, />\+46%</);
});

test("pre-order table: an open eBay row reads 'View on eBay' at ghost weight in eBay blue; stores unchanged", () => {
  const box = section(render(), "RAD|Booster Box");
  const li = (store: string) => box.match(new RegExp(`<li data-stock="\\w+"[^>]*>(?:(?!</li>)[\\s\\S])*?>${store}<[\\s\\S]*?</li>`))?.[0] ?? "";
  assert.match(li("ebay_us"), /class="btn-ebay-ghost px-2\.5 py-1 text-xs[^"]*"[^>]*>View on eBay</);
  assert.doesNotMatch(li("ebay_us"), /class="btn-ebay /, "never the one FILLED button in a ghost list");
  assert.match(li("gamenerdz"), /class="btn-ghost px-2\.5 py-1 text-xs[^"]*"[^>]*>Pre-order</);
  assert.doesNotMatch(li("manyrealms"), /btn-/, "sold-out rows keep no button emphasis");
});

test("pre-order table: every paid row carries the Paid link tag, a plain store row does not", () => {
  const box = section(render(), "RAD|Booster Box");
  const li = (store: string) => box.match(new RegExp(`<li data-stock="\\w+"[^>]*>(?:(?!</li>)[\\s\\S])*?>${store}<[\\s\\S]*?</li>`))?.[0] ?? "";
  assert.match(li("ebay_us"), />Paid link</);
  assert.match(li("tcgplayer"), />Paid link</);
  assert.doesNotMatch(li("gamenerdz"), /Paid link/);
});

test("pre-order table: the per-product eBay search sits OUTSIDE the ranked list, and is a search", () => {
  const box = section(render(), "RAD|Booster Box");
  const ulEnd = box.indexOf("</ul>");
  const search = box.indexOf("data-ebay-search");
  assert.ok(ulEnd > 0 && search > ulEnd, "after </ul>, inside the product's <section>");
  assert.doesNotMatch(box.slice(0, ulEnd), /data-ebay-search|Search eBay for/);
  const line = box.slice(search);
  assert.match(line, />Paid link</);
  assert.match(line, /Search eBay for Radiance Booster Box/);
  const href = line.match(/href="([^"]+)"/)?.[1] ?? "";
  assert.equal(nkw(href), "Riftbound Radiance Booster (box,display)");
  assert.match(customid(href), /preorders-product/);
  // Quiet while a store has an open offer: no filled eBay button.
  assert.doesNotMatch(line, /class="btn-ebay /);
  assert.match(line, /min-h-11[^"]*text-sky-300/);
});

test("pre-order table: 'Sold out everywhere' makes the eBay search the filled button", () => {
  const pack = section(render(), "RAD|Booster Pack");
  assert.match(pack, /Sold out everywhere/);
  const line = pack.slice(pack.indexOf("data-ebay-search"));
  assert.match(line, /class="btn-ebay min-w-0 flex-1"/);
  assert.equal(nkw(line.match(/href="([^"]+)"/)?.[1] ?? ""), "Riftbound Radiance Booster Pack");
});

test("pre-order table: the hub reports its own EPN source", () => {
  const hub = section(render("/sets/radiance"), "RAD|Booster Box");
  const href = hub.slice(hub.indexOf("data-ebay-search")).match(/href="([^"]+)"/)?.[1] ?? "";
  assert.match(customid(href), /set-hub-product/);
});

test("pre-order table: the footnote says what is paid and what is ranked, with the network disclosure", () => {
  const html = render();
  assert.match(html, /Every price above is a <strong[^>]*>pre-order<\/strong>/, "the pre-order paragraph stays");
  assert.match(html, /Links marked &ldquo;Paid link&rdquo; earn us a commission|Links marked “Paid link” earn us a commission/);
  assert.match(html, /Every row above is sorted purely by price and stock, whether it pays us or not\./);
  assert.match(html, /are searches of eBay, not ranked results\./);
  assert.match(html, /as an eBay Partner Network affiliate and a TCGplayer affiliate/);
  assert.doesNotMatch(html, /Some store links above are affiliate links/);
});

// ── 4. "Also on eBay": /radiance-preorders and the hub ──────────────────────

test("'Also on eBay' renders four labelled searches, each with Riftbound and its own source", () => {
  const html = renderToStaticMarkup(
    createElement(RadianceEbayPanel, { country: "UK", pageType: "radiance_preorders", besideRanking: true }),
  );
  assert.match(html, /<h2[^>]*>Also on eBay<\/h2>/);
  assert.match(html, /Searches of eBay UK, separate from the price ranking above\./);
  assert.match(html, />Paid link</);
  assert.match(html, /as an eBay Partner Network affiliate/);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 4);
  for (const h of hrefs) {
    assert.match(h, /^https:\/\/www\.ebay\.co\.uk\//);
    assert.match(nkw(h), /\bRiftbound\b/);
  }
  assert.deepEqual(
    hrefs.map((h) => customid(h).replace(/^rc-uk-/, "").replace(/-search$/, "")),
    ["preorders-singles", "preorders-box", "preorders-bundle", "preorders-released-sealed"],
  );
  assert.match(html, /Search eBay UK for Radiance singles/);
  assert.match(html, /Search eBay UK for booster boxes from released sets/);
  // Nothing claims a price, a stock level, or a guarantee.
  assert.doesNotMatch(html, /cheaper|in stock|guarantee/i);
});

test("'Also on eBay' drops 'separate from the ranking above' where there is no ranking above", () => {
  const html = renderToStaticMarkup(
    createElement(RadianceEbayPanel, { country: "US", pageType: "set_hub", besideRanking: false }),
  );
  assert.match(html, /Searches of eBay\. eBay sellers set their own prices and dispatch dates/);
  const ids = [...html.matchAll(/href="([^"]+)"/g)].map((m) => customid(m[1]));
  assert.ok(ids.every((id) => /set-hub-(singles|box|bundle|released-sealed)/.test(id)), ids.join(" "));
});

test("the released-sets search is a cross-sell: hidden for ad-free members", () => {
  const src = read("src/components/RadianceEbayPanel.tsx");
  assert.match(src, /from released sets`,\s*href: [^\n]+\n\s*promo: true,/);
});

test("/radiance-preorders: strip above the table, panel under it in every state, then the capture", () => {
  const src = read("src/app/radiance-preorders/page.tsx");
  const strip = src.indexOf('variant="strip"');
  const table = src.indexOf("<PreorderPriceTable ");
  const empty = src.indexOf("Radiance is out — see live prices");
  const panel = src.indexOf('<RadianceEbayPanel country={country} pageType="radiance_preorders"');
  const capture = src.indexOf('<div id="notify"');
  assert.ok(strip > 0 && strip < table, "the strip precedes the ranking");
  assert.ok(table < empty && empty < panel, "the panel follows the table AND the empty-state card");
  assert.ok(panel < capture, "…and precedes the release-day capture");
  // Not inside either branch of the listed/empty ternary: it renders in every state.
  assert.match(src, /\n\s*\)\}\n\n(?:\s*\{\/\*[\s\S]*?\*\/\}\n)?\s*<RadianceEbayPanel /);
  // The strip only above a real table, and it says it is outside the ranking.
  assert.match(src, /\{stillUpcoming && listed\.length > 0 && \(\s*<EbaySearchPanel\s+variant="strip"/);
  assert.match(src, /sub="Not part of the store price ranking below\."/);
  assert.match(src, /ebaySearchUrl\(country, ebaySealedQuery\("Radiance Booster Box", "Booster Box"\), "preorders-strip"\)/);
  // The pinned table call is untouched (tests/radiance-hub.test.ts).
  assert.match(src, /<PreorderPriceTable groups=\{listed\} country=\{country\} currency=\{currency\} page="\/radiance-preorders" \/>/);
  assert.match(src, /The price lists below cover every Radiance product our tracked \{info\.adjective\} stores are\s+taking pre-orders on, each sorted cheapest first, in \{currency\}\./);
});

test("RadianceHub: the same panel directly under its table and its empty state", () => {
  const src = read("src/components/sets/RadianceHub.tsx");
  const table = src.indexOf("<PreorderPriceTable ");
  const empty = src.indexOf("No Radiance pre-orders are tracked in your market yet.");
  const panel = src.indexOf('<RadianceEbayPanel country={country} pageType="set_hub"');
  const timeline = src.indexOf("Release timeline</h3>");
  assert.ok(table > 0 && table < empty && empty < panel && panel < timeline);
  assert.match(src, /<PreorderPriceTable groups=\{listed\} country=\{country\} currency=\{currency\} page="\/sets\/radiance" \/>/);
});

// ── 5. The pre-order CTA's eBay line ─────────────────────────────────────────

test("pre-order CTA: an eBay line on the 'section' placement only, beside the link, never inside it", () => {
  const view = read("src/components/RadiancePreorderCtaView.tsx");
  const linkOpen = view.indexOf("<Link");
  const linkClose = view.indexOf("</Link>");
  const line = view.indexOf("{placement === \"section\" && <RadianceCtaEbayLine />}");
  const signup = view.indexOf("{withSignup && (");
  assert.ok(linkOpen > 0 && linkClose > linkOpen, "the internal link is still there");
  assert.ok(line > linkClose && line < signup, "after the </Link>, before the signup");
  assert.doesNotMatch(view.slice(linkOpen, linkClose), /RadianceCtaEbayLine|OutboundLink/, "not nested in the <Link>");
  // Nothing else in the view renders it: "top" stays internal-only.
  assert.equal((view.match(/<RadianceCtaEbayLine/g) ?? []).length, 1);
  // The pinned funnel measurement and href are unchanged.
  assert.match(view, /href="\/radiance-preorders"/);
  assert.match(view, /onClick=\{\(\) => trackEvent\("preorder_cta_click", \{ placement,/);
});

test("pre-order CTA: the eBay line is a disclosed, measured search that follows the visitor's market", () => {
  const view = read("src/components/RadiancePreorderCtaView.tsx");
  const fn = view.slice(view.indexOf("export function RadianceCtaEbayLine"));
  assert.match(fn, /const \{ country \} = useCountry\(\);/);
  assert.match(fn, /href=\{ebaySearchUrl\(country, "Riftbound Radiance", "preorder-cta"\)\}/);
  assert.match(fn, /retailer="ebay_search"/);
  assert.match(fn, /surface="preorder_cta_ebay"/);
  assert.match(fn, /pageType=\{pathname\.startsWith\("\/sets\/"\) \? "set_hub" : "article"\}/);
  assert.match(fn, /Or search \$\{label\} for Radiance singles and sealed →/);
  assert.match(fn, /Or search \$\{label\} for Radiance singles →/);
  assert.match(fn, /className="tap-link min-h-11 text-sm text-sky-300/);
  assert.ok(fn.indexOf("<AffiliateDisclosure partner=\"ebay\"") > fn.indexOf("</OutboundLink>"), "disclosure directly under it");
});

test("pre-order CTA after release: the section placement keeps a singles-only eBay line, outside the link", () => {
  const cta = read("src/components/RadiancePreorderCta.tsx");
  const branch = cta.slice(cta.indexOf("if (!isBeforeRadianceRelease()) {"), cta.indexOf("const prices ="));
  assert.ok(branch.indexOf("</Link>") < branch.indexOf('{placement === "section" && <RadianceCtaEbayLine released />}'));
  assert.match(branch, /href="\/sets\/radiance#price-guide"/);
});

// ── 6. Articles ─────────────────────────────────────────────────────────────

test("article end: 'Search eBay for Radiance' beside the comparison, ghost weight, disclosed", () => {
  const view = read("src/components/ArticleView.tsx");
  const start = view.indexOf('article.tags.includes("radiance") && cta.href !== "/radiance-preorders" && (');
  const end = view.indexOf("</section>", start);
  const block = view.slice(start, end);
  assert.ok(start > 0);
  const compare = block.indexOf("Compare Radiance preorder prices</Link>");
  const ebay = block.indexOf("<EbayCountryLink");
  assert.ok(compare > 0 && ebay > compare, "the store comparison stays first and primary");
  assert.match(block, /source="article-preorder-end"/);
  assert.match(block, /label="Search \{ebay\} for Radiance"/);
  assert.match(block, /surface="preorder_cta_ebay"/);
  assert.match(block, /pageType="article"/);
  assert.match(block, /className="btn-ebay-ghost max-w-full text-center"/);
  assert.ok(block.indexOf('<AffiliateDisclosure partner="ebay"') > ebay, "its disclosure inside the same section, under it");
});

test("EbayCountryLink localises on the client and always names the game", () => {
  const src = read("src/components/EbayCountryLink.tsx");
  assert.match(src, /^"use client";/);
  assert.match(src, /href=\{ebaySearchUrl\(country, riftboundEbayQuery\(query\), source\)\}/);
  assert.match(src, /label\.replace\("\{ebay\}", ebayLabel\(country\)\)/);
  assert.doesNotMatch(code("src/components/EbayCountryLink.tsx"), /cookies\(|headers\(/);
});

test("gallery eBay searches: small current-set galleries only, never the filterable tracker or a tile", () => {
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /const GALLERY_EBAY_MIN = 2;/);
  assert.match(view, /const GALLERY_EBAY_MAX = 6;/);
  const gate = view.slice(view.indexOf("function galleryHasEbaySearch"), view.indexOf("function EmbedGallery"));
  assert.match(gate, /!embed\.filterable &&/);
  assert.match(gate, /cards\.length >= GALLERY_EBAY_MIN &&/);
  assert.match(gate, /cards\.length <= GALLERY_EBAY_MAX &&/);
  assert.match(gate, /cards\.every\(\(c\) => isCurrentSetCode\(c\.setCode\)\)/);
  const gallery = view.slice(view.indexOf("function EmbedGallery"), view.indexOf("// \"Recommended reads\""));
  // Under the grid, inside the gallery's section.
  assert.ok(gallery.indexOf("<CardTile ") < gallery.indexOf("<EbayCardSearchRow"));
  assert.match(gallery, /galleryHasEbaySearch\(embed, cards\) && \(\s*<EbayCardSearchRow names=\{cards\.map\(\(c\) => c\.name\)\} source="gallery-card" pageType="article" \/>/);
  assert.doesNotMatch(read("src/components/CardTile.tsx"), /EbayCardSearchRow|ebaySearchUrl/);
  assert.doesNotMatch(read("src/components/FilterableCardGallery.tsx"), /EbayCardSearchRow/);
});

test("gallery eBay row: one search per card, Riftbound in each query, disclosure under it", () => {
  const src = read("src/components/EbayCountryLink.tsx");
  const row = src.slice(src.indexOf("export function EbayCardSearchRow"));
  assert.match(row, /names\.map\(\(n\) => \[riftboundEbayQuery\(n\), n\]\)/);
  assert.match(row, /Search \{ebayLabel\(country\)\}:/);
  assert.match(row, /retailer="ebay_search"/);
  assert.match(row, /surface="ebay_search"/);
  assert.match(row, /cardName=\{name\}/);
  assert.match(row, /\{clash \? name : short\} →/);
  assert.ok(row.indexOf("<AffiliateDisclosure partner=\"ebay\"") > row.indexOf("</OutboundLink>"));
});

// ── 7–8. Shop strip, sealed ─────────────────────────────────────────────────

test("the article shop strip's eBay chip is eBay blue — gold is Premium's", () => {
  const src = code("src/components/ArticleShopStrip.tsx");
  assert.doesNotMatch(src, /gold/);
  assert.match(src, /chip bg-\[#0064d2\]\/20 [^"]*text-sky-300">eBay</);
});

test("sealed: the quick view names the game, and /sealed's set search follows the newest released set", () => {
  const qv = read("src/components/SealedQuickView.tsx");
  assert.match(qv, /const ebayQuery = riftboundEbayQuery\(group\.name\);/);
  assert.match(qv, /ebaySearchUrl\(country, ebayQuery, "sealed-quickview"\)/);
  const page = read("src/app/sealed/page.tsx");
  assert.doesNotMatch(code("src/app/sealed/page.tsx"), /"Vendetta sealed"|"Riftbound Vendetta sealed"/);
  assert.match(page, /const current = newestReleasedSet\(now\);/);
  assert.match(page, /label: `\$\{current\.name\} sealed`, q: riftboundEbayQuery\(`\$\{current\.name\} sealed`\)/);
  assert.match(page, /ebaySearchUrl\(country, x\.q, "sealed-page"\)/);
  // Every literal query names the game.
  for (const m of page.matchAll(/\bq: "([^"]+)"/g)) assert.match(m[1], /^Riftbound\b/, m[1]);
  // Nothing on the page says eBay or Amazon is cheaper.
  assert.doesNotMatch(code("src/app/sealed/page.tsx"), /better\s+prices/);
});

// ── 9. Policy copy ──────────────────────────────────────────────────────────

test("policy copy: the promise is the ORDER of a ranked comparison, and the eBay promotion is disclosed", () => {
  const policy = read("src/app/editorial-policy/page.tsx");
  assert.match(policy, /None of it affects the prices we show or the order of any ranked comparison\./);
  assert.match(policy, /Ranking is\s+by item price, with known postage breaking ties;/);
  assert.match(policy, /Outside the ranked lists we\s+do promote eBay, our main affiliate partner/);
  assert.match(policy, /Those are labelled as paid links, sit\s+apart from the ranking, and never change it\./);
  assert.doesNotMatch(policy, /price and postage alone/);
  const about = read("src/app/about/page.tsx");
  assert.match(about, /in every ranked list the cheapest option comes first,\s+full stop\. We also link to eBay outside those lists, always labelled\./);
  assert.match(read("src/app/privacy/page.tsx"), /or the order in which a price comparison is ranked\./);
});

// ── Repo-wide: no guarantee claims about eBay's programmes ───────────────────

test("no page or component claims an eBay guarantee or buyer protection", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && /money.?back|buyer protection/i.test(readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk(join(process.cwd(), "src/components"));
  walk(join(process.cwd(), "src/app"));
  assert.deepEqual(offenders, []);
});
