import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// eBay clicks, P3 (2026-09-26, "Pushing eBay clicks" in DECISIONS.md): the
// homepage "Cheapest on eBay" row, the header search's eBay link, /browse's
// search CTA, the Deal Finder lock and /movers, and the attribution fixes.
//
// The owner's ask: more eBay affiliate clicks. The rules these pin: no ranked
// comparison is reordered, eBay is never called cheaper where it is not, every
// eBay link is a measured OutboundLink with its disclosure beside it, and the
// new row costs no Neon read beyond a ≤4-card detail lookup.
//
// The loaders run for real against a stub Prisma client installed as the
// global client before lib/db.ts is first imported (the same pattern as
// tests/deal-finder-buyer-list.test.ts); cachedOrDirect falls back to a direct
// call outside Next, so every read the loaders make is visible in db.calls.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments stripped (line comments first — see business-diagnostic-fixes.test.ts
// for why the order matters), so prose about a removed thing never trips a check.
const code = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `expected ${JSON.stringify(from)}`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `expected ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return src.slice(a, b);
};

type Row = {
  cardId: string;
  retailer: string;
  retailerName: string;
  country: string;
  priceCents: number;
  shippingCents: number | null;
  url: string;
  inStock: boolean;
};
type Where = { country?: string; inStock?: boolean; retailer?: { in: string[] }; cardId?: { in: string[] } };

const db = { rows: [] as Row[], calls: [] as { op: string; args: any }[] };
const matches = (r: Row, w: Where) =>
  (w.country == null || r.country === w.country) &&
  (w.inStock == null || r.inStock === w.inStock) &&
  (w.retailer == null || w.retailer.in.includes(r.retailer)) &&
  (w.cardId == null || w.cardId.in.includes(r.cardId));

const stub = {
  retailerPrice: {
    async groupBy(args: { where: Where }) {
      db.calls.push({ op: "groupBy", args });
      const min = new Map<string, number>();
      for (const r of db.rows.filter((x) => matches(x, args.where))) {
        const p = min.get(r.cardId);
        if (p == null || r.priceCents < p) min.set(r.cardId, r.priceCents);
      }
      return [...min].map(([cardId, priceCents]) => ({ cardId, _min: { priceCents } }));
    },
    async findMany(args: { where: Where; take?: number }) {
      db.calls.push({ op: "retailerPrice.findMany", args });
      const out = db.rows.filter((x) => matches(x, args.where)).sort((a, b) => a.priceCents - b.priceCents);
      return args.take ? out.slice(0, args.take) : out;
    },
  },
  card: {
    async findMany(args: { where: { id: { in: string[] } }; select: Record<string, unknown> }) {
      db.calls.push({ op: "card.findMany", args });
      return args.where.id.in.map((id) => ({ id, name: `Card ${id}`, slug: `card-${id}`, setCode: "OGN", collectorNumber: id, imageThumbUrl: null }));
    },
  },
  // The eBay row pull: the cheapest (price + COALESCE(shipping, 0)) in-stock
  // listing per card, a listing with stated postage first on a tie.
  async $queryRaw(_strings: TemplateStringsArray, ...values: unknown[]) {
    const [country, retailer] = values as [string, string];
    db.calls.push({ op: "$queryRaw", args: { country, retailer } });
    const best = new Map<string, Row>();
    const cost = (x: Row) => x.priceCents + (x.shippingCents ?? 0);
    for (const r of db.rows) {
      if (r.country !== country || r.retailer !== retailer || !r.inStock) continue;
      const prev = best.get(r.cardId);
      if (!prev || cost(r) < cost(prev) || (cost(r) === cost(prev) && r.shippingCents != null && prev.shippingCents == null)) best.set(r.cardId, r);
    }
    return [...best.values()].map(({ cardId, priceCents, shippingCents, url }) => ({ cardId, priceCents, shippingCents, url }));
  },
};

let arb: typeof import("../src/lib/arbitrage");
let topDeals: typeof import("../src/lib/top-deals");

before(async () => {
  (globalThis as unknown as { prisma: unknown }).prisma = stub;
  arb = await import("../src/lib/arbitrage");
  topDeals = await import("../src/lib/top-deals");
});

const row = (over: Partial<Row> & Pick<Row, "cardId" | "retailer" | "priceCents">): Row => ({
  retailerName: over.retailer,
  country: "US",
  shippingCents: null,
  url: `https://store.test/${over.retailer}/${over.cardId}`,
  inStock: true,
  ...over,
});
const ebay = (e: Partial<{ cents: number; postageKnown: boolean; url: string }> = {}) => ({ cents: 1000, postageKnown: true, url: "https://www.ebay.com/itm/1", ...e });
const tcg = (cardId: string, lowCents: number | null) => ({ cardId, priceCents: 5000, url: "https://www.tcgplayer.com/product/1", lowCents });

// ── The ranking, as pure logic ───────────────────────────────────────────────

test("rankCheapestOnEbay: a genuinely cheaper eBay copy is listed, ranked by the money gap", () => {
  const store = new Map([["a", 1500], ["b", 3000], ["c", 1000]]);
  const eb = new Map([["a", ebay({ cents: 1000 })], ["b", ebay({ cents: 2000 })], ["c", ebay({ cents: 1200 })]]);
  const out = arb.rankCheapestOnEbay("AU", store, eb, []);
  assert.deepEqual(out.map((r) => r.cardId), ["b", "a"], "b saves 1000, a 500; c is DEARER on eBay and never appears");
  assert.deepEqual(out[0], { cardId: "b", ebayCents: 2000, postageKnown: true, url: "https://www.ebay.com/itm/1", storeCents: 3000, gapCents: 1000 });
  // An equal money gap goes to the bigger share of the store price.
  const tie = arb.rankCheapestOnEbay("AU", new Map([["x", 2000], ["y", 1000]]), new Map([["x", ebay({ cents: 1500 })], ["y", ebay({ cents: 500 })]]), []);
  assert.deepEqual(tie.map((r) => r.cardId), ["y", "x"]);
});

test("rankCheapestOnEbay: Canada is skipped — its eBay rows are US listings with unquoted postage", () => {
  const store = new Map([["a", 3000]]);
  const eb = new Map([["a", ebay({ cents: 1000, postageKnown: false })]]);
  assert.equal(arb.rankCheapestOnEbay("AU", store, eb, []).length, 1, "the same input qualifies elsewhere");
  assert.deepEqual(arb.rankCheapestOnEbay("CA", store, eb, []), []);
});

test("rankCheapestOnEbay: the 100-unit floor, the 50-unit gap and the 80% outlier guard", () => {
  const one = (storeCents: number, ebayCents: number) =>
    arb.rankCheapestOnEbay("UK", new Map([["a", storeCents]]), new Map([["a", ebay({ cents: ebayCents })]]), []);
  assert.equal(one(400, 99).length, 0, "an eBay cost under 100 minor units is noise");
  assert.equal(one(400, 100).length, 1, "…100 is enough");
  assert.equal(one(1049, 1000).length, 0, "a 49-unit gap is not worth a row");
  assert.equal(one(1050, 1000).length, 1, "…50 is");
  assert.equal(one(1000, 200).length, 0, "a gap of 80% of the store price is a mismatched listing");
  assert.equal(one(1000, 201).length, 1, "…79.9% still counts");
  // No tracked store at all: nothing to be cheaper than.
  assert.equal(arb.rankCheapestOnEbay("UK", new Map(), new Map([["a", ebay({ cents: 500 })]]), []).length, 0);
});

test("rankCheapestOnEbay: in the US, TCGplayer's own cheapest listing is an alternative eBay must beat", () => {
  const store = new Map([["a", 2000]]);
  const eb = new Map([["a", ebay({ cents: 1000 })]]);
  assert.equal(arb.rankCheapestOnEbay("US", store, eb, [tcg("a", 950)]).length, 0, "TCGplayer sells it for less");
  assert.equal(arb.rankCheapestOnEbay("US", store, eb, [tcg("a", 1000)]).length, 0, "…or for the same");
  assert.equal(arb.rankCheapestOnEbay("US", store, eb, [tcg("a", 1040)]).length, 0, "40 under TCGplayer is under the 50-unit gap");
  const vsTcg = arb.rankCheapestOnEbay("US", store, eb, [tcg("a", 1100)]);
  assert.deepEqual([vsTcg[0].storeCents, vsTcg[0].gapCents], [1100, 100], "the gap shown is against the cheaper alternative, never the wider one");
  assert.deepEqual(arb.rankCheapestOnEbay("US", store, eb, [tcg("a", null)]).map((r) => r.gapCents), [1000], "no TCGplayer listing, no check");
  // Outside the US that listing is a US seller's price with international
  // postage behind it — not a local alternative.
  assert.deepEqual(arb.rankCheapestOnEbay("AU", store, eb, [tcg("a", 950)]).map((r) => r.gapCents), [1000]);
});

test("rankCheapestOnEbay: postage is carried exactly as the Deal Finder measures it", () => {
  const eb = arb.cheapestEbayByCard("AU", [
    { cardId: "k", priceCents: 800, shippingCents: 200, url: "https://www.ebay.com.au/itm/k" },
    { cardId: "u", priceCents: 800, shippingCents: null, url: "https://www.ebay.com.au/itm/u" },
  ]);
  const out = arb.rankCheapestOnEbay("AU", new Map([["k", 2000], ["u", 2000]]), eb, []);
  const k = out.find((r) => r.cardId === "k")!;
  const u = out.find((r) => r.cardId === "u")!;
  assert.deepEqual([k.ebayCents, k.postageKnown], [1000, true], "stated postage is included, and the row says delivered");
  assert.deepEqual([u.ebayCents, u.postageKnown], [800, false], "no postage stated: the item price, labelled + postage");
});

test("cheapestEbayDeal: the row names its postage, its gap, and tags the listing with its own sub-id", () => {
  const deal = topDeals.cheapestEbayDeal({
    cardId: "c1",
    ebayCents: 1234,
    postageKnown: false,
    url: "https://www.ebay.com/itm/555",
    storeCents: 2000,
    gapCents: 766,
    ebayKey: "ebay_us",
    card: { id: "c1", slug: "card-c1", name: "Card c1", setCode: "OGN", collectorNumber: "001", imageThumbUrl: "https://img.test/t.webp" },
  });
  assert.equal(deal.priceCents, 1234);
  assert.equal(deal.postageKnown, false);
  assert.equal(deal.gapCents, 766);
  assert.equal(deal.subtitle, "OGN · 001");
  assert.equal(deal.outboundRetailer, "ebay_us");
  const u = new URL(deal.outboundUrl);
  assert.equal(u.pathname, "/itm/555", "the listing itself, not a search");
  assert.equal(u.searchParams.get("mkevt"), "1", "affiliate-tagged");
  assert.equal(u.searchParams.get("customid"), "rc-us-ebay_us_cheapest-home-product", "the homepage row reports under its own sub-id");
});

// ── Zero new Neon reads ──────────────────────────────────────────────────────

test("the row's store keys are exactly the default Deal Finder list's, so minByCard hits the same cache entry", async () => {
  for (const country of ["AU", "US", "UK", "SG", "EU"] as const) {
    // The pure derivation.
    const resolved = arb.resolveTcgBuyKeys(country, arb.defaultTcgBuyKeys(country));
    const split = arb.defaultBuySplit(country);
    assert.ok(split.buyEbayKey, `${country}: eBay is on the default list`);
    assert.deepEqual(split.storeKeys, resolved.filter((k) => k !== split.buyEbayKey), `${country}: store keys`);
    assert.ok(!split.storeKeys.some((k) => /^tcgplayer|^ebay/.test(k)), `${country}: no TCGplayer or eBay key among the stores`);

    // And end to end: the aggregate and the eBay pull the row asks for are the
    // very ones the homepage's Biggest savings column (the default list) asks for.
    db.rows = [];
    db.calls = [];
    await arb.getArbitrageVsTcgplayer(country, { buy: arb.defaultTcgBuyKeys(country), sort: "pct", page: 1, pageSize: 4 });
    const listReads = db.calls.filter((c) => c.op === "groupBy" || c.op === "$queryRaw");
    db.calls = [];
    await arb.getCheapestOnEbay(country);
    const rowReads = db.calls.filter((c) => c.op === "groupBy" || c.op === "$queryRaw");
    const shape = (cs: typeof listReads) =>
      cs
        .map((c) => (c.op === "groupBy" ? `groupBy ${c.args.where.country} ${[...c.args.where.retailer.in].sort().join("|")}` : `$queryRaw ${c.args.country} ${c.args.retailer}`))
        .sort();
    // The EU also reads CardTrader's own small aggregate (review, 2026-09-26):
    // the EU card page ranks CardTrader, so eBay must beat it too. It is the
    // ONLY extra read; the shared two are still the default list's own.
    const extra = country === "EU" ? [`groupBy EU cardtrader`] : [];
    assert.equal(rowReads.length, 2 + extra.length, `${country}: one aggregate and one eBay pull${extra.length ? ", plus CardTrader's" : ""}`);
    assert.deepEqual(shape(rowReads).filter((x) => !extra.includes(x)), shape(listReads), `${country}: the same aggregate and eBay pull as the default list`);
    for (const x of extra) assert.ok(shape(rowReads).includes(x), `${country}: reads ${x}`);
  }
});

test("Canada costs no read at all", async () => {
  db.rows = [row({ cardId: "a", country: "CA", retailer: "ebay_ca", priceCents: 500 })];
  db.calls = [];
  assert.deepEqual(await arb.getCheapestOnEbay("CA"), []);
  assert.deepEqual(db.calls, []);
  assert.equal(arb.defaultBuySplit("CA").buyEbayKey, null, "ebay_ca is off the default list");
});

test("getCheapestOnEbay end to end: one narrow detail query for at most `limit` cards", async () => {
  const stores = arb.defaultBuySplit("US").storeKeys;
  db.rows = [];
  for (let i = 0; i < 6; i++) {
    db.rows.push(
      row({ cardId: `c${i}`, retailer: stores[0], priceCents: 3000 + i * 100 }),
      row({ cardId: `c${i}`, retailer: "ebay_us", priceCents: 2000, shippingCents: i % 2 ? null : 150, url: `https://www.ebay.com/itm/${i}` }),
    );
  }
  // TCGplayer's listing undercuts c5's eBay copy: it must not appear.
  db.rows.push(row({ cardId: "c5", retailer: "tcgplayer", priceCents: 1900 }), row({ cardId: "c5", retailer: "tcgplayer_market", priceCents: 4000 }));
  db.calls = [];
  const items = await arb.getCheapestOnEbay("US", 3);
  // Gaps: c3 3300−2000, c4 3400−2150, c1 3100−2000, c2 3200−2150, c0 3000−2150.
  assert.deepEqual(items.map((i) => i.card.id), ["c3", "c4", "c1"], "biggest money gap first; c5 dropped");
  assert.equal(items[0].ebayKey, "ebay_us");
  assert.deepEqual([items[0].ebayCents, items[0].postageKnown, items[0].gapCents], [2000, false, 1300], "no postage stated: item price");
  assert.deepEqual([items[1].ebayCents, items[1].postageKnown, items[1].gapCents], [2150, true, 1250], "stated postage included");
  assert.equal(items[0].url, "https://www.ebay.com/itm/3", "the listing's own URL, untagged — top-deals tags it");
  const detail = db.calls.filter((c) => c.op === "card.findMany");
  assert.equal(detail.length, 1, "one detail query");
  assert.deepEqual([...detail[0].args.where.id.in].sort(), ["c1", "c3", "c4"], "scoped to the cards shown");
  assert.deepEqual(Object.keys(detail[0].args.select).sort(), ["collectorNumber", "id", "imageThumbUrl", "name", "setCode", "slug"], "narrow: no cardTileSelect");
  assert.ok(!db.calls.some((c) => c.op === "retailerPrice.findMany" && c.args.where.cardId), "no per-listing detail read — the cached eBay row carries its own URL");
});

test("getCheapestOnEbay is never cached around, and top-deals chains it after the list that warms its inputs", () => {
  const nested = read("tests/nested-cache.test.ts");
  assert.match(nested, /"getCheapestOnEbay",/, "listed as self-cached in the nested-cache guard");
  const lib = code("src/lib/arbitrage.ts");
  const fn = between(lib, "export async function getCheapestOnEbay", "export interface CrossRegionGap");
  assert.doesNotMatch(fn, /cachedOrDirect\(|unstable_cache\(/, "no cache of its own");
  assert.match(fn, /minByCard\(country, storeKeys\)/);
  assert.match(fn, /getEbayRowsMemoized\(country, buyEbayKey\)/);
  assert.match(fn, /country === "US" \? getTcgUsRowsMemoized\(\)/, "TCGplayer's rows are read only where they are used");
  assert.match(lib, /const \{ storeKeys, buyEbayKey \} = splitBuyKeys\(country, buyKeys\);/, "rankVsTcgplayer splits with the same helper");

  const deals = code("src/lib/top-deals.ts");
  assert.match(deals, /const cheapestOnEbayP = savingsP\.then\(/, "started after the savings branch");
  // What actually makes the second read free (review, 2026-09-26): a tagged
  // unstable_cache read never matches the in-memory copy a write leaves, so
  // the three day-cached loaders share their promise within a lambda instead.
  for (const loader of ["function getEbayRowsMemoized", "function getTcgUsRowsMemoized", "async function minByCard"]) {
    const body = between(lib, loader, "\n}\n");
    assert.match(body, /coalesced\(`/, `${loader} shares one read per render`);
  }
  assert.match(deals, /getCheapestOnEbay\(country, perType\)/);
  assert.match(deals, /cheapestOnEbay\.length > 0/, "hasAny counts the row");
  assert.match(deals, /cheapestOnEbay,\n/, "TopDeals carries it");
  assert.doesNotMatch(deals, /unstable_cache\(|from "next\/cache"/);
});

// ── The homepage block ───────────────────────────────────────────────────────

test("TodaysTopDeals opens with Cheapest on eBay: free, measured, disclosed, eBay blue", () => {
  const src = code("src/components/TodaysTopDeals.tsx");
  const block = between(src, "function CheapestOnEbay(", "\n}\n");
  assert.match(block, /if \(rows\.length === 0\) return null;/, "hidden when the market has no rows");
  assert.match(block, />Cheapest on eBay</);
  assert.match(block, /Cards where an eBay listing costs less than any store we track\n/);
  assert.doesNotMatch(block, /any store we track today/, "UK/SG/EU eBay rows refresh every third day");
  // One OutboundLink per row, straight to the listing, attributed.
  assert.equal((block.match(/<OutboundLink\b/g) ?? []).length, 1, "each row is ONE link");
  for (const attr of [
    /href=\{d\.outboundUrl\}/,
    /retailer=\{d\.outboundRetailer\}/,
    /pageType="homepage"/,
    /surface="cheapest_ebay"/,
    /cardId=\{d\.cardId\}/,
    /cardName=\{d\.title\}/,
    /price=\{d\.priceCents \/ 100\}/,
    /positionInList=\{i \+ 1\}/,
    /\binStock\b/,
  ]) {
    assert.match(block, attr);
  }
  assert.match(block, /\{d\.postageKnown \? "delivered" : "\+ postage"\}/, "delivered only when the seller stated postage");
  assert.match(block, /below the cheapest\s+store/);
  assert.match(block, /<AffiliateDisclosure partner="ebay" tight/, "its disclosure, directly under it");
  // Not an ad and not gated: shown to every visitor, paid tiers included.
  assert.doesNotMatch(block, /usePremium|useMe|premium|ADSENSE_REVIEW_MODE|>\s*Ad\s*</);
  // No savings total, no badge, no path to the locked tool, no gold.
  assert.doesNotMatch(block, /PctBadge|Save |total|\/tools\/deal-finder|LockedTeaser|PremiumButton/);
  assert.doesNotMatch(block, /gold/, "gold is reserved for Premium");
  assert.match(block, /border-\[#0064d2\]/, "eBay blue");
  assert.match(block, /grid grid-cols-1 /, "a base column template (tests/grid-base-columns.test.ts)");

  // Not a fifth column inside the grid — and, since the homepage eBay pass of
  // 2026-09-26, FIRST in the section: above the price pills (which filter only
  // the columns) and the grid. On a phone the four stacked panels had put it
  // roughly a thousand pixels further down.
  const gridAt = src.indexOf("items-stretch gap-4");
  const pillsAt = src.indexOf('role="tablist" aria-label="Filter deals by price"');
  const blockAt = src.indexOf("<CheapestOnEbay rows={ebayRows}");
  assert.ok(gridAt > 0 && pillsAt > 0 && blockAt > 0, "all three render");
  assert.ok(blockAt < pillsAt && blockAt < gridAt, "rendered before the pills and the grid");
  assert.equal(src.split("<CheapestOnEbay rows={ebayRows}").length - 1, 1, "rendered once");
  assert.doesNotMatch(between(src, "const COLUMNS: ColumnDef[] = [", "];"), /cheapestOnEbay/, "not a column");
});

test("TodaysTopDeals discloses the Cheapest sealed column's paid links and names the page on them", () => {
  const src = code("src/components/TodaysTopDeals.tsx");
  assert.match(src, /kind="sealed" pageType="homepage"/, "the sealed row's buy_click names the homepage");
  assert.match(src, /\{gridHasPaidLink && <AffiliateDisclosure partner="both" tight \/>\}/);
  assert.match(src, /isPaidLink\(d\.outboundUrl\)/, "shown whenever a paid link is on screen");
  const deals = code("src/lib/top-deals.ts");
  assert.match(deals, /affiliateUrl\(best\.url, best\.retailer, "\/"\)/, "the sealed link carries its page");
});

// ── Search ───────────────────────────────────────────────────────────────────

test("SearchBar: no matches offers an eBay search, outside the listbox and the option loop", () => {
  const src = code("src/components/SearchBar.tsx");
  const noMatch = between(src, "results.length === 0 && sealed.length === 0 ? (", ") : (");
  assert.match(noMatch, /No matches — press Enter to search anyway\./, "the existing hint stays");
  assert.match(noMatch, /\{!loading && trimmed && \(/, "only once the search has settled on nothing");
  assert.match(noMatch, /href=\{ebaySearchUrl\(country, riftboundEbayQuery\(trimmed\), "header-search"\)\}/);
  assert.match(noMatch, /retailer="ebay_search"/);
  assert.match(noMatch, /surface="search_box"/);
  assert.match(noMatch, /pageType="search"/);
  assert.match(noMatch, /Search \{ebayLabel\(country\)\} for “\{trimmed\}” →/);
  assert.match(noMatch, /<AffiliateDisclosure partner="ebay" tight/);
  assert.doesNotMatch(noMatch, /role="(listbox|option)"|optionId\(|aria-selected/, "not an option: arrow keys and Enter are unchanged");
  assert.match(noMatch, /min-h-11/, "a 44px tap target");
  assert.doesNotMatch(src, /useSearchParams/);
});

// ── /browse, Deal Finder, /movers ────────────────────────────────────────────

test("/browse: a compact eBay search by the count, a full one when nothing matched", () => {
  const src = code("src/app/browse/page.tsx");
  assert.match(src, /const q = \(searchParams\.q \?\? ""\)\.trim\(\);/);
  assert.match(
    src,
    /\{q && total > 0 && \(\s*<EbayBuyCta query=\{q\} freeText compact source="browse-search" pageType="browse" surface="ebay_search"/,
  );
  assert.match(src, /\{q && total === 0 && \(\s*<EbayBuyCta query=\{q\} freeText source="browse-no-results" pageType="browse" surface="ebay_search"/);
  const countAt = src.indexOf('id="results"');
  const compactAt = src.indexOf('source="browse-search"');
  const gridAt = src.indexOf("cards.map((c) =>");
  assert.ok(countAt > 0 && compactAt > countAt && compactAt < gridAt, "by the results count, above the grid");
  assert.match(src, /<EbayPicks className="mb-6" pageType="browse" \/>/, "EbayPicks never gets the visitor's query");
  // The homepage's call names its page (2026-09-26), never the query.
  assert.match(read("src/components/home/HomeSections.tsx"), /<EbayPicks pageType="homepage" \/>/, "the homepage's call carries no query");
});

test("Deal Finder: an eBay CTA beside the signed-out lock, and attributed table links", () => {
  const src = code("src/app/tools/deal-finder/page.tsx");
  // (code() leaves a JSX comment as an empty `{}`.)
  assert.match(src, /<LockedPreview \/>\s*(?:\{\}\s*)?<EbayBuyCta source="deal-finder-locked" pageType="deals"/, "beside the lock");
  assert.match(src, /function LockedPreview\(\) \{/, "LockedPreview stays prop-less");
  assert.doesNotMatch(between(src, "function LockedPreview() {", "\n}\n"), /EbayBuyCta/, "…and outside it");
  assert.equal((src.match(/access === "full" && \(/g) ?? []).length, 1, "tests/tool-free-top3.test.ts's count is unchanged");
  const table = between(src, "function BuyerTable(", "\n}\n");
  assert.match(table, /href=\{it\.buyUrl\}[\s\S]*?pageType="deals"\s+surface="table"/);
  // Every link the list renders is tagged with the Deal Finder as its page.
  const lib = code("src/lib/arbitrage.ts");
  assert.match(lib, /const DEAL_FINDER_PATH = "\/tools\/deal-finder";/);
  assert.match(lib, /affiliateUrl\(e\.url, buyEbayKey, DEAL_FINDER_PATH\)/);
  assert.match(lib, /affiliateUrl\(b\.url, b\.retailer, DEAL_FINDER_PATH\)/);
  assert.match(lib, /affiliateUrl\(tcg\.url, TCG_US\.retailer, DEAL_FINDER_PATH\)/);
});

test("the Deal Finder's eBay rows report the Deal Finder in EPN's customid, not -home", async () => {
  db.rows = [
    row({ cardId: "d1", retailer: "ebay_us", priceCents: 600, shippingCents: 100, url: "https://www.ebay.com/itm/d1" }),
    row({ cardId: "d1", retailer: "tcgplayer_market", priceCents: 1500 }),
  ];
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: ["ebay_us"], sort: "saving" });
  assert.equal(new URL(page.items[0].buyUrl).searchParams.get("customid"), "rc-us-ebay_us-tools-product");
});

test("/movers: an eBay CTA straight after the movers lists, the page still static", () => {
  const src = code("src/app/movers/page.tsx");
  assert.match(src, /<PriceWatch [^>]*\/>\s*(?:\{\}\s*)?<EbayBuyCta source="movers" pageType="movers" \/>/);
  assert.match(read("src/app/movers/page.tsx"), /export const revalidate = 86400;/);
  assert.doesNotMatch(src, /getCountry\(|cookies\(\)/, "EbayBuyCta localises on the client");
});

// ── Copy ─────────────────────────────────────────────────────────────────────

test("nothing this package added claims an eBay guarantee, urgency or scarcity", () => {
  for (const f of [
    "src/components/TodaysTopDeals.tsx",
    "src/components/SearchBar.tsx",
    "src/app/browse/page.tsx",
    "src/app/tools/deal-finder/page.tsx",
    "src/app/movers/page.tsx",
    "src/lib/top-deals.ts",
  ]) {
    const src = code(f);
    assert.doesNotMatch(src, /money.?back|buyer protection/i, `${f}: no eBay guarantee claims`);
    assert.doesNotMatch(src, /\bbuy now\b|\bonly \d+ left\b|\bends in\b|\bhurry\b/i, `${f}: no urgency`);
  }
});


test("EU: CardTrader, ranked on the EU card page, is part of what eBay must beat", async () => {
  const { mergeMin, rankCheapestOnEbay } = await import("../src/lib/arbitrage");
  const stores = new Map([["c1", 600]]);
  const cardtrader = new Map([["c1", 150], ["c2", 900]]);
  const merged = mergeMin(stores, cardtrader);
  assert.equal(merged.get("c1"), 150, "the cheaper source wins");
  assert.equal(merged.get("c2"), 900, "a card only CardTrader lists still counts");
  const ebay = new Map([["c1", { cents: 300, url: "https://www.ebay.es/itm/1", postageKnown: true }]]);
  assert.equal(rankCheapestOnEbay("EU", stores, ebay, []).length, 1, "against the stores alone eBay would look cheapest");
  assert.equal(rankCheapestOnEbay("EU", merged, ebay, []).length, 0, "with CardTrader in, it is not");
  const lib = code("src/lib/arbitrage.ts");
  assert.match(lib, /const RANKED_NON_STORE_SOURCES: Partial<Record<Country, string\[\]>> = \{ EU: \[CARDTRADER_RETAILER\] \};/);
  const fn = between(lib, "export async function getCheapestOnEbay", "export interface CrossRegionGap");
  assert.match(fn, /rankCheapestOnEbay\(country, mergeMin\(storeMin, extraMin\)/);
});
