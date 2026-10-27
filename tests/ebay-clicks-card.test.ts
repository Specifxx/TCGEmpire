import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buyButtonClass, buyButtonLabel } from "../src/components/CardMarketSection";
import { affiliateUrl, ebaySearchUrl, riftboundEbayQuery } from "../src/lib/affiliate";

// ─────────────────────────────────────────────────────────────────────────────
// Pushing eBay clicks: the card page, QuickView and the footer (2026-09-26).
// DECISIONS.md, "Pushing eBay clicks".
//
// eBay is the site's main affiliate partner and most of its revenue, and the
// owner asked for more of its clicks, including on cards where a store is
// cheaper. What that may and may not change is settled: eBay's buttons wear
// eBay blue and its search paths move up and get clearer copy, but no
// comparison is re-ranked, nothing claims eBay is cheaper or that listings
// exist, every eBay link is disclosed beside it, and the banners stay ads.
// This file pins each piece.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Comments out, code in — line comments FIRST (see tests/card-type-seo.test.ts),
// and the `[^:]` guard keeps "https://" intact. JSX block comments go too.
const codeOnly = (src: string) =>
  src
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const SECTION = "src/components/CardMarketSection.tsx";
const QUICKVIEW = "src/components/QuickView.tsx";
const PAGE = "src/app/card/[id]/page.tsx";

// ── 1. The buy button's colour, never its position ──────────────────────────

test("buyButtonClass: eBay rows wear eBay blue, every other retailer keeps the one green", () => {
  for (const r of ["ebay", "ebay_us", "ebay_au", "ebay_uk", "ebay_ca", "ebay_eu"]) {
    assert.equal(buyButtonClass(r), "btn-ebay", r);
  }
  for (const r of ["tcgplayer", "tcgplayer_uk", "cherrycollectables", "cardtrader", ""]) {
    assert.equal(buyButtonClass(r), "btn-buy", r || "(empty)");
  }
  // The label rule is the same prefix test, so the two can never disagree.
  assert.equal(buyButtonLabel("ebay_au"), "Buy on eBay →");
});

test("the colour is the only thing that changed: both tables still rank by price and share the one helper", () => {
  const section = read(SECTION);
  assert.match(section, /className=\{`\$\{buyButtonClass\(p\.retailer\)\} order-last/);
  // The row order is computeMarket's, untouched — no eBay-first sort anywhere.
  assert.match(section, /const m = useMemo\(\(\) => computeMarket\(rows, country\), \[rows, country\]\);/);
  const qv = read(QUICKVIEW);
  assert.match(qv, /import \{ buyButtonClass, buyButtonLabel, ShownFirstTag \} from "\.\/CardMarketSection";/);
  assert.match(qv, /\.sort\(\(a, b\) => a\.priceCents - b\.priceCents \|\| a\.delivered - b\.delivered\);/);
  for (const src of [codeOnly(section), codeOnly(qv)]) {
    assert.doesNotMatch(src, /startsWith\("ebay"\)\s*\?\s*-1|sort\([^)]*ebay/i, "no comparison may put eBay first");
  }
});

// ── 2. The card page's no-eBay-row fallback ─────────────────────────────────

// Since 2026-10-27 (owner: "the top rows should be eBay and TCGplayer, even if
// they are not the cheapest") the eBay search and TCGplayer's reference lead
// the comparison panel instead of following it. DECISIONS.md, "eBay and
// TCGplayer lead every price list".
test("eBay and TCGplayer lead the panel, the cheaper on top: a listing when there is one, else the search and the reference", () => {
  const src = read(SECTION);
  const lead = src.indexOf("{(pin.ebay || ebay || pin.tcgplayer || tcg) && (");
  const ranked = src.indexOf("{rest.map((p) => renderRow(p, false))}");
  assert.ok(lead > 0 && ranked > lead, "the pinned rows render before the ranked rest");
  const block = codeOnly(src.slice(lead, ranked));
  const tcgLead = block.indexOf("{pin.tcgFirst && pin.tcgplayer && renderRow(pin.tcgplayer, true)}");
  const ebayRow = block.indexOf("renderRow(pin.ebay, true)");
  assert.ok(tcgLead >= 0 && tcgLead < ebayRow, "TCGplayer on top when it is the cheaper (tcgFirst)");
  assert.ok(ebayRow < block.lastIndexOf("renderRow(pin.tcgplayer, true)"), "otherwise eBay first");
  assert.match(block, /\{pin\.tcgFirst\s*\?\s*null\s*:\s*pin\.tcgplayer/, "never drawn twice");
  assert.match(block, /retailer="ebay_no_listing"/);
  assert.match(block, /surface="ebay_fallback"/);
  assert.match(block, /TCGplayer may not ship to your country/);
  assert.doesNotMatch(block, /cheaper|guarantee|buyer protection/i);
  // Nothing else moved: the gate, and Cardmarket stays a reference outside the list.
  assert.match(src, /const ebay = m\.hasEbay \? null : ebaySearch\[country\] \?\? null;/);
  assert.ok(src.indexOf("<CardmarketPrice") > ranked);
});

test("a pinned row keeps its price rank, says it was moved, and says how much dearer it is", () => {
  const src = codeOnly(read(SECTION));
  assert.match(src, /const i = prices\.indexOf\(p\);/);
  assert.match(src, /\{pinned && <ShownFirstTag \/>\}/);
  assert.match(src, /% vs cheapest/);
  assert.match(src, /surface=\{pinned \? "table_pinned" : "table"\}/);
});

// ── 3. Banner order ─────────────────────────────────────────────────────────

test("the eBay banner comes before TCGplayer's, under the card table and in the footer", () => {
  for (const f of [SECTION, "src/components/FooterAds.tsx"]) {
    const src = read(f);
    const ebay = src.indexOf("<EbayAd ");
    const tcg = src.indexOf("<TcgplayerAd ");
    assert.ok(ebay > 0 && tcg > ebay, `${f}: EbayAd must precede TcgplayerAd`);
  }
  // The card page's banner names its page for buy_click.
  assert.match(read(SECTION), /<EbayAd size="leaderboard" country=\{country\} query=\{ebayQuery\} className="mt-6" disclosure=\{false\} pageType="card_detail" \/>/);
});

test("the banners are still ads: labelled, and hidden for ad-free members", () => {
  for (const f of ["src/components/EbayAd.tsx", "src/components/TcgplayerAd.tsx"]) {
    const src = read(f);
    assert.match(src, /if \(usePremium\(\)\) return null;/, `${f} stays ad-free-gated`);
    assert.match(src, />\s*Ad\s*</, `${f} keeps its "Ad" label`);
  }
  const footer = read("src/components/FooterAds.tsx");
  // The same early return also drops the pair on the policy and trust pages
  // since 2026-09-26 (owner decision, "Blog and tools, joined up" in
  // DECISIONS.md; tests/site-chrome.test.ts). Ad-free still comes first.
  assert.match(footer, /if \(adFree \|\| !footerBannersAllowed\(pathname\)\) return null;/);
  assert.match(footer, /<AffiliateDisclosure partner="both" tight/);
});

// ── 4. Pre-release and resale-only cards on the card page ───────────────────

test("the no-price explainer offers an eBay search for pre-release and resale-only cards", () => {
  const page = read(PAGE);
  const start = page.indexOf("{priceState.isEmpty && (");
  const end = page.indexOf("</section>", start);
  assert.ok(start > 0 && end > start, "could not locate the no-price explainer");
  const explainer = page.slice(start, end);
  assert.match(explainer, /\{\(preview \|\| priceState\.noRetailChannel\) && \(\s*<EbayBuyCta/);
  const cta = /<EbayBuyCta[\s\S]*?\/>/.exec(explainer)?.[0] ?? "";
  // A pre-release card searches its plain name; a resale-only printing (T1S)
  // searches with its credentials, since it shares its name with a set card.
  assert.match(cta, /query=\{preview \? card\.name : cardSearchName\(card\.name, card\)\}/);
  assert.match(cta, /preRelease=\{preview\}/);
  assert.match(cta, /source=\{preview \? "card-prerelease" : "card-resale"\}/);
  assert.match(cta, /pageType="card_detail"/);
  assert.match(cta, /className="mt-4"/);
  // No `bare`: EbayBuyCta prints its own disclosure here.
  assert.doesNotMatch(cta, /\bbare\b/);
  assert.match(page, /const preview = isPreorderSetCode\(card\.setCode\);/);
});

test("nothing affiliate enters the details card above the fold", () => {
  const page = read(PAGE);
  const metrics = page.indexOf("<CardPriceMetrics");
  const explainer = page.indexOf("{priceState.isEmpty && (");
  const firstCta = page.indexOf("<EbayBuyCta");
  assert.ok(metrics > 0 && explainer > metrics);
  assert.ok(firstCta > explainer, "the first EbayBuyCta is inside the explainer, not the details card");
  const details = codeOnly(page.slice(metrics, explainer));
  assert.doesNotMatch(details, /<EbayBuyCta|<EbayAd|<EbaySearchPanel|<OutboundLink/);
});

test("the pre-release flag reaches every eBay path on the card page", () => {
  const page = read(PAGE);
  assert.match(page, /<CardPriceComparison[\s\S]*?preRelease=\{preview\}[\s\S]*?\/>/);
  assert.match(page, /<EbayCardPanel\s+cardId=\{card\.id\}\s+query=\{preview \? card\.name : cardSearchName\(card\.name, card\)\}\s+preRelease=\{preview\}/);
  // The per-market fallback search takes the same query rule, through the
  // shared helper (Riftbound exactly once).
  assert.match(page, /const ebaySearchTerm = riftboundEbayQuery\(\s*isPreorderSetCode\(card\.setCode\) \? card\.name : cardSearchName\(card\.name, card\),?\s*\);/);
  assert.match(page, /ebaySearchUrl\(c\.code, ebaySearchTerm, "card-fallback"\)/);
  // Still set-agnostic (tests/card-page-hub-links.test.ts).
  assert.ok(!/\/radiance-preorders|riftbound-radiance-spoilers|"RAD"/.test(page));
});

// ── 5. QuickView ────────────────────────────────────────────────────────────

test("QuickView's table rows tag EPN with the card's own page, not '-home'", () => {
  const qv = read(QUICKVIEW);
  assert.match(qv, /buyHref: affiliateUrl\(p\.url, p\.retailer, href\)/);
  assert.match(qv, /const href = cardHref\(card\);/);
  assert.match(qv, /\{isPaidLink\(p\.buyHref\) && <PaidLinkTag \/>\}/);
  assert.match(qv, /href=\{p\.buyHref\}/);
  // No row call is left without a loc.
  assert.doesNotMatch(qv, /affiliateUrl\(p\.url, p\.retailer\)/);
  // What the loc buys, functionally.
  const tagged = new URL(affiliateUrl("https://www.ebay.com.au/itm/1", "ebay_au", "/card/jinx-loose-cannon-ogn-202-298"));
  assert.match(tagged.searchParams.get("customid") ?? "", /ebay_au-card\b/);
  assert.doesNotMatch(tagged.searchParams.get("customid") ?? "", /-home\b/);
  const untagged = new URL(affiliateUrl("https://www.ebay.com.au/itm/1", "ebay_au"));
  assert.match(untagged.searchParams.get("customid") ?? "", /ebay_au-home\b/, "the default this replaced");
});

test("QuickView's pre-release card searches its plain name and says nothing ships yet", () => {
  const qv = read(QUICKVIEW);
  assert.match(qv, /const preRelease = isPreorderSetCode\(card\.setCode\);/);
  assert.match(qv, /const ebayCardQuery = preRelease \? card\.name : cardSearchName\(card\.name, card\);/);
  assert.match(qv, /buildEbaySearchUrl\(country, riftboundEbayQuery\(ebayCardQuery\), "quickview"\)/);
  // The carousel and its fallback CTA get the same query, the flag, and names.
  const carousel = /<EbayAdCarouselLive[\s\S]*?\/>/.exec(qv)?.[0] ?? "";
  assert.match(carousel, /query=\{ebayCardQuery\}/);
  assert.match(carousel, /\bbare\b/, "the panel's one disclosure still covers it");
  assert.match(carousel, /preRelease=\{preRelease\}/);
  assert.match(carousel, /pageType="quickview"/);
  assert.match(carousel, /source="quickview-panel"/);
  // …and the carousel threads all three to its no-listings CTA, still bare
  // (tests/ebay-graded.test.ts pins `bare={bare}`).
  const live = read("src/components/EbayAdCarouselLive.tsx");
  const cta = /<EbayBuyCta [^>]*\/>/.exec(live)?.[0] ?? "";
  for (const p of ["bare=\\{bare\\}", "preRelease=\\{preRelease\\}", "source=\\{source\\}", "pageType=\\{pageType\\}"]) {
    assert.match(cta, new RegExp(p), p);
  }
  assert.match(live, /positionInList=\{l\.rank \+ 1\}\s+pageType=\{pageType\}\s+surface="ebay_carousel"/);
  // The query the popup builds for a champion name: Riftbound once, no comma.
  const url = ebaySearchUrl("AU", riftboundEbayQuery("Seraphine, Wandering Star"), "quickview");
  const nkw = new URL(url).searchParams.get("_nkw") ?? "";
  assert.equal(nkw, "Riftbound Seraphine Wandering Star");
});

test("QuickView's two no-eBay-row searches are eBay-blue fallbacks with honest copy", () => {
  const qv = read(QUICKVIEW);
  // tests/reddit-landing-conversion.test.ts requires exactly two.
  assert.equal((qv.match(/retailer="ebay_no_listing"/g) ?? []).length, 2);
  const links = qv.split('retailer="ebay_no_listing"').slice(1).map((s) => s.slice(0, 2500));
  for (const l of links) {
    assert.match(l, /surface="ebay_fallback"/);
    // "modal" used to be what told these apart from the card page's identical
    // fallback in buy_click; with the shared surface, the page type does it.
    assert.match(l, /pageType="quickview"/);
    assert.doesNotMatch(codeOnly(l.slice(0, l.indexOf("</OutboundLink>"))), /amber|gold|btn-primary/);
  }
  assert.match(links[0], /className="btn-ebay mt-3 inline-flex text-xs"/);
  const block = codeOnly(links[1].slice(0, links[1].indexOf("</OutboundLink>")));
  assert.match(block, /border-\[#0064d2\]\/40 bg-\[#0064d2\]\/\[0\.06\]/);
  assert.match(block, /Search \{ebayMkt\.label\} for \{cardDisplayName\(card\.name, card\)\}/);
  assert.match(block, /We have no \$\{ebayMkt\.label\} price on file for this card right now — eBay sellers may still list it\./);
  assert.match(block, /preRelease\s*\?\s*"This set hasn't released yet — eBay sellers set their own dispatch dates, so check each listing\."/);
  // Disclosed right beside it, for every visitor.
  assert.match(qv, /\{ebaySearchUrl && ebayMkt && <AffiliateDisclosure partner="ebay" tight \/>\}/);
});

test("QuickView keeps its order: eBay tabs, their disclosure, the alert, then the collection row", () => {
  // tests/quickview-alert-cta.test.ts pins the same order; this guards it from
  // this package's side, since it added eBay copy further down the modal.
  const qv = read(QUICKVIEW);
  const tabs = qv.indexOf("<EbayTabs");
  const disclosure = qv.indexOf('<AffiliateDisclosure partner="ebay" tight />');
  const alert = qv.indexOf("<PriceDropAlertCta");
  const collection = qv.indexOf("＋ Add to collection");
  assert.ok(tabs > 0 && disclosure > tabs && alert > disclosure && collection > alert);
});

// ── 6. Every placement reports its own name ─────────────────────────────────

test("the card page panel and the popup report distinct EPN sources and page types", () => {
  const panel = read("src/components/EbayCardPanelLive.tsx");
  assert.equal((panel.match(/pageType="card_detail" source="card-panel" preRelease=\{preRelease\}/g) ?? []).length, 2);
  assert.match(read("src/components/EbayCardPanel.tsx"), /preRelease=\{preRelease\}/);
  // One source per placement across this package's eBay paths.
  const sources = ["card-fallback", "card-panel", "card-prerelease", "card-resale", "quickview", "quickview-panel"];
  assert.equal(new Set(sources).size, sources.length);
  const all = [PAGE, SECTION, QUICKVIEW, "src/components/EbayCardPanelLive.tsx"].map(read).join("\n");
  for (const s of sources) assert.ok(all.includes(`"${s}"`), `${s} is used`);
});
