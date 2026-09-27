import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticle } from "../src/lib/articles";

// The owner's most-visited pages, tuned for eBay (2026-09-27, "Popular pages
// tuned for eBay" in DECISIONS.md): the HEARTSTEEL post, where to buy
// Radiance, the Radiance spoilers tracker and /movers.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const shopAt = (slug: string) => {
  const a = getArticle(slug)!;
  const at = a.body.indexOf("\n[[shop]]\n");
  return at < 0 ? -1 : at / a.body.length;
};

test("each popular post places its eBay strip mid-article, before 60% of the body", () => {
  for (const slug of ["riftbound-heartsteel-overnumbered-cards", "where-to-buy-riftbound-radiance", "riftbound-radiance-spoilers"]) {
    const at = shopAt(slug);
    assert.ok(at > 0 && at < 0.6, `${slug}: [[shop]] at ${Math.round(at * 100)}%`);
    const shop = getArticle(slug)!.shop ?? [];
    assert.ok(shop.length >= 2 && shop.length <= 4, `${slug}: two to four searches, not a link wall`);
    for (const s of shop) assert.match(s.query, /^riftbound /i, `${slug}: "${s.query}" must search for the game, not the word`);
  }
  // Where to buy: right after the product rundown, where the buying decision is.
  const wtb = getArticle("where-to-buy-riftbound-radiance")!.body;
  assert.ok(wtb.indexOf("\n[[shop]]\n") < wtb.indexOf("## Buying from Riot"));
});

test("the HEARTSTEEL strip searches for what the post is about", () => {
  const a = getArticle("riftbound-heartsteel-overnumbered-cards")!;
  const queries = (a.shop ?? []).map((s) => s.query);
  assert.ok(queries.includes("Riftbound HEARTSTEEL"));
  assert.ok(queries.some((q) => /K'Sante/.test(q)));
  assert.ok(!queries.includes("Riftbound TCG singles"), "not the generic pair every post carries");
});

test("the buyable-today originals gallery opts into per-card eBay searches, within the 2-6 bound", () => {
  const a = getArticle("riftbound-heartsteel-overnumbered-cards")!;
  const originals = a.embeds!.find((e) => /buyable today/.test(e.title))!;
  assert.equal(originals.ebaySearch, true);
  assert.ok(!originals.filterable);
  assert.ok(originals.slugs!.length >= 2 && originals.slugs!.length <= 6);
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /\(embed\.ebaySearch === true \|\| cards\.every\(\(c\) => isCurrentSetCode\(c\.setCode\)\)\)/);
  assert.match(view, /cards\.length >= GALLERY_EBAY_MIN &&\s*cards\.length <= GALLERY_EBAY_MAX/);
});

test("the article strip says it is a search, in eBay blue", () => {
  const strip = read("src/components/ArticleShopStrip.tsx");
  assert.match(strip, />Search eBay →</);
  assert.doesNotMatch(strip, /View listings/);
});

test("/movers: a Search eBay row under each panel, with its disclosure, names only", () => {
  const pw = read("src/components/PriceWatch.tsx");
  assert.match(pw, /<EbayCardSearchRow names=\{movers\.slice\(0, 3\)\.map\(\(m\) => m\.card\.name\)\} source="movers-panel" pageType="movers" \/>/);
  assert.equal((pw.match(/ebaySearch=\{ebaySearch\}/g) ?? []).length, 3, "all three panels");
  assert.match(read("src/app/movers/page.tsx"), /<PriceWatch [^>]*showHeader=\{false\} ebaySearch weekTo=\{asOfLabel\} \/>/);
  // The row carries its own EPN disclosure (beside every eBay link, every visitor).
  assert.match(read("src/components/EbayCountryLink.tsx"), /<AffiliateDisclosure partner="ebay" tight \/>/);
});

test("/movers: every most-searched row carries a search of the visitor's own eBay, beside the row link", () => {
  const strip = read("src/components/MostSearchedStrip.tsx");
  const li = strip.slice(strip.indexOf("<li key={c.id}"), strip.indexOf("</li>"));
  assert.ok(li.indexOf("</Link>") > 0 && li.indexOf("</Link>") < li.indexOf("<OutboundLink"), "sibling links, never nested");
  assert.match(li, /href=\{ebaySearchUrl\(country, riftboundEbayQuery\(c\.name\), "movers-searched"\)\}/);
  assert.match(li, /pageType="movers"/);
  assert.match(li, /surface="ebay_search"/);
  // A search, labelled as one: no price, no claim a listing exists; the
  // accessible name starts with the visible word.
  assert.match(li, />\s*eBay<span className="sr-only"> search for \{c\.name\} on \{ebayLabel\(country\)\}<\/span>/);
  assert.doesNotMatch(li, /gold|cheaper|guarantee/i);
  // The disclosure sits above the list, for every visitor.
  assert.ok(strip.indexOf('<AffiliateDisclosure partner="ebay" tight />') < strip.indexOf("<ol "));
});

test("/movers stays populated through a price-basis switch: the last week before it, labelled, and only on /movers", () => {
  const ph = read("src/lib/price-history.ts");
  const compute = ph.slice(ph.indexOf("async function computePriceMovers"), ph.indexOf("export type RecentUpdate"));
  // The current basis first; the fallback only when every list is empty, only
  // inside the break's grace window, and comparing pre-switch points only.
  assert.match(compute, /let ranked = rank\(statsFrom\(\(raw\) => dropBreakWindow\(raw\)\)\);/);
  assert.match(compute, /const brk = recentMethodologyBreak\(\);\s*if \(brk && !ranked\.spikingStats\.length && !ranked\.plummetStats\.length && !ranked\.valueStats\.length\)/);
  assert.match(compute, /const before = \(raw: PricePoint\[\]\) => raw\.filter\(\(p\) => p\.t < brk\.from\);/);
  assert.match(compute, /basis = "pre-switch";/);
  // Opt-in: every caller but /movers still gets empty lists, as before.
  assert.match(ph, /if \(full\.basis === "pre-switch" && !opts\.preSwitch\) return \{ spiking: \[\], plummeting: \[\], value: \[\] \};/);
  assert.match(ph, /\["rc-price-movers-v2", country, sydneyWeekKey\(\)\]/, "a new key: the cached value's shape changed");
  const page = read("src/app/movers/page.tsx");
  assert.match(page, /getPriceMovers\(country, 50, \{ preSwitch: true \}\)/);
  assert.match(page, /weekTo=\{asOfLabel\}/);
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx", "src/lib/top-deals.ts", "src/app/games/page.tsx", "src/lib/newsletter.ts", "src/lib/user-digest.ts", "src/app/api/discord/interactions/route.ts"]) {
    assert.doesNotMatch(read(f), /preSwitch/, `${f} shows a mover's price as today's, so it must not opt in`);
  }
  // The panels name the week instead of saying "this week".
  assert.match(read("src/components/PriceWatch.tsx"), /subtitle=\{weekTo \? `Up the most, week to \$\{weekTo\}` : "Up the most \(7 days\)"\}/);
});
