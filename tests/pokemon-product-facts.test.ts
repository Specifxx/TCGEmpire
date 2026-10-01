import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBoard } from "../src/lib/pokemon/board";
import { HISTORY_MIN_POINTS, catalogAgrees, productFacts, productFaq, productProse, type ProductFacts } from "../src/lib/pokemon/product-facts";
import { proseText, setFacts, setProse } from "../src/lib/pokemon/set-facts";
import { toDisplay } from "../src/lib/pokemon/browse";
import { isHalfBox, PER_PACK_KINDS } from "../src/lib/pokemon/value";
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

// The catalogue as the same import would have built it for this variant: its
// tile for the product carries the variant's own US headline (productFacts
// leaves out a catalogue that disagrees, as a stale memo would).
function sameImport(p: PkProductDetail, cat: PkCatalog): PkCatalog {
  const low = buildBoard(p.name, p.offers, "US", { page: "/", surface: "product", now: NOW }).headline?.priceCents ?? null;
  const tile = cat.tiles.find((t) => t.slug === p.slug);
  const synced = tile ? { ...tile, lowCents: low } : { ...cat.tiles[0], id: p.id, slug: p.slug, name: p.name, kind: p.kind, setSlug: p.set?.slug ?? null, lowCents: low };
  return { ...cat, tiles: [...cat.tiles.filter((t) => t.slug !== p.slug), synced] };
}

function render(p: PkProductDetail, cat: PkCatalog | null = catalog) {
  const facts = productFacts(p, cat ? sameImport(p, cat) : null, NOW);
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
    assert.equal(ids.includes("per-pack"), f.perPack.length > 0, `${s.slug}: per-pack block iff a figure`);
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
  assert.match(setDescription(pf), /^Phantasmal Flames: \d+ sealed products, TCGplayer lists Nov 2025: booster box from US\$/);
  assert.equal(pf.nav.newer?.slug, "ascended-heroes");
  assert.equal(pf.nav.older?.slug, "mega-evolution");

  const fp = setFacts(catalog, "first-partner-collection-2026", "2026-10-01");
  assert.ok(fp && fp.perPack.length === 0);
  assert.equal(fp.countable, false, "no box, ETB or bundle with a pack count");
  assert.equal(pf.countable, true);
  assert.ok(!setProse(fp).some((b) => b.id === "per-pack"));
  assert.equal(setTitle(fp.name, { perPack: false }), "First Partner Collection 2026 Sealed Prices");
  // The mix sentence counts every product.
  const mix = setProse(fp).find((b) => b.id === "mix");
  assert.match(proseText(mix?.parts ?? []), /^We price 6 sealed products from First Partner Collection 2026: /);
});

// ── Per pack means per pack ──────────────────────────────────────────────────
// A kind's cheapest listing can have no pack count: Mega Evolution's Enhanced
// booster box (US$279.99, no count) undercuts its 36-pack box (US$291.00,
// US$8.08 a pack). Picking each kind by listing price dropped the counted box
// from every comparison, so the set page called the bundle the lowest per pack
// and the box and bundle pages contradicted each other.

const usOffer = base.offers.find((o) => o.market === "US" && o.source === "tcgplayer") as PkOfferRow;
const megaSet = { slug: "mega-evolution", name: "Mega Evolution", code: "MEG", releasedOn: "2025-09-26" };
const mega = (slug: string, name: string, kind: PkProductDetail["kind"], packCount: number, cents: number): PkProductDetail => ({
  ...base,
  slug,
  name,
  kind,
  set: megaSet,
  releasedOn: megaSet.releasedOn,
  packCount,
  packCountFrom: "name",
  contents: [],
  siblings: [],
  offers: [{ ...usOffer, priceCents: cents }],
  history: [],
});

test("set facts: each kind's per-pack figure is its lowest, whatever its cheapest listing", () => {
  for (const s of catalog.sets) {
    const f = setFacts(catalog, s.slug, "2026-10-01");
    assert.ok(f);
    const tiles = catalog.tiles.filter((t) => t.setSlug === s.slug);
    const released = tiles.filter((t) => !t.presale);
    const pool = (released.length ? released : tiles).filter((t) => t.lowCents != null && t.perPackCents != null && !isHalfBox(t));
    for (const k of PER_PACK_KINDS) {
      const lows = pool.filter((t) => t.kind === k).map((t) => t.perPackCents as number);
      assert.equal(f.perPack.find((c) => c.kind === k)?.perPackCents ?? null, lows.length ? Math.min(...lows) : null, `${s.slug} ${k}`);
    }
    // The paragraph's "lowest" is the lowest of every counted product in the pool.
    if (f.perPack.length) assert.equal(f.perPack[0].perPackCents, Math.min(...pool.filter((t) => (PER_PACK_KINDS as readonly string[]).includes(t.kind)).map((t) => t.perPackCents as number)), s.slug);
  }
});

test("Mega Evolution: the 36-pack box is the lowest per pack, on the set page and on both product pages", () => {
  const f = setFacts(catalog, "mega-evolution", "2026-10-01");
  assert.ok(f);
  assert.deepEqual(
    f.perPack.map((c) => [c.kind, c.slug, c.perPackCents]),
    [
      ["booster-box", "mega-evolution-booster-box", 808],
      ["booster-bundle", "mega-evolution-booster-bundle", 983],
      ["etb", "mega-evolution-elite-trainer-box-mega-gardevoir", 1111],
      ["pc-etb", "mega-evolution-pokemon-center-elite-trainer-box-exclusive-mega-gardevoir", 1754],
    ],
  );
  // The "from" figure is still the kind's cheapest listing.
  assert.equal(f.cheapest.find((c) => c.kind === "booster-box")?.slug, "mega-evolution-enhanced-booster-box");
  const perPack = proseText(setProse(f).find((b) => b.id === "per-pack")?.parts ?? []);
  assert.match(perPack, /the lowest price per pack in Mega Evolution is the booster box: Mega Evolution Booster Box at US\$8\.08 a pack, against US\$9\.83 a pack for the booster bundle/);
  assert.ok(f.boxes, "a booster box figure, so a neighbours block");

  // Its neighbours count it: Phantasmal Flames' nearest earlier set with a box figure is Mega Evolution.
  const pf = setFacts(catalog, "phantasmal-flames", "2026-10-01");
  assert.equal(pf?.boxes?.earlier?.slug, "mega-evolution");
  assert.match(proseText(setProse(pf as NonNullable<typeof pf>).find((b) => b.id === "neighbours")?.parts ?? []), /Of the sets whose booster box has a known pack count and a listing we track there, the nearest earlier by the dates TCGplayer lists, Mega Evolution, is at US\$8\.08 a pack/);

  const bundle = render(mega("mega-evolution-booster-bundle", "Mega Evolution Booster Bundle", "booster-bundle", 6, 5_899));
  const bundleText = bundle.prose.find((b) => b.id === "set-per-pack")?.text ?? "";
  assert.doesNotMatch(bundleText, /the lowest/, "the bundle never claims to be lowest");
  assert.match(bundleText, /^Per pack, it sits between Mega Evolution's booster box at US\$8\.08 a pack and its Pokémon Center ETB at US\$17\.54 a pack/);
  const box = render(mega("mega-evolution-booster-box", "Mega Evolution Booster Box", "booster-box", 36, 29_100));
  assert.match(box.prose.find((b) => b.id === "set-per-pack")?.text ?? "", /^Per pack, it is the lowest of Mega Evolution's sealed kinds with a known pack count at their cheapest US listings: the booster bundle at US\$9\.83 a pack/);
});

test("set prose: the UK shown in euros marks every figure ≈ and says it is converted", () => {
  const uk: PkCatalog = { ...catalog, market: "UK", currency: "EUR", tiles: toDisplay(catalog.tiles, true) };
  const f = setFacts(uk, "phantasmal-flames", "2026-10-01");
  assert.ok(f?.converted);
  const text = setProse(f).map((b) => proseText(b.parts)).join(" ");
  assert.match(text, /in the United Kingdom \(converted from GBP\)/);
  assert.match(setDescription(f), /booster box from ≈ €/);
  // Every euro figure carries its ≈.
  assert.deepEqual([...text.matchAll(/(≈ )?€[\d,.]+/g)].filter((m) => !m[1]).map((m) => m[0]), []);
  assert.ok(text.includes("€"));
  checkStrings("uk-eur", [text, setDescription(f)]);
  assert.equal(setFacts(catalog, "phantasmal-flames", "2026-10-01")?.converted, false);
});

test("a half box never takes the booster box's place in its set's per-pack comparison", () => {
  const half = catalog.tiles.find((t) => t.setSlug === "perfect-order" && isHalfBox(t));
  const full = catalog.tiles.find((t) => t.setSlug === "perfect-order" && t.kind === "booster-box" && !isHalfBox(t));
  assert.ok(half && full && full.perPackCents != null, "fixture holds Perfect Order's half and full boxes");
  // Listed cheap enough to be the lowest per pack of the set: the old code then
  // claimed "the lowest" while leaving the full box out entirely.
  const p: PkProductDetail = {
    ...base,
    id: half.id,
    slug: half.slug,
    name: half.name,
    kind: "booster-box",
    set: { slug: "perfect-order", name: "Perfect Order", code: null, releasedOn: "2026-03-27" },
    releasedOn: "2026-03-27",
    presale: false,
    packCount: 18,
    packCountFrom: "name",
    offers: [{ market: "US", source: "tcgplayer", priceCents: 9_000, currency: "USD", shippingCents: null, url: "https://www.tcgplayer.com/product/1", title: null, inStock: true, checkedAt: "2026-10-01T12:00:00.000Z" }],
  };
  const { facts, prose } = render(p);
  const rows = facts.setPerPack ?? [];
  assert.ok(rows.some((r) => r.isThis && r.slug === half.slug), "the half box is its own row");
  assert.ok(rows.some((r) => !r.isThis && r.slug === full.slug), "the full box keeps its place");
  const text = prose.find((b) => b.id === "set-per-pack")?.text ?? "";
  assert.match(text, /booster box at US\$/, text);
});

test("as of: a UK eBay listing checked days ago dates the page, not today's TCGplayer rows", () => {
  const old = { ...ebay("UK", "GBP", 9_900), checkedAt: "2026-09-29T09:00:00.000Z" };
  const { facts, all } = render({ ...base, offers: [...base.offers, old] });
  assert.equal(facts.asOf, "as of 29 Sep 2026");
  assert.ok(all.every((t) => !/as of 1 Oct 2026/i.test(t)), "no figure is dated by the newer rows");
});

test("a catalogue from another import is left out of the comparisons, as on a read error", () => {
  const fresh = productFacts(base, sameImport(base, catalog), NOW);
  assert.ok(fresh.sameKind || fresh.setPerPack, "the same import compares");
  // The catalogue's tile still has yesterday's price: a warm instance's memo.
  const stale = { ...catalog, tiles: catalog.tiles.map((t) => (t.slug === base.slug ? { ...t, lowCents: (t.lowCents ?? 0) + 500 } : t)) };
  const f = productFacts(base, stale, NOW);
  assert.equal(f.sameKind, null);
  assert.equal(f.setPerPack, null);
  assert.equal(catalogAgrees(null, base.slug, 1), false);
  assert.equal(catalogAgrees({ ...catalog, tiles: [] }, base.slug, null), false, "a product the catalogue does not know yet");
});
