import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { HUB_INTROS } from "../src/lib/content/hub-intros";
import { plainIntroText } from "../src/components/HubIntro";
import React from "react";
import { AffiliateDisclosure } from "../src/components/AffiliateDisclosure";

// The components compile with the classic JSX transform under tsx, which
// expects React in scope when AffiliateDisclosure is called below.
(globalThis as { React?: typeof React }).React = React;

// The tool and data pages explain their own figures and link the guides behind
// them (DECISIONS.md, "Blog and tools, joined up", 2026-09-26). An ad review
// judges the page, not the product: a table with a heading over it reads as
// thin, and a page that claims what its code does not do reads worse.
//
// Placement: the intro sits under the H1, visible (the 2026-09-26 mobile-first
// entry covers the homepage, card pages and /browse, not these), except on
// /deck, which opens on the tool by decision. "Read next" follows the page's
// own data and precedes any commercial block, and on the paywalled tools both
// sit outside the access split so a signed-out visitor and a crawler get them.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments are notes to developers, not copy or markup: blanked before any
// index or pattern check.
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE: Record<string, string> = {
  "/sealed": "src/app/sealed/page.tsx",
  "/movers": "src/app/movers/page.tsx",
  "/market": "src/app/market/page.tsx",
  "/market/records": "src/app/market/records/page.tsx",
  "/tools": "src/app/tools/page.tsx",
  "/tools/box-ev": "src/app/tools/box-ev/page.tsx",
  "/tools/rising": "src/app/tools/rising/page.tsx",
  "/tools/demand": "src/app/tools/demand/page.tsx",
  "/tools/selling-fees": "src/app/tools/selling-fees/page.tsx",
  "/tools/deal-finder": "src/app/tools/deal-finder/page.tsx",
  "/tools/best-basket": "src/app/tools/best-basket/page.tsx",
  "/auctions": "src/app/auctions/page.tsx",
  "/decks": "src/app/decks/page.tsx",
  "/trade": "src/app/trade/page.tsx",
  "/deck": "src/app/deck/page.tsx",
};

// For each page: the element that IS its data, and (where the page has one)
// the first commercial block that must come after "Read next".
const LAYOUT: Record<string, { data: string; before?: string }> = {
  "/sealed": { data: "<SealedTile", before: "sealedSearches().map" },
  "/movers": { data: "<MostSearchedStrip", before: "<MoversToolsCta" },
  "/market": { data: "<IndexConstituents", before: "<AdSlot" },
  "/market/records": { data: "<RecordsBoard", before: "<HubFaq" },
  "/tools": { data: "GROUPS.map", before: "<HubFaq" },
  "/tools/box-ev": { data: "<BoxEvCalculator", before: "<AdSlot" },
  "/tools/rising": { data: "<RisingRow", before: "How Rising Cards works" },
  "/tools/demand": { data: "<DemandRow", before: "How Demand Finder works" },
  "/tools/selling-fees": { data: "<FeeCalculator", before: "<AdSlot" },
  "/tools/deal-finder": { data: "<BuyerTable items", before: "How Deal Finder works" },
  "/tools/best-basket": { data: "<BestBasket", before: "<HubFaq" },
  "/auctions": { data: "<AuctionsBoard", before: "<AdSlot" },
  "/decks": { data: "<DeckLibrary" },
  "/trade": { data: "<TradeCalculator" },
  "/deck": { data: "<DeckBuilder" },
};

const published = new Map(getArticles().map((a) => [a.slug, a]));
const redirectSources = new Set(
  [...read("next.config.js").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
);
const LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;
const words = (s: string) => plainIntroText(s).split(/\s+/).filter(Boolean).length;

test("every tool and data page has an intro of 2-3 paragraphs that names a guide inline", () => {
  for (const route of Object.keys(PAGE)) {
    const intro = HUB_INTROS[route];
    assert.ok(intro, `${route} has no hub-intros entry`);
    assert.ok(intro.paragraphs.length >= 2 && intro.paragraphs.length <= 3, `${route}: 2-3 paragraphs`);
    const guides = intro.paragraphs.flatMap((p) => [...p.matchAll(LINK)].map((m) => m[2])).filter((h) => /^\/(guides|blog)\//.test(h));
    assert.ok(guides.length >= 1, `${route}: name at least one guide inline`);
  }
});

test("every intro link lands: an article under its own category, not shadowed by a redirect, or a real page", () => {
  for (const [route, { paragraphs }] of Object.entries(HUB_INTROS)) {
    for (const p of paragraphs) {
      for (const [, label, href] of p.matchAll(LINK)) {
        const path = href.replace(/[#?].*$/, "");
        const article = /^\/(guides|blog)\/([^/]+)$/.exec(path);
        if (article) {
          const a = published.get(article[2]);
          assert.ok(a, `${route} → ${href} is not a published article`);
          const own = `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`;
          assert.equal(path, own, `${route} → ${href}: a ${a.category} lives at ${own}`);
          assert.ok(!redirectSources.has(own), `${route} → ${own} is shadowed by a next.config.js redirect`);
        } else {
          assert.ok(existsSync(join(ROOT, "src/app", path, "page.tsx")), `${route} → ${href} has no page`);
        }
        assert.ok(label.trim().length > 2, `${route} → ${href}: a readable anchor`);
      }
    }
  }
});

test("the data pages' intros stay short enough that the data starts about a phone screen down", () => {
  for (const route of Object.keys(PAGE)) {
    const n = HUB_INTROS[route].paragraphs.reduce((sum, p) => sum + words(p), 0);
    // /deck's sits below its builder and Best Basket's carries the measured-
    // postage method, so both may run longer; neither blocks the data.
    const cap = route === "/deck" || route === "/tools/best-basket" ? 230 : 170;
    assert.ok(n <= cap, `${route}: ${n} words above the data (cap ${cap})`);
  }
});

test("every intro is its own page's copy: no sentence appears in two entries", () => {
  // scripts/adsense-audit.ts discounts a sentence on more than 35% of a
  // template's pages as boilerplate; a shared block would count for nothing.
  const seen = new Map<string, string>();
  for (const [route, { paragraphs }] of Object.entries(HUB_INTROS)) {
    for (const s of plainIntroText(paragraphs.join(" ")).split(/(?<=[.!?])\s+/)) {
      const key = s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      if (key.split(" ").length < 6) continue;
      assert.ok(!seen.has(key) || seen.get(key) === route, `"${s}" is in both ${seen.get(key)} and ${route}`);
      seen.set(key, route);
    }
  }
});

test("no intro repeats a stale or false claim about the site", () => {
  for (const [route, { paragraphs }] of Object.entries(HUB_INTROS)) {
    const text = plainIntroText(paragraphs.join(" "));
    assert.doesNotMatch(text, /\b(five|5) (markets|countries)\b/i, `${route}: six markets, EU included`);
    // A list of markets that names Canada names the EU too.
    if (/Canada/.test(text)) assert.match(text, /\bthe EU\b/, `${route}: a market list without the EU`);
    assert.doesNotMatch(text, /\b(refreshed|updated) daily\b|(?<!twice-)\bdaily import\b/i, `${route}: prices are read twice a day`);
    assert.doesNotMatch(text, /\b(rank|sort)\w*\b[^.]{0,60}\b(delivered|total cost)/i, `${route}: comparisons rank by item price`);
    assert.doesNotMatch(text, /shipping included|no hidden fees|real[- ]time|live lookups?/i, `${route}`);
    assert.doesNotMatch(text, /\b(invest\w*|flip\w*|profit|ahead of the market|will (rise|go up))\b/i, `${route}: no invest/flip framing`);
    assert.doesNotMatch(text, /value finder|rising sealed|condition calculator|bulk pricer/i, `${route}: a retired tool`);
    // Code stays set-agnostic: no set named in an intro either.
    assert.doesNotMatch(text, /\b(Origins|Spiritforged|Unleashed|Vendetta|Radiance)\b/, `${route}: names a set`);
  }
});

test("Rising Cards is a screen, not a prediction; Demand Finder counts attention, not a forecast", () => {
  const rising = plainIntroText(HUB_INTROS["/tools/rising"].paragraphs.join(" "));
  assert.match(rising, /a screen, not a prediction/);
  assert.doesNotMatch(rising, /price predictions?|backtest|validated/i);
  const demand = plainIntroText(HUB_INTROS["/tools/demand"].paragraphs.join(" "));
  assert.match(demand, /not a price forecast/);
  assert.doesNotMatch(demand, /invest|flip|what to buy|predict|ahead of the market/i);
  // The FAQ said prices across the 23 September switch are never compared; the
  // ranking reads across it by the owner's call (lib/rise-predictor.ts).
  assert.doesNotMatch(code(PAGE["/tools/rising"]), /prices from before then are not compared/);
  assert.match(code(PAGE["/tools/rising"]), /still reads each card's price history across that date/);
});

test("each page renders its intro above its data and Read next after it, before any commercial block", () => {
  for (const [route, file] of Object.entries(PAGE)) {
    const src = code(file);
    const intro = src.indexOf(`<HubIntro path="${route}"`);
    const guides = src.indexOf(`guidesForTool("${route}")`);
    const data = src.indexOf(LAYOUT[route].data);
    assert.ok(intro > 0, `${file} renders no <HubIntro path="${route}">`);
    assert.ok(guides > 0, `${file} renders no guidesForTool("${route}")`);
    assert.ok(data > 0, `${file}: expected ${LAYOUT[route].data}`);
    assert.ok(guides > data, `${file}: Read next must follow the data`);
    if (route === "/deck") {
      // Tool first (DECISIONS.md "Public decks"; tests/public-decks.test.ts).
      assert.ok(intro > data && guides > intro, "/deck: builder, then its explainer, then Read next");
    } else {
      assert.ok(intro < data, `${file}: the intro goes above the data`);
      assert.ok(src.indexOf("<h1") < intro, `${file}: the intro goes under the H1`);
    }
    const before = LAYOUT[route].before;
    if (before) {
      const at = src.indexOf(before, data);
      assert.ok(at > 0, `${file}: expected ${before}`);
      assert.ok(guides < at, `${file}: Read next must come before ${before}`);
    }
  }
  // The pages that reuse a parent's guides, or carry no intro of their own.
  assert.match(code("src/app/alerts/page.tsx"), /guidesForTool\("\/alerts"\)/);
  for (const f of ["src/app/decks/[slug]/page.tsx", "src/app/decks/legend/[legend]/page.tsx"]) {
    assert.match(code(f), /guidesForTool\("\/decks"\)/, f);
  }
});

test("on the paywalled tools the intro and Read next sit outside the access split", () => {
  const deal = code(PAGE["/tools/deal-finder"]);
  assert.ok(deal.indexOf("<HubIntro") < deal.indexOf("{data === null ?"), "Deal Finder: intro above the gate");
  assert.ok(deal.indexOf("guidesForTool(") > deal.indexOf("The cross-market board"), "Deal Finder: Read next after the gated list");
  // The intro sat inside the h1/RegionToggle flex row and pushed the toggle
  // below it.
  const row = deal.slice(deal.indexOf("<h1"), deal.indexOf("<RegionToggle />"));
  assert.doesNotMatch(row, /HubIntro/, "Deal Finder: the intro is not a flex item beside the heading");

  const rising = code(PAGE["/tools/rising"]);
  assert.ok(rising.indexOf("<HubIntro") < rising.indexOf("analysis.picks.length === 0 ?"), "Rising: intro above the gate");
  assert.ok(rising.indexOf("guidesForTool(") > rising.indexOf('surface="gate:rising"'), "Rising: Read next after the gated list");

  const demand = code(PAGE["/tools/demand"]);
  assert.ok(demand.indexOf("<HubIntro") < demand.indexOf("result.failed ?"), "Demand: intro above the gate");
  assert.ok(demand.indexOf("guidesForTool(") > demand.indexOf('surface="gate:demand"'), "Demand: Read next after the gated list");

  const basket = code(PAGE["/tools/best-basket"]);
  assert.ok(basket.indexOf("guidesForTool(") > basket.indexOf("Browse free tools"), "Best Basket: Read next after the sign-in split");
});

test("/movers ranks card pages by item price, and the eBay CTA still sits straight under the lists", () => {
  const src = code(PAGE["/movers"]);
  assert.doesNotMatch(src, /ranked by (total )?delivered cost/);
  assert.match(src, /cheapest first by item price, with the delivered total shown where the store\s+publishes its postage/);
  assert.match(src, /<PriceWatch [^>]*\/>\s*<EbayBuyCta source="movers" pageType="movers" \/>/);
});

test("/sealed names no set in code, states its real fallback and carries Amazon's statement beside Amazon's links", () => {
  const src = code(PAGE["/sealed"]);
  assert.doesNotMatch(src, /"VEN"|Vendetta/, "the newest set comes from SETS, never a literal");
  assert.match(src, /const newest = newestReleasedSet\(\);/);
  assert.doesNotMatch(src, /Australian listings|prices in AUD|ship internationally/);
  assert.match(src, /\{COUNTRIES\[priceCountry\]\.adjective\} listings/);
  const panel = src.slice(src.indexOf("sealedSearches().map"), src.indexOf("</section>", src.indexOf("sealedSearches().map")));
  assert.match(panel, /amazon_sealed_search/);
  assert.match(panel, /<AffiliateDisclosure partner="amazon" \/>/);
  // MSRP is described as the code keeps it: approximate launch RRPs for three
  // markets, never for pre-orders (lib/msrp.ts, lib/sealed-import.ts).
  const intro = plainIntroText(HUB_INTROS["/sealed"].paragraphs.join(" "));
  assert.match(intro, /approximate launch RRP/);
  assert.match(intro, /Australia, the US and the UK only/);
  assert.match(intro, /never for pre-orders/);
});

test("the Amazon disclosure is Amazon's own wording, and the other partners' lines are unchanged", () => {
  const text = (partner?: "ebay" | "tcgplayer" | "both" | "amazon") =>
    (AffiliateDisclosure({ partner }) as { props: { children: string } }).props.children;
  assert.equal(text("amazon"), "As an Amazon Associate, RiftCompare earns from qualifying purchases.");
  assert.equal(text(), text("ebay"), "eBay stays the default");
  assert.equal(text("ebay"), "Affiliate link: as an eBay Partner Network affiliate, RiftCompare earns from qualifying purchases — at no extra cost to you.");
  assert.equal(text("tcgplayer"), "Affiliate link: RiftCompare earns a commission from qualifying TCGplayer purchases — at no extra cost to you.");
  assert.equal(
    text("both"),
    "Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, RiftCompare earns from qualifying purchases — at no extra cost to you.",
  );
  // Every file that links Amazon renders the statement.
  for (const [, file] of Object.entries(PAGE)) {
    const src = code(file);
    if (/amazonHost|amazon\.com/i.test(src)) assert.match(src, /partner="amazon"/, file);
  }
});

test("/decks is noindexed while the library is empty, from the same read the page renders, and fails open", () => {
  const src = read(PAGE["/decks"]);
  assert.match(src, /export const revalidate = 3600;/, "never lower a page's revalidate");
  // liveDecksOrNull: a failed read is null, not an empty library, so a database
  // blip never caches a noindex for an hour (the champion/store/facet rule).
  assert.match(src, /const loadDecks = cache\(\(\) => liveDecksOrNull\(\)\);/);
  const meta = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export default"));
  assert.match(meta, /await loadDecks\(\)/);
  assert.match(meta, /decks !== null && decks\.length === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}/);
  assert.match(src.slice(src.indexOf("export default")), /const decks = \(await loadDecks\(\)\) \?\? \[\];/);
  assert.doesNotMatch(src, /unstable_cache|cachedOrDirect/, "a request cache, not a data cache");
  // The intro renders either way: it sits above the empty/full split.
  assert.ok(code(PAGE["/decks"]).indexOf("<HubIntro") < code(PAGE["/decks"]).indexOf("rows.length === 0 ?"));
});

test("/market/records describes the series it actually reads", () => {
  const src = code(PAGE["/market/records"]);
  // The records are lib/price-history.ts's weekly GLOBAL series, converted; the
  // gaps use the fixed reference rates in lib/fx.ts.
  assert.doesNotMatch(src, /one point per day|today&apos;s rates|14\+ days|in stock now|Updated daily/);
  assert.match(src, /Australia, the US, the UK and Singapore/);
  assert.match(src, /reference exchange rate/);
});

test("every grid on these pages has a base column count", () => {
  for (const file of [...Object.values(PAGE), "src/app/alerts/page.tsx"]) {
    for (const [, cls] of code(file).matchAll(/className="([^"]*)"/g)) {
      if (!/(^|\s)grid(\s|$)/.test(cls) || !/\b(sm|md|lg|xl):grid-cols-/.test(cls)) continue;
      assert.match(cls, /(^|\s)grid-cols-(\d|\[)/, `${file}: "${cls}" needs a base grid-cols-1`);
    }
  }
});
