import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BELOW_MARKET_MIN_REF_CENTS,
  BELOW_MARKET_ROWS,
  COMING_UP_TILES,
  HOME_PER_PACK_MIN,
  HOME_PER_PACK_ROWS,
  SHOP_KINDS,
  belowMarket,
  buildHome,
  comingUp,
  daysUntil,
  daysWording,
  heroLine,
  homeStats,
  marketListingSources,
  newestSets,
  perPackBoard,
  shopByType,
} from "../src/lib/pokemon/home";
import {
  KIND_HUBS,
  PER_PACK_METHOD,
  PER_PACK_MIN_SECTION,
  PER_PACK_SECTION,
  PER_PACK_TOP,
  hubFacts,
  hubFaq,
  hubForKind,
  hubProse,
  hubTiles,
  kindHref,
  kindHub,
  perPackPage,
  proseLabel,
} from "../src/lib/pokemon/hubs";
import { listingSourceList, pokemonFaq, sourceList } from "../src/lib/pokemon/copy";
import { SEARCH_TITLE_TAIL, parseBrowse, sealedIndexing, searchTitle } from "../src/lib/pokemon/browse";
import { isHalfBox } from "../src/lib/pokemon/value";
import { DESCRIPTION_MAX, TITLE_MAX } from "../src/lib/pokemon/seo";
import { textViolations } from "./helpers/pokemon-copy";
import type { Country } from "../src/lib/country";
import type { PkCatalog, PkTile } from "../src/lib/pokemon/types";

// The Pokémon homepage, kind hubs and price-per-pack builders
// (lib/pokemon/home.ts, lib/pokemon/hubs.ts), pinned against the trimmed real
// US catalogue and two markets derived from it here:
//   UK — no TCGplayer listings (they are US-only), eBay rows on the recent
//        boxes, ETBs and bundles, the reference converted;
//   SG — no tracked listing at all, the reference converted.
// Plus the hand-written copy those pages carry: no digits, no set names, no
// shared 8-word runs between the hubs' explainers.

const US = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const TODAY = "2026-10-01";
const SET_NAMES = US.sets.map((s) => s.name);

/** A market variant: every listing figure replaced, the reference converted. */
function variant(market: Country, currency: string, rate: number, listing: (t: PkTile) => number | null): PkCatalog {
  return {
    ...US,
    market,
    currency,
    sources: listing === noListing ? US.sources : [...US.sources, "ebay"],
    tiles: US.tiles.map((t) => {
      const low = listing(t);
      return {
        ...t,
        lowCents: low,
        lowSource: low != null ? "ebay" : null,
        openCount: low != null ? 1 : 0,
        refCents: t.refCents != null ? Math.round(t.refCents * rate) : null,
        perPackCents: low != null && t.packCount ? Math.round(low / t.packCount) : null,
      };
    }),
  };
}
const noListing = () => null;
const RECENT = new Set(["30th-celebration", "pitch-black", "chaos-rising", "perfect-order", "ascended-heroes", "phantasmal-flames", "delta-reign"]);
const UK = variant("UK", "GBP", 0.75, (t) =>
  ["booster-box", "etb", "pc-etb", "booster-bundle"].includes(t.kind) && t.setSlug && RECENT.has(t.setSlug) && t.refCents != null
    ? Math.round(t.refCents * 0.8)
    : null,
);
const SG = variant("SG", "SGD", 1.3, noListing);
const MARKETS: [Country, PkCatalog, string][] = [
  ["US", US, "USD"],
  ["UK", UK, "GBP"],
  ["SG", SG, "SGD"],
];

/** Every string in a value, and every number, for the NaN/null/undefined sweep. */
function walk(v: unknown, strings: string[], numbers: number[]): void {
  if (typeof v === "string") strings.push(v);
  else if (typeof v === "number") numbers.push(v);
  else if (Array.isArray(v)) v.forEach((x) => walk(x, strings, numbers));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, strings, numbers));
}
function assertClean(label: string, value: unknown): void {
  const strings: string[] = [];
  const numbers: number[] = [];
  walk(value, strings, numbers);
  for (const n of numbers) assert.ok(Number.isFinite(n), `${label}: a non-finite number`);
  for (const s of strings) assert.doesNotMatch(s, /\bNaN\b|\bnull\b|\bundefined\b|\[object /, `${label}: "${s}"`);
}
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
const shingles = (s: string, n = 8) => {
  const w = wordsOf(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};

test("fixture variants: UK has eBay-only listings, SG none, the reference converted in both", () => {
  assert.deepEqual(marketListingSources(US.tiles), ["tcgplayer"]);
  assert.deepEqual(marketListingSources(UK.tiles), ["ebay"]);
  assert.deepEqual(marketListingSources(SG.tiles), []);
  assert.ok(UK.tiles.some((t) => t.perPackCents != null && !t.presale));
});

test("sourceList names eBay only when there are eBay rows; listingSourceList names listings only", () => {
  assert.equal(sourceList(["tcgplayer", "tcgplayer_market"]), "TCGplayer");
  assert.equal(sourceList(["tcgplayer_market", "cardmarket"]), "TCGplayer and Cardmarket");
  assert.equal(sourceList(["tcgplayer", "ebay"]), "TCGplayer and eBay");
  assert.equal(sourceList(["tcgplayer", "cardmarket_trend", "ebay"]), "TCGplayer, Cardmarket and eBay");
  assert.equal(sourceList([]), "TCGplayer");
  assert.doesNotMatch(sourceList(US.sources), /eBay/, "the fixture holds no eBay rows");
  assert.equal(listingSourceList([]), "");
  assert.equal(listingSourceList(["ebay", "tcgplayer"]), "TCGplayer and eBay");
});

test("homeStats: counts, this market's sources and the as-of date", () => {
  const us = homeStats(US);
  assert.equal(us.products, US.tiles.length);
  assert.equal(us.sets, US.sets.length);
  assert.equal(us.sourceList, "TCGplayer");
  assert.equal(us.asOf, "as of 1 Oct 2026");
  assert.equal(homeStats(UK).sourceList, "TCGplayer and eBay");
  assert.deepEqual(homeStats(SG).listingSources, []);
  assert.equal(homeStats(SG).sourceList, "TCGplayer", "the reference only: no Cardmarket or TCGplayer listing in Singapore");
  assert.equal(homeStats({ ...US, tiles: [], sets: [], pricesAsOf: null }).asOf, null);
  assert.equal(us.listed, US.tiles.filter((t) => t.lowCents != null).length);
  assert.ok(us.listed < us.products, "the fixture has products with no listing, as the real catalogue does");
  assert.equal(homeStats(SG).listed, 0);
  assert.deepEqual(us.sources, ["tcgplayer", "tcgplayer_market"], "this market's, not the catalogue's every-market list");
  assert.ok(US.sources.includes("cardmarket"), "the fixture's catalogue-wide list does name Cardmarket");
});

test("hero line: counts the products with a listing, never promises one for each", () => {
  const lines = MARKETS.map(([m, c]) => [m, heroLine(homeStats(c), m === "US" ? "the United States" : m === "UK" ? "the United Kingdom" : "Singapore", m !== "US")] as const);
  for (const [m, line] of lines) {
    assertClean(m, line);
    assert.deepEqual(textViolations(line), [], `${m}: ${line}`);
    assert.doesNotMatch(line, /for each one|for every product|each product shows/i, `${m}: ${line}`);
  }
  const [us, uk, sg] = lines.map(([, l]) => l);
  const usStats = homeStats(US);
  assert.match(us, new RegExp(`cheapest TCGplayer listing in the United States for ${usStats.listed} of them`));
  assert.match(us, /where it publishes one/);
  assert.doesNotMatch(us, /≈/);
  assert.match(uk, new RegExp(`cheapest eBay listing in the United Kingdom for ${homeStats(UK).listed} of them`));
  assert.doesNotMatch(uk, /TCGplayer listing/);
  assert.match(uk, /converted, marked ≈/);
  assert.match(sg, /We track no listings in Singapore/);
  assert.doesNotMatch(sg, /cheapest/);
  const all = { ...US, tiles: US.tiles.filter((t) => t.lowCents != null) };
  assert.match(heroLine(homeStats(all), "the United States", false), /for every one of them/);
  assert.equal(heroLine(homeStats({ ...US, tiles: [], sets: [] }), "the United States", false), "No prices yet.");
});

test("hub FAQ from this market's sources: no Cardmarket outside it, no TCGplayer listing in Singapore", () => {
  const text = (c: PkCatalog) =>
    pokemonFaq(homeStats(c).sources)
      .map((f) => `${f.q} ${f.a}`)
      .join(" ");
  const us = text(US);
  assert.doesNotMatch(us, /Cardmarket/, "US has no Cardmarket rows even though the catalogue's list does");
  assert.match(us, /cheapest TCGplayer listing/);
  assert.doesNotMatch(us, /checked in rotation|we also search eBay/);
  const sg = text(SG);
  assert.doesNotMatch(sg, /Cardmarket|cheapest TCGplayer listing|checked in rotation/);
  assert.match(sg, /TCGplayer listings are shown in the United States only/);
  const uk = text(UK);
  assert.match(uk, /we also search eBay/);
  assert.doesNotMatch(uk, /Cardmarket|cheapest TCGplayer listing/);
  for (const t of [us, sg, uk]) assert.deepEqual(textViolations(t), []);
});

test("perPackBoard: three hub groups, top five, lowest per pack first, no pre-orders; SG empty", () => {
  const us = perPackBoard(US, "US");
  assert.deepEqual(
    us.map((g) => g.hub.slug),
    ["booster-boxes", "elite-trainer-boxes", "booster-bundles"],
  );
  for (const g of us) {
    assert.ok(g.rows.length >= HOME_PER_PACK_MIN && g.rows.length <= HOME_PER_PACK_ROWS);
    for (const t of g.rows) {
      assert.equal(t.presale, false);
      assert.ok((g.hub.kinds as readonly string[]).includes(t.kind));
      assert.ok(t.lowCents != null && t.perPackCents != null);
    }
    for (let i = 1; i < g.rows.length; i++) assert.ok((g.rows[i - 1].perPackCents as number) <= (g.rows[i].perPackCents as number));
  }
  assert.ok(
    us.find((g) => g.hub.slug === "elite-trainer-boxes")?.rows.some((t) => t.kind === "pc-etb"),
    "the ETB group ranks Pokémon Center ETBs too",
  );
  assert.deepEqual(perPackBoard(SG, "SG"), []);
  assert.deepEqual(perPackBoard(US, "SG"), [], "SG never ranks, whatever it is handed");
  const uk = perPackBoard(UK, "UK");
  assert.ok(uk.length > 0 && uk.every((g) => g.rows.every((t) => t.lowSource === "ebay" && !t.presale)));
  const thin = { ...US, tiles: US.tiles.filter((t) => t.kind !== "booster-bundle" || t.setSlug === "perfect-order") };
  assert.ok(!perPackBoard(thin, "US").some((g) => g.hub.slug === "booster-bundles"), "a group under three rows is dropped");
});

test("comingUp: the next set with pre-orders, day wording, pre-orders grouped by date", () => {
  const c = comingUp(US, TODAY);
  assert.equal(c.next?.set.slug, "delta-reign");
  assert.equal(c.next?.days, 36);
  assert.equal(c.total, US.tiles.filter((t) => t.presale).length);
  const tiles = c.groups.flatMap((g) => g.tiles);
  assert.ok(tiles.length > 0 && tiles.length <= COMING_UP_TILES);
  assert.ok(tiles.every((t) => t.presale && !isHalfBox(t)));
  assert.ok(tiles.some((t) => t.kind === "booster-box"), "box-shaped kinds come first");
  const dates = c.groups.map((g) => g.releasedOn ?? "9999");
  assert.deepEqual(dates, [...dates].sort(), "groups ascend by the date TCGplayer lists");
  for (const g of c.groups) assert.ok(g.tiles.every((t) => t.releasedOn === g.releasedOn));
  assert.equal(daysUntil("2026-11-06", "2026-10-01"), 36);
  assert.equal(daysUntil("2026-10-01", new Date("2026-10-01T23:00:00Z")), 0);
  assert.equal(daysWording(0), "today");
  assert.equal(daysWording(1), "tomorrow");
  assert.equal(daysWording(36), "in 36 days");
  assert.equal(comingUp(US, "2026-11-06").next?.days, 0, "release day itself still counts as coming up");
  assert.equal(comingUp(US, "2026-11-07").next, null, "past its date, no set is next");
  assert.deepEqual(comingUp({ ...US, tiles: US.tiles.filter((t) => !t.presale) }, TODAY), { next: null, groups: [], total: 0 });
});

test("shopByType: six types, hub hrefs where a hub exists, released 'from' tiles only", () => {
  const s = shopByType(US);
  assert.deepEqual(
    s.map((x) => x.kind),
    [...SHOP_KINDS],
  );
  const href = Object.fromEntries(s.map((x) => [x.kind, x.href]));
  assert.equal(href["booster-box"], "/pokemon/booster-boxes");
  assert.equal(href.etb, "/pokemon/elite-trainer-boxes");
  assert.equal(href["pc-etb"], "/pokemon/elite-trainer-boxes");
  assert.equal(href["booster-bundle"], "/pokemon/booster-bundles");
  assert.equal(href.upc, "/pokemon/sealed?type=upc");
  assert.equal(href.tin, "/pokemon/sealed?type=tin");
  for (const x of s) {
    if (x.from) {
      assert.equal(x.from.kind, x.kind);
      assert.equal(x.from.presale, false);
      assert.equal(isHalfBox(x.from), false);
      const cheaper = US.tiles.filter((t) => t.kind === x.kind && !t.presale && !isHalfBox(t) && t.lowCents != null && t.lowCents < (x.from?.lowCents as number));
      assert.deepEqual(cheaper, []);
    }
  }
  assert.ok(shopByType(SG).every((x) => x.from === null));
});

test("newestSets: six newest, box and ETB 'from' figures, pre-orders included and flagged", () => {
  const n = newestSets(US);
  assert.equal(n.length, 6);
  assert.deepEqual(
    n.map((x) => x.set.slug),
    US.sets.slice(0, 6).map((s) => s.slug),
  );
  const delta = n.find((x) => x.set.slug === "delta-reign");
  assert.equal(delta?.box?.presale, true, "a pre-order box price is flagged");
  assert.ok(delta?.box && !isHalfBox(delta.box));
  for (const x of n) {
    if (x.box) assert.equal(x.box.kind, "booster-box");
    if (x.etb) assert.equal(x.etb.kind, "etb");
  }
  assert.equal(newestSets(US, 2).length, 2);
  assert.ok(newestSets(SG).every((x) => x.box === null && x.etb === null));
});

test("belowMarket: US only, released, under a reference of at least US$25, biggest gap first", () => {
  const rows = belowMarket(US, "US");
  assert.ok(rows.length > 0 && rows.length <= BELOW_MARKET_ROWS);
  for (const { tile, pctUnder } of rows) {
    assert.equal(tile.presale, false);
    assert.ok((tile.refCents as number) >= BELOW_MARKET_MIN_REF_CENTS);
    assert.ok((tile.lowCents as number) < (tile.refCents as number));
    assert.ok(Number.isInteger(pctUnder) && pctUnder >= 1);
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].pctUnder >= rows[i].pctUnder);
  assert.deepEqual(belowMarket(UK, "UK"), []);
  assert.deepEqual(belowMarket(SG, "SG"), []);
  assert.deepEqual(belowMarket(US, "CA"), []);
});

test("buildHome: no NaN, null or undefined in anything it computes, in every market", () => {
  for (const [market, catalog] of MARKETS) {
    const h = buildHome(catalog, market, TODAY);
    assertClean(`home ${market}`, {
      stats: h.stats,
      perPack: h.perPack.map((g) => ({ hub: g.hub.slug, rows: g.rows.map((t) => [t.name, t.perPackCents, t.lowCents]) })),
      next: h.comingUp.next ? [h.comingUp.next.set.name, h.comingUp.next.days, daysWording(h.comingUp.next.days)] : [],
      groups: h.comingUp.groups.map((g) => g.tiles.map((t) => t.name)),
      shop: h.shop.map((s) => [s.label, s.href, s.count, s.from?.lowCents ?? 0]),
      newest: h.newest.map((s) => [s.set.name, s.box?.lowCents ?? 0, s.etb?.lowCents ?? 0]),
      below: h.below.map((r) => [r.tile.name, r.pctUnder]),
    });
    const ranked = [...h.perPack.flatMap((g) => g.rows), ...h.below.map((r) => r.tile)];
    assert.ok(ranked.every((t) => !t.presale), `${market}: pre-orders never ranked or listed under the reference`);
  }
});

test("KIND_HUBS: titles, descriptions, H1s and paths as specified", () => {
  assert.deepEqual(
    KIND_HUBS.map((h) => [h.path, h.title, h.h1, [...h.kinds]]),
    [
      ["/pokemon/booster-boxes", "Pokémon Booster Box Prices, Set by Set", "Pokémon Booster Box Prices", ["booster-box"]],
      ["/pokemon/elite-trainer-boxes", "Pokémon Elite Trainer Box (ETB) Prices by Set", "Pokémon Elite Trainer Box Prices", ["etb", "pc-etb"]],
      ["/pokemon/booster-bundles", "Pokémon Booster Bundle Prices, Set by Set", "Pokémon Booster Bundle Prices", ["booster-bundle"]],
    ],
  );
  const descriptions = new Set<string>();
  for (const h of KIND_HUBS) {
    assert.ok(h.title.length <= TITLE_MAX, `${h.slug} title ${h.title.length}`);
    assert.ok(h.description.length <= DESCRIPTION_MAX, `${h.slug} description ${h.description.length}`);
    assert.doesNotMatch(h.description, /\bevery\b|\btoday\b/i);
    assert.doesNotMatch(h.title, /riftcompare/i);
    assert.equal(kindHub(h.slug), h);
    descriptions.add(h.description);
  }
  assert.equal(descriptions.size, KIND_HUBS.length, "descriptions are unique");
  assert.equal(hubForKind("pc-etb")?.slug, "elite-trainer-boxes");
  assert.equal(hubForKind("tin"), null);
  assert.equal(kindHref("deck"), "/pokemon/sealed?type=deck");
});

test("each kind hub lists every product of its kinds, newest set first, setless last", () => {
  for (const h of KIND_HUBS) {
    const rows = hubTiles(US, h);
    const expected = US.tiles.filter((t) => (h.kinds as readonly string[]).includes(t.kind));
    assert.deepEqual(new Set(rows.map((t) => t.slug)), new Set(expected.map((t) => t.slug)), h.slug);
    assert.equal(rows.length, expected.length);
    const date = new Map(US.sets.map((s) => [s.slug, s.releasedOn ?? ""]));
    let seenSetless = false;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].setSlug) seenSetless = true;
      else assert.ok(!seenSetless, `${h.slug}: a setless row before a set's`);
      if (i > 0 && rows[i].setSlug && rows[i - 1].setSlug) {
        assert.ok((date.get(rows[i - 1].setSlug as string) as string) >= (date.get(rows[i].setSlug as string) as string));
      }
    }
  }
  assert.ok(
    hubTiles(US, kindHub("booster-boxes")).some((t) => isHalfBox(t)),
    "half boxes are listed (as their own rows), only never ranked as the set's box",
  );
});

test("hub facts, prose and FAQ: true to the data, in every market, nothing unfilled", () => {
  for (const [market, catalog, currency] of MARKETS) {
    for (const h of KIND_HUBS) {
      const f = hubFacts(catalog, h, TODAY);
      const prose = hubProse(f, h, currency);
      const faq = hubFaq(f, h, currency);
      const label = `${market} ${h.slug}`;
      assertClean(label, { prose, faq });
      for (const s of [...prose, ...faq.flatMap((x) => [x.q, x.a])]) assert.deepEqual(textViolations(s), [], `${label}: ${s}`);
      assert.equal(f.products, hubTiles(catalog, h).length);
      if (f.lowest) {
        assert.equal(f.lowest.presale, false);
        assert.ok(prose.some((s) => s.includes(f.lowest?.name as string) && s.includes("as of 1 Oct 2026")));
        assert.ok(faq.some((x) => /lowest price per pack/.test(x.q) && /as of 1 Oct 2026/.test(x.a)));
      } else {
        assert.ok(!faq.some((x) => /lowest price per pack/.test(x.q)), `${label}: no unanswerable question`);
      }
      if (!f.typical.length) assert.ok(!faq.some((x) => /How many packs/.test(x.q)), `${label}: no unanswerable question`);
      if (market === "SG") {
        assert.equal(f.lowest, null);
        assert.equal(f.noListing, f.products);
        assert.ok(prose.some((s) => /None has a tracked listing in Singapore/.test(s)));
      }
    }
  }
  const box = hubFacts(US, kindHub("booster-boxes"), TODAY);
  assert.equal(box.typical[0]?.typical.count, 36);
  const etb = hubFacts(US, kindHub("elite-trainer-boxes"), TODAY);
  assert.deepEqual(
    etb.typical.map((t) => t.kind),
    ["etb", "pc-etb"],
    "regular and Pokémon Center boxes are counted apart",
  );
  assert.ok(hubProse(etb, kindHub("elite-trainer-boxes"), "USD").some((s) => /counted from the published contents\)/.test(s)));
});

test("a single pack reads \"1 pack\", never \"1 packs\"", () => {
  const h = kindHub("booster-bundles");
  const one = { ...US, tiles: US.tiles.map((t) => (t.kind === "booster-bundle" ? { ...t, packCount: 1, perPackCents: t.lowCents } : t)) };
  const f = hubFacts(one, h, TODAY);
  const text = [...hubProse(f, h, "USD"), ...hubFaq(f, h, "USD").map((x) => x.a)].join(" ");
  assert.match(text, /for 1 pack\b/);
  assert.match(text, /usual count for booster bundles is 1 booster pack /);
  assert.doesNotMatch(text, /\b1 (booster )?packs\b/);
  for (const rel of ["src/components/pokemon/PerPackTable.tsx", "src/components/pokemon/PokemonQuickView.tsx"]) {
    assert.doesNotMatch(readFileSync(rel, "utf8"), /\{\w+\.packCount\} (booster )?packs/, `${rel}: a count with a fixed plural`);
  }
});

test("hand-written copy: no digits, no set names, no banned words, distinct explainers of 150+ words", () => {
  const hand = [...KIND_HUBS.flatMap((h) => h.explainer), ...PER_PACK_METHOD];
  for (const p of hand) {
    assert.doesNotMatch(p, /\d/, `digits in hand-written prose: ${p.slice(0, 60)}`);
    for (const name of SET_NAMES) assert.ok(!p.toLowerCase().includes(name.toLowerCase()), `names the set "${name}": ${p.slice(0, 60)}`);
    assert.deepEqual(textViolations(p), [], p.slice(0, 60));
  }
  for (const h of KIND_HUBS) assert.ok(wordsOf(h.explainer.join(" ")).length >= 150, `${h.slug} explainer is under 150 words`);
  const texts = [...KIND_HUBS.map((h) => ({ id: h.slug, text: h.explainer.join(" ") })), { id: "price-per-pack", text: PER_PACK_METHOD.join(" ") }];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = shingles(texts[i].text);
      const shared = [...shingles(texts[j].text)].filter((s) => a.has(s));
      assert.deepEqual(shared, [], `${texts[i].id} and ${texts[j].id} share an 8-word run`);
    }
  }
});

test("perPackPage: top twenty, a section per kind with three or more, open listings only", () => {
  const p = perPackPage(US);
  assert.ok(p.top.length > 0 && p.top.length <= PER_PACK_TOP);
  assert.ok(p.coverage >= p.top.length);
  assert.equal(p.coverage, US.tiles.filter((t) => !t.presale && t.lowCents != null && t.perPackCents != null).length);
  for (const s of p.sections) {
    assert.ok(s.total >= PER_PACK_MIN_SECTION && s.tiles.length <= PER_PACK_SECTION);
    assert.ok(s.tiles.every((t) => t.kind === s.kind && !t.presale && t.lowCents != null));
    assert.equal(s.hub, hubForKind(s.kind));
  }
  assert.equal(p.sections[0]?.kind, "booster-box", "sections follow the site's kind order");
  assert.deepEqual(
    ["Booster boxes", "Elite Trainer Boxes", "Pokémon Center ETBs", "Build & Battle kits", "Tins", "Premium collections"].map(proseLabel),
    ["booster boxes", "Elite Trainer Boxes", "Pokémon Center ETBs", "Build & Battle kits", "tins", "premium collections"],
  );
  assert.ok(p.sections.some((s) => s.kind === "pc-etb" && s.hub?.slug === "elite-trainer-boxes"));
  assert.deepEqual(perPackPage(SG), { top: [], sections: [], coverage: 0 });
  assert.ok(perPackPage(UK).top.every((t) => t.lowSource === "ebay"));
});

test("/pokemon/sealed: search titles fit in 60, and only the clean first page is indexable", () => {
  assert.equal(searchTitle("151 booster bundle"), `151 booster bundle${SEARCH_TITLE_TAIL}`);
  for (const q of ["a".repeat(80), "Scarlet Violet Prismatic Evolutions Super Premium Collection", "x y ".repeat(30)]) {
    const t = searchTitle(q);
    assert.ok(t.length <= 60, `${t.length}: ${t}`);
    assert.ok(t.endsWith(SEARCH_TITLE_TAIL));
    assert.match(t, /…: Pokémon/);
  }
  const at = (sp: Record<string, string>) => sealedIndexing(parseBrowse(sp));
  assert.deepEqual(at({}), { path: "/pokemon/sealed", noindex: false });
  assert.deepEqual(at({ page: "2" }), { path: "/pokemon/sealed?page=2", noindex: true });
  assert.deepEqual(at({ type: "etb" }), { path: "/pokemon/sealed", noindex: true });
  assert.deepEqual(at({ type: "etb", page: "3" }), { path: "/pokemon/sealed", noindex: true });
  assert.deepEqual(at({ sort: "price_asc" }), { path: "/pokemon/sealed", noindex: true });
  assert.deepEqual(at({ q: "box" }), { path: "/pokemon/sealed", noindex: true });
});

test("W1 pages: static titles and descriptions within limits, metadata through pokemonMeta, force-dynamic", () => {
  const pages: [string, string][] = [
    ["src/app/pokemon/page.tsx", "colocated"],
    ["src/app/pokemon/sealed/page.tsx", "section"],
    ["src/app/pokemon/sets/page.tsx", "section"],
    ["src/app/pokemon/price-per-pack/page.tsx", "section"],
    ["src/app/pokemon/booster-boxes/page.tsx", "section"],
    ["src/app/pokemon/elite-trainer-boxes/page.tsx", "section"],
    ["src/app/pokemon/booster-bundles/page.tsx", "section"],
  ];
  for (const [rel, og] of pages) {
    const src = readFileSync(rel, "utf8");
    assert.match(src, /export const dynamic = "force-dynamic";/, rel);
    assert.match(src, /pokemonMeta\(\{/, rel);
    assert.match(src, new RegExp(`ogImage: "${og}"`), rel);
    assert.doesNotMatch(src, /pageOpenGraph|pageAlternates|generateStaticParams|unstable_cache|\.catch\(/, rel);
    const title = /const TITLE = "([^"]+)";/.exec(src)?.[1];
    const description = /const DESCRIPTION =\s*"([^"]+)";/.exec(src)?.[1];
    if (title) assert.ok(title.length <= TITLE_MAX, `${rel} title ${title.length}`);
    if (description) assert.ok(description.length <= DESCRIPTION_MAX, `${rel} description ${description.length}`);
  }
  const hub = readFileSync("src/app/pokemon/page.tsx", "utf8");
  assert.match(hub, /const TITLE = "Pokémon Sealed Prices: Booster Boxes, ETBs & Bundles";/, "the hub's title is unchanged");
  assert.match(readFileSync("src/components/pokemon/HomeHero.tsx", "utf8"), />Pokémon Sealed Prices<\/h1>/, "the hub's H1 is unchanged");
});

test("W1 layouts: every grid starts at one column; the newest sets the ItemList names are all visible on a phone", () => {
  const files = [
    "src/app/pokemon/page.tsx",
    "src/app/pokemon/sealed/page.tsx",
    "src/app/pokemon/sets/page.tsx",
    "src/app/pokemon/price-per-pack/page.tsx",
    "src/components/pokemon/HomeHero.tsx",
    "src/components/pokemon/HomePerPack.tsx",
    "src/components/pokemon/HomeComingUp.tsx",
    "src/components/pokemon/HomeShopByType.tsx",
    "src/components/pokemon/HomeNewestSets.tsx",
    "src/components/pokemon/HomeBelowMarket.tsx",
    "src/components/pokemon/HomeGuides.tsx",
    "src/components/pokemon/KindHubView.tsx",
    "src/components/pokemon/PerPackTable.tsx",
  ];
  for (const rel of files) {
    // An unprefixed multi-column class is a phone's base layout.
    assert.doesNotMatch(readFileSync(rel, "utf8"), /(?<![\w:\]-])grid-cols-(?:[2-9]|1[0-2])\b/, `${rel}: a grid whose base is not one column`);
  }
  assert.doesNotMatch(readFileSync("src/components/pokemon/HomeNewestSets.tsx", "utf8"), /\bhidden\b/, "a set in the ItemList hidden on phones");
});

test("the Riftbound homepage promo: same switch and targets, links to the kind hubs", () => {
  const src = readFileSync("src/components/pokemon/PokemonHomePromo.tsx", "utf8");
  assert.match(src, /if \(!pokemonSectionOn\(\)\) return null;/);
  assert.match(src, /href: "\/pokemon\/booster-boxes", label: "Booster boxes", target: "booster-box"/);
  assert.match(src, /href: "\/pokemon\/elite-trainer-boxes", label: "Elite Trainer Boxes", target: "etb"/);
  assert.match(src, /target: "sets"/);
  assert.match(src, /click\("hub"\)/);
});
