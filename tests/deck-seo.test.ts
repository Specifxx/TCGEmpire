import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COUNTRIES, COUNTRY_LIST } from "../src/lib/country";
import { formatMoney } from "../src/lib/format";
import {
  deckItemListLd,
  deckFaqLd,
  deckFaq,
  cheapestDeck,
  bestWinRateDeck,
  type DeckLdInput,
} from "../src/lib/deck-jsonld";
import metaDecks from "../prisma/meta-decks.json";

// ─────────────────────────────────────────────────────────────────────────────
// /decks structured data + indexability.
//
// The bug these exist to catch is a hardcoded currency: markup that says "AUD"
// renders perfectly and is only wrong for five of the six markets we serve, so
// it survives code review and ships. Every builder is therefore exercised across
// the whole of COUNTRY_LIST, asserting the offer currency tracks the market and
// the JSON-LD price equals the number the page renders.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Source-text assertions below are about EMITTED CODE, not prose: these files
// document why there is no hreflang and no hardcoded currency, and those comments
// would otherwise trip the very checks that enforce them.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments, but not the // in https://
const SITE = "https://riftcompare.com";

// Fixtures shaped like resolveAllDecks output. Prices differ so "cheapest" is
// unambiguous, and one deck is unpriced to cover the no-offer branch.
const DECKS: DeckLdInput[] = [
  { slug: "irelia-blade-dancer", name: "Irelia, Blade Dancer", archetype: "Tempo", description: "Benchmark tempo deck.", tier: "1", totalCents: 24500, pricedCards: 43, imageUrl: `${SITE}/a.png`, metaSharePct: 10, winRatePct: 52, top8s: 15 },
  { slug: "viktor-herald-of-the-arcane", name: "Viktor, Herald of the Arcane", archetype: "Value Midrange", description: "Budget standout.", tier: "3", totalCents: 9900, pricedCards: 44, imageUrl: `${SITE}/b.png`, metaSharePct: 4, winRatePct: 63, top8s: 9 },
  { slug: "unpriced-deck", name: "Unpriced Deck", archetype: "Aggro", description: "No prices yet.", tier: "3", totalCents: 0, pricedCards: 0, imageUrl: null, winRatePct: 20, top8s: 1 },
];

const optsFor = (code: keyof typeof COUNTRIES) => ({
  siteUrl: SITE,
  setLabel: "Vendetta",
  metaUpdated: "2026-08-04",
  info: COUNTRIES[code],
});

// ── JSON-LD shape ────────────────────────────────────────────────────────────

test("ItemList JSON-LD is serialisable and correctly typed", () => {
  const ld = JSON.parse(JSON.stringify(deckItemListLd(DECKS, optsFor("AU"))));
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "ItemList");
  assert.equal(ld.numberOfItems, DECKS.length);
  assert.equal(ld.itemListElement.length, DECKS.length);
  ld.itemListElement.forEach((el: Record<string, unknown>, i: number) => {
    assert.equal(el["@type"], "ListItem");
    assert.equal(el.position, i + 1, "positions must be 1-based and contiguous");
    const item = el.item as Record<string, unknown>;
    assert.equal(item["@type"], "Product");
    assert.ok(String(item.name).length > 0);
    assert.match(String(item.url), /^https:\/\/.+\/decks\/.+/);
  });
});

test("priced decks carry an AggregateOffer; unpriced decks carry none", () => {
  const ld = deckItemListLd(DECKS, optsFor("AU"));
  const items = ld.itemListElement.map((e) => e.item as Record<string, unknown>);
  const withOffers = items.filter((i) => i.offers);
  assert.equal(withOffers.length, 2, "only the two priced decks may advertise an offer");
  for (const item of withOffers) {
    const offer = item.offers as Record<string, unknown>;
    // AggregateOffer (lowPrice), NOT Offer (price): build cost is a floor across
    // many stores, not a single purchasable listing.
    assert.equal(offer["@type"], "AggregateOffer");
    assert.ok("lowPrice" in offer, "AggregateOffer uses lowPrice, not price");
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.ok(Number(offer.offerCount) > 0);
  }
});

test("no deck advertises a rating — win rate is not a review", () => {
  const raw = JSON.stringify(deckItemListLd(DECKS, optsFor("AU")));
  assert.ok(!raw.includes("aggregateRating"), "win rate must never be marked up as a rating");
  assert.ok(!raw.includes("ratingValue"), "win rate must never be marked up as a rating");
  assert.ok(!raw.includes('"review"'), "there are no reviews of these decks");
  // …but it must still be stated as what it is, in the description.
  const first = deckItemListLd(DECKS, optsFor("AU")).itemListElement[0].item as Record<string, unknown>;
  assert.match(String(first.description), /52% win rate/);
});

test("dateModified and datePublished come from the meta stamp", () => {
  const ld = deckItemListLd(DECKS, optsFor("AU")) as Record<string, unknown>;
  assert.equal(ld.dateModified, "2026-08-04");
  assert.equal(ld.datePublished, "2026-08-04");
});

// ── Region correctness: the whole point ──────────────────────────────────────

test("offer currency and price match the served market, for every market", () => {
  for (const c of COUNTRY_LIST) {
    const ld = deckItemListLd(DECKS, optsFor(c.code));
    for (const el of ld.itemListElement) {
      const item = el.item as Record<string, unknown>;
      if (!item.offers) continue;
      const offer = item.offers as Record<string, unknown>;
      assert.equal(
        offer.priceCurrency,
        c.currency,
        `${c.code}: offer currency must be ${c.currency}, got ${offer.priceCurrency}`,
      );
    }
  }
});

test("JSON-LD lowPrice equals the figure the page renders", () => {
  for (const c of COUNTRY_LIST) {
    const ld = deckItemListLd(DECKS, optsFor(c.code));
    for (const [i, el] of ld.itemListElement.entries()) {
      const item = el.item as Record<string, unknown>;
      if (!item.offers) continue;
      const offer = item.offers as Record<string, unknown>;
      // The page renders formatMoney(totalCents, currency); the markup must be the
      // same underlying number, just unformatted.
      const visible = formatMoney(DECKS[i].totalCents, c.currency);
      const fromMarkup = formatMoney(Math.round(Number(offer.lowPrice) * 100), c.currency);
      assert.equal(fromMarkup, visible, `${c.code}/${DECKS[i].slug}: markup price must equal visible price`);
    }
  }
});

test("no currency is hardcoded in the builders", () => {
  const src = code("src/lib/deck-jsonld.ts");
  for (const iso of ["AUD", "USD", "GBP", "CAD", "SGD", "NZD"]) {
    assert.ok(!src.includes(`"${iso}"`), `deck-jsonld must not hardcode ${iso}`);
  }
  assert.match(src, /priceCurrency: o\.info\.currency/, "currency must come from the resolved market");
});

// ── FAQ ──────────────────────────────────────────────────────────────────────

test("FAQPage JSON-LD is correctly typed", () => {
  const ld = JSON.parse(JSON.stringify(deckFaqLd(DECKS, optsFor("UK"))));
  assert.equal(ld["@type"], "FAQPage");
  assert.ok(ld.mainEntity.length >= 3);
  for (const q of ld.mainEntity) {
    assert.equal(q["@type"], "Question");
    assert.equal(q.acceptedAnswer["@type"], "Answer");
    assert.ok(String(q.name).trim().endsWith("?"), `question must be a question: ${q.name}`);
    assert.ok(String(q.acceptedAnswer.text).length > 20);
  }
});

test("FAQ price answers are region-aware, never hardcoded A$", () => {
  for (const c of COUNTRY_LIST) {
    const budget = deckFaq(DECKS, optsFor(c.code)).find((q) => q.name.includes("budget"));
    assert.ok(budget, `${c.code}: budget question must exist`);
    const expected = formatMoney(9900, c.currency); // the cheapest fixture
    assert.ok(
      budget.acceptedAnswer.text.includes(expected),
      `${c.code}: budget answer must quote ${expected}, got: ${budget.acceptedAnswer.text}`,
    );
  }
});

test("the visible FAQ renders the same array that is marked up", () => {
  const page = read("src/app/decks/page.tsx");
  // One source, rendered twice — markup that isn't on the page violates Google's
  // structured-data guidelines.
  assert.match(page, /const faqs = deckFaq\(decks, ldOpts\)/);
  assert.match(page, /\{faqs\.map\(\(q\) => \(/);
  assert.ok(!page.includes("faqLd.mainEntity.map"), "render the shared array, not the LD object");
});

// ── Picks ────────────────────────────────────────────────────────────────────

test("cheapest ignores unpriced decks; best win rate picks the maximum", () => {
  assert.equal(cheapestDeck(DECKS)?.slug, "viktor-herald-of-the-arcane");
  assert.equal(bestWinRateDeck(DECKS)?.slug, "viktor-herald-of-the-arcane");
  assert.equal(cheapestDeck([]), null);
  assert.equal(bestWinRateDeck([]), null);
});

// ── Indexability hygiene ─────────────────────────────────────────────────────

test("the page keeps its self-referencing canonical and adds no fabricated hreflang", () => {
  const page = code("src/app/decks/page.tsx");
  assert.match(page, /alternates: pageAlternates\("\/decks"\)/, "canonical must self-reference via the shared helper");
  // Region is a cookie on ONE url set (lib/get-country.ts). hreflang alternates
  // would have to point at per-region URLs that do not exist — worse than none.
  assert.ok(!/hreflang/i.test(page), "no hreflang until region-segmented URLs exist");
  assert.ok(!page.includes("languages:"), "no per-locale alternates on a cookie-driven URL");
});

test("og:locale alternates cover every live market", () => {
  const page = read("src/app/decks/page.tsx");
  assert.match(page, /alternateLocale: COUNTRY_LIST\.map/, "alternates must be derived from COUNTRY_LIST");
  assert.match(page, /locale: "en_US"/);
});

test("/decks has its own OG image rather than the site-wide fallback", () => {
  const og = read("src/app/decks/opengraph-image.tsx");
  assert.match(og, /export const size = \{ width: 1200, height: 630 \}/);
  assert.match(og, /export const alt = /);
  // Region-neutral: an OG image is cached by the scraper, so a baked-in currency
  // would be wrong for five of six markets.
  for (const iso of ["AUD", "A$", "USD", "GBP"]) {
    assert.ok(!og.includes(iso), `OG image must stay region-neutral (found ${iso})`);
  }
});

test("the legacy keywords meta is gone", () => {
  const layout = read("src/app/layout.tsx");
  assert.ok(!/^\s*keywords:/m.test(layout), "keywords meta is ignored by Google and should not be emitted");
});

test("robots directives are untouched", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /index: true/);
  assert.match(layout, /follow: true/);
  // code(), not read(): this asserts /decks EMITS no noindex. It used to read the
  // raw file, so a comment merely EXPLAINING that some linked page is noindexed
  // failed it — which is the same prose-vs-code confusion the code() helper was
  // added for at the top of this file. Tightened at the same time to also reject
  // a `robots:` key in the metadata, which is the actual mechanism a future edit
  // would use to de-index this page.
  const page = code("src/app/decks/page.tsx");
  assert.ok(!/noindex/i.test(page), "/decks must stay indexable");
  assert.ok(!/^\s*robots:/m.test(page), "/decks must declare no robots override at all");
});

test("deck sitemap lastmod tracks the same stamp as dateModified", () => {
  const src = read("src/lib/sitemap-sections.ts");
  assert.match(src, /function decksModified/, "deck lastmod must fold in the meta-updated date");
  assert.match(src, /lastModified: decksModified\(day\)/, "/decks index entry must use it");
  assert.match(src, /const day = decksModified\(await priceDay\(\)\)/, "deck pages must use it");
  // And the stamp itself is the one the page renders.
  const stamp = (metaDecks as unknown as { _metaUpdated?: string })._metaUpdated;
  assert.match(String(stamp), /^\d{4}-\d{2}-\d{2}$/);
});

test("every deck card and guide link is a real href", () => {
  const page = read("src/app/decks/page.tsx");
  // Deck cards, callouts and guide links are all next/link, which emits <a href>.
  assert.match(page, /href=\{`\/decks\/\$\{d\.slug\}`\}/, "deck cards must link by href");
  assert.match(page, /href="\/guides\/best-riftbound-vendetta-decks"/);
  assert.match(page, /href="\/guides\/how-a-riftbound-deck-is-built"/);
  assert.ok(!/onClick=\{\(\) => (router|window\.location)/.test(page), "no JS-only navigation");
});

test("every image on the page has descriptive alt text", () => {
  const page = read("src/app/decks/page.tsx");
  const imgs = page.match(/<img[\s\S]{0,400}?\/>/g) ?? [];
  assert.ok(imgs.length > 0, "expected at least the deck art image");
  for (const img of imgs) {
    assert.match(img, /alt=\{/, "every <img> needs alt");
    assert.ok(!/alt=""/.test(img), "deck art is meaningful, not decorative");
  }
});

// ── Best Basket handoff: nofollow, not noindex ──────────────────────────────
// Reported directly: a site audit's duplicate-content export flagged 13 URLs
// under /tools/best-basket?list=..., one per deck, as byte-identical (same
// title/meta/H1/content-hash). best-basket's metadata is a static export and
// the tool itself is Premium-gated, so a crawler — never signed in, never
// Premium — renders the exact same "Go Premium" gate regardless of which
// list= it was given; the canonical (already present) keeps them out of the
// index, but nothing stopped Google spending a crawl on each one to find
// that out. Fixed at the source: the ONE internal link that mints a fresh
// list= per deck (DeckView.tsx's bestBasketHref) now carries rel="nofollow",
// the same convention already used for the dynamic /login?next= links (see
// components/UserMenu.tsx) — real for a signed-in visitor, nothing for a
// crawler to gain by following.
test("the Best Basket handoff link is nofollow", () => {
  const src = code("src/components/DeckView.tsx");
  const at = src.indexOf("bestBasketHref &&");
  assert.ok(at >= 0, "expected the conditional Best Basket link");
  const block = src.slice(at, src.indexOf("</Link>", at));
  assert.match(block, /<Link href=\{bestBasketHref\}[^>]*rel="nofollow"/, "the handoff link must be nofollow");
});

test("best-basket's own Sign-in link is nofollow when it carries a list=", () => {
  const src = code("src/app/tools/best-basket/page.tsx");
  const at = src.indexOf("login?next=");
  assert.ok(at >= 0, "expected the Sign-in-free login link");
  const block = src.slice(src.lastIndexOf("<Link", at), src.indexOf("</Link>", at));
  assert.match(block, /rel="nofollow"/, "the list-carrying login link must be nofollow too");
});

// The deliberate OTHER side of this decision: /deck?list=... (the free deck
// builder/pricer, no Premium gate) computes a real per-list total server-side
// and ships it in a dynamic OG card for link-sharing — genuinely differentiated
// content, unlike best-basket's static gate. Its own canonical already keeps it
// out of the index, so nofollowing builderHref too would just cost Google the
// chance to see that real content, for no corresponding benefit. Pinned so a
// future "make it consistent with bestBasketHref" edit doesn't quietly do that.
test("the free Deck Builder handoff link is NOT nofollow — it has real per-list content", () => {
  const src = code("src/components/DeckView.tsx");
  const at = src.indexOf("<Link href={builderHref}");
  assert.ok(at >= 0, "expected the Deck Builder link");
  const block = src.slice(at, src.indexOf("</Link>", at));
  assert.ok(!/rel="nofollow"/.test(block), "builderHref must stay followable — /deck computes real content per list=");
});
