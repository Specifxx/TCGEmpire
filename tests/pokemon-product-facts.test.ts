import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HISTORY_MIN_POINTS, productFacts, productFaq, productProse, type ProductFacts } from "../src/lib/pokemon/product-facts";
import { proseText, setFacts, setProse } from "../src/lib/pokemon/set-facts";
import { productDescription, setDescription, setTitle } from "../src/lib/pokemon/seo";
import type { PkCatalog, PkOfferRow, PkProductDetail } from "../src/lib/pokemon/types";
import { textViolations } from "./helpers/pokemon-copy";

// The product page's data-led paragraphs and FAQ (lib/pokemon/product-facts.ts)
// and the set page's (lib/pokemon/set-facts.ts), over variants of the real
// 30th Celebration ETB (tests/fixtures/pokemon-product-etb.json) and the
// trimmed US catalogue. The rules: a block appears only when its fact exists;
// a source or market is named only when it holds a row; release dates are
// what TCGplayer lists; every price carries its currency; no banned wording.

const catalog = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const base = JSON.parse(readFileSync("tests/fixtures/pokemon-product-etb.json", "utf8")) as PkProductDetail;
// Fixture rows were read at 12:42 UTC; offers go stale after 72h.
const NOW = Date.parse("2026-10-01T18:00:00Z");

const ebay = (market: string, currency: string, cents: number): PkOfferRow => ({
  market,
  source: "ebay",
  priceCents: cents,
  currency,
  shippingCents: 500,
  url: "https://www.ebay.com/itm/1",
  title: "30th Celebration Elite Trainer Box",
  inStock: true,
  checkedAt: "2026-10-01T10:00:00.000Z",
});

const VARIANTS: Record<string, PkProductDetail> = {
  usOnly: { ...base, offers: base.offers.filter((o) => o.market === "US") },
  allMarkets: { ...base, offers: [...base.offers, ebay("UK", "GBP", 9_900), ebay("AU", "AUD", 21_000), ebay("CA", "CAD", 18_000), ebay("EU", "EUR", 9_000)] },
  noListing: { ...base, offers: base.offers.filter((o) => o.source === "tcgplayer_market") },
  presale: { ...base, presale: true, releasedOn: "2026-11-06", set: { ...(base.set as NonNullable<PkProductDetail["set"]>), releasedOn: "2026-11-06" } },
  noPackCount: { ...base, packCount: null, packCountFrom: null },
  history: {
    ...base,
    history: Array.from({ length: HISTORY_MIN_POINTS + 10 }, (_, i) => ({
      day: new Date(Date.parse("2026-08-23T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10),
      cents: 15_000 + ((i * 37) % 900),
    })),
  },
  noRelease: { ...base, releasedOn: null },
};

function render(p: PkProductDetail, cat: PkCatalog | null = catalog) {
  const facts = productFacts(p, cat, NOW);
  const prose = productProse(facts);
  const faq = productFaq(facts);
  const description = productDescription(facts);
  const all = [...prose.map((b) => b.text), ...faq.flatMap((f) => [f.q, f.a]), description];
  return { facts, prose, faq, description, all, ids: prose.map((b) => b.id) };
}

/** Every amount with two decimals carries a formatMoney symbol. */
function bareMoney(text: string): string[] {
  return [...text.matchAll(/(US\$|A\$|C\$|S\$|£|€)?\d[\d,]*\.\d\d\b/g)].filter((m) => !m[1]).map((m) => m[0]);
}

function checkStrings(label: string, strings: string[]) {
  for (const s of strings) {
    assert.deepEqual(textViolations(s), [], `${label}: ${s}`);
    assert.doesNotMatch(s, /\b(?:NaN|null|undefined)\b|\[object/, `${label}: ${s}`);
    assert.doesNotMatch(s, /\btoday\b/i, `${label}: "as of {date}", never today: ${s}`);
    assert.deepEqual(bareMoney(s), [], `${label}: money without a currency symbol: ${s}`);
  }
}

test("every variant: no banned words, no NaN/null/undefined, every price has its currency", () => {
  for (const [name, p] of Object.entries(VARIANTS)) {
    checkStrings(name, render(p).all);
    checkStrings(`${name} (no catalogue)`, render(p, null).all);
  }
});

test("US only: pack math, set and same-kind comparisons, markets say no listing outside the US", () => {
  const r = render(VARIANTS.usOnly);
  assert.deepEqual(r.ids, ["pack-math", "set-per-pack", "same-kind", "markets", "timeline"]);
  const text = (id: string) => r.prose.find((b) => b.id === id)?.text ?? "";
  assert.match(text("pack-math"), /^Holds 9 booster packs \(from its contents list\)\. At the cheapest US listing, US\$115\.00 on TCGplayer, as of 1 Oct 2026, that is US\$12\.78 a pack\.$/);
  assert.match(text("markets"), /^Outside the United States we have no tracked listing/);
  assert.doesNotMatch(r.all.join(" "), /Cardmarket|eBay listing|eBay UK/, "no source without rows");
  assert.match(text("markets"), /In Singapore we track no listings/);
  assert.match(text("timeline"), /^TCGplayer lists 16 Sep 2026 as its release date, the same date it lists for 30th Celebration\.$/);
  assert.equal(r.facts.ebayMarkets.length, 0);
});

test("all markets: each market named with its own source and currency; eBay markets reach the description", () => {
  const r = render(VARIANTS.allMarkets);
  const markets = r.prose.find((b) => b.id === "markets")?.text ?? "";
  assert.match(markets, /In Australia the cheapest matching eBay listing we track is A\$210\.00/);
  assert.match(markets, /the United Kingdom, £99\.00 on eBay/);
  assert.match(markets, /Canada, C\$180\.00 on eBay/);
  // EU: Cardmarket's €85.00 is cheaper than the eBay row, and the cheapest open listing is the one named.
  assert.match(markets, /the EU, €85\.00 on Cardmarket/);
  assert.doesNotMatch(markets, /no tracked listing/);
  assert.deepEqual([...r.facts.ebayMarkets].sort(), ["AU", "CA", "EU", "UK"]);
  const q = r.faq.find((f) => f.q.startsWith("Which markets"));
  assert.ok(q && /Australia \(eBay Australia\)/.test(q.a));
});

test("no listing: no per-pack figure, no ranking, no cheapest-listing question", () => {
  const r = render(VARIANTS.noListing);
  assert.ok(!r.ids.includes("set-per-pack"));
  assert.match(r.prose[0].text, /With no open US listing, as of 1 Oct 2026, there is no US price per pack to show\./);
  const same = r.prose.find((b) => b.id === "same-kind")?.text ?? "";
  assert.match(same, /^For comparison/, "never ranked without its own figure");
  assert.ok(!r.faq.some((f) => /cheapest/.test(f.q)));
  assert.ok(!r.faq.some((f) => /Which markets/.test(f.q)), "no market holds a listing");
  assert.ok(!r.facts.markets.some((m) => m.listing));
  assert.doesNotMatch(r.description, /US\$/);
});

test("pre-order: attributed date, pre-order wording, never ranked against released products", () => {
  const r = render(VARIANTS.presale);
  const timeline = r.prose.find((b) => b.id === "timeline")?.text ?? "";
  assert.equal(timeline, "A pre-order: TCGplayer lists 6 Nov 2026 as its release date, the same date it lists for 30th Celebration.");
  assert.match(r.prose[0].text, /cheapest US pre-order listing/);
  assert.match(r.prose.find((b) => b.id === "same-kind")?.text ?? "", /^For comparison/);
  assert.match(r.prose.find((b) => b.id === "set-per-pack")?.text ?? "", /30th Celebration's pre-orders/);
  const when = r.faq.find((f) => f.q.startsWith("When does"));
  assert.ok(when && /TCGplayer lists 6 Nov 2026/.test(when.a) && /pre-orders/.test(when.a));
  assert.match(r.description, /pre-order, TCGplayer lists 6 Nov 2026/);
});

test("no pack count: no pack math, no per-pack comparison, no packs question", () => {
  const r = render(VARIANTS.noPackCount);
  assert.ok(!r.ids.includes("pack-math") && !r.ids.includes("set-per-pack"));
  assert.ok(!r.faq.some((f) => /How many booster packs/.test(f.q)));
  assert.doesNotMatch(r.description, /booster packs/);
  assert.equal(r.facts.us?.perPackCents, null);
});

test("history: only from the minimum number of daily points, in the past tense", () => {
  assert.ok(!render(VARIANTS.usOnly).ids.includes("history"), "one point is no history");
  const r = render(VARIANTS.history);
  const h = r.prose.find((b) => b.id === "history")?.text ?? "";
  assert.match(h, /^Over 40 daily readings from 23 Aug 2026 to 1 Oct 2026, TCGplayer's market price for it ranged from US\$\d+\.\d\d \(\d+ \w+ 2026\) to US\$\d+\.\d\d/);
  assert.doesNotMatch(h, /\bwill\b|trend|expect/i);
});

test("no release date: no timeline and no release question", () => {
  const r = render(VARIANTS.noRelease);
  assert.ok(!r.ids.includes("timeline"));
  assert.ok(!r.faq.some((f) => /come out/.test(f.q)));
});

test("without the US catalogue only the comparisons go", () => {
  const r = render(VARIANTS.usOnly, null);
  assert.deepEqual(r.ids, ["pack-math", "markets", "timeline"]);
  assert.equal(r.facts.setPerPack, null);
  assert.equal(r.facts.sameKind, null);
});

test("FAQ: only answerable questions, each answer carries its figures", () => {
  const r = render(VARIANTS.usOnly);
  assert.deepEqual(
    r.faq.map((f) => f.q),
    [
      "How many booster packs are in the 30th Celebration Elite Trainer Box?",
      "What is the cheapest 30th Celebration Elite Trainer Box listing you track in the United States?",
      "When did the 30th Celebration Elite Trainer Box come out?",
      "Which markets have a tracked listing for the 30th Celebration Elite Trainer Box?",
    ],
  );
  assert.match(r.faq[1].a, /^US\$115\.00 on TCGplayer \(US\$12\.78 a pack\), item price, postage extra, as of 1 Oct 2026\.$/);
  assert.match(r.faq[3].a, /^As of 1 Oct 2026: the United States \(TCGplayer\)\./);
});

test("the same-kind table uses this product's own figure and ranks it", () => {
  const f: ProductFacts = render(VARIANTS.allMarkets).facts;
  const mine = f.sameKind?.rows.find((r) => r.isThis);
  // The variant's own cheapest US listing (TCGplayer US$115.00), never the catalogue's copy.
  assert.equal(mine?.cents, f.us?.cents);
  assert.equal(new Set(f.sameKind?.rows.map((r) => r.slug)).size, f.sameKind?.rows.length, "no product twice");
  const same = render(VARIANTS.usOnly).prose.find((b) => b.id === "same-kind")?.text ?? "";
  assert.match(same, /its US\$12\.78 a pack is the (?:lowest|highest|\w+ lowest of \w+)/);
});

// ── Set pages ────────────────────────────────────────────────────────────────

test("set facts and prose for every fixture set: clean strings, blocks only with their facts", () => {
  for (const s of catalog.sets) {
    const f = setFacts(catalog, s.slug, "2026-10-01");
    assert.ok(f, s.slug);
    const blocks = setProse(f);
    const strings = [...blocks.map((b) => proseText(b.parts)), setDescription(f), setTitle(f.name, { perPack: f.countable })];
    checkStrings(s.slug, strings);
    const ids = blocks.map((b) => b.id);
    assert.equal(ids.includes("per-pack"), f.cheapest.some((c) => c.perPackCents != null), `${s.slug}: per-pack block iff a figure`);
    assert.equal(ids.includes("neighbours"), f.boxes != null, s.slug);
    assert.equal(ids.includes("preorders"), f.preorders.count > 0, s.slug);
    for (const b of blocks) for (const p of b.parts) if (typeof p !== "string") assert.match(p.href, /^\/pokemon\/(?:sets|sealed)\/[a-z0-9-]+$/);
  }
  assert.equal(setFacts(catalog, "no-such-set", "2026-10-01"), null);
});

test("set facts: a pre-order set, a released set with neighbours, a set without per-pack kinds", () => {
  const delta = setFacts(catalog, "delta-reign", "2026-10-01");
  assert.ok(delta?.upcoming);
  const deltaText = setProse(delta).map((b) => proseText(b.parts)).join(" ");
  assert.match(deltaText, /Pre-orders open; TCGplayer lists 6 Nov 2026 for the set\./);
  assert.match(deltaText, /cheapest pre-order listing/);
  assert.match(setDescription(delta), /^Delta Reign: 14 sealed products, TCGplayer lists Nov 2026/);

  const pf = setFacts(catalog, "phantasmal-flames", "2026-10-01");
  assert.ok(pf?.boxes?.earlier || pf?.boxes?.later, "a neighbour with a booster box figure");
  const nb = setProse(pf).find((b) => b.id === "neighbours");
  assert.ok(nb && nb.parts.some((p) => typeof p !== "string" && p.href.startsWith("/pokemon/sets/")), "neighbours are linked");
  assert.match(proseText(nb.parts), /^Phantasmal Flames' booster box comes to US\$\d+\.\d\d a pack/);
  assert.match(setDescription(pf), /^Phantasmal Flames: \d+ sealed products, released Nov 2025: booster box from US\$/);
  assert.equal(pf.nav.newer?.slug, "ascended-heroes");
  assert.equal(pf.nav.older?.slug, "mega-evolution");

  const fp = setFacts(catalog, "first-partner-collection-2026", "2026-10-01");
  assert.ok(fp && !fp.cheapest.some((c) => c.perPackCents != null));
  assert.equal(fp.countable, false, "no box, ETB or bundle with a pack count");
  assert.equal(pf.countable, true);
  assert.ok(!setProse(fp).some((b) => b.id === "per-pack"));
  assert.equal(setTitle(fp.name, { perPack: false }), "First Partner Collection 2026 Sealed Prices");
  // The mix sentence counts every product.
  const mix = setProse(fp).find((b) => b.id === "mix");
  assert.match(proseText(mix?.parts ?? []), /^We price 6 sealed products from First Partner Collection 2026: /);
});
