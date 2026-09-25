import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { hrefFor, parseDealFinderParams, type DealFinderParams } from "../src/lib/deal-finder-href";

// ─────────────────────────────────────────────────────────────────────────────
// Deal Finder as ONE honest buyer list (2026-09-25). The four tabs became one
// list — every card cheaper than TCGplayer market at a real store or eBay seller
// — and these tests pin the behaviour the audit found wrong:
//
//   • a converted TCGplayer REFERENCE row (UK/SG) was offered as a buyable store;
//   • unknown eBay postage was counted as free and labelled "delivered" (every
//     Canadian eBay row);
//   • in the US a store was called a deal while TCGplayer itself sold the card
//     for less;
//   • the tool's "% gap" disagreed with the homepage's "Save X%" for one card;
//   • the flip tab's pager/sort/filter dropped view=flip.
//
// And the new "Only my cards" filter: applied before paging, never cached.
//
// The loaders run for real against a stub Prisma client (installed as the
// global client before lib/db.ts is first imported), so these exercise the same
// code the page does; cachedOrDirect falls back to a direct call outside Next.
// ─────────────────────────────────────────────────────────────────────────────

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

const db = {
  rows: [] as Row[],
  watch: [] as string[],
  own: [] as string[],
  calls: [] as { op: string; args: unknown }[],
};

type Where = { country?: string; inStock?: boolean; retailer?: { in: string[] }; cardId?: { in: string[] } };
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
      db.calls.push({ op: "findMany", args });
      const out = db.rows.filter((x) => matches(x, args.where)).sort((a, b) => a.priceCents - b.priceCents);
      return args.take ? out.slice(0, args.take) : out;
    },
    async aggregate(args: unknown) {
      db.calls.push({ op: "aggregate", args });
      return { _max: { lastSeen: new Date("2026-09-25T07:12:00Z") } };
    },
  },
  card: {
    async findMany(args: { where: { id: { in: string[] } } }) {
      return args.where.id.in.map((id) => ({ id, name: `Card ${id}`, slug: id, setCode: "OGN", collectorNumber: id, imageThumbUrl: null }));
    },
  },
  priceAlert: {
    async findMany(args: unknown) {
      db.calls.push({ op: "priceAlert.findMany", args });
      return db.watch.map((cardId) => ({ cardId }));
    },
  },
  collectionCard: {
    async findMany(args: unknown) {
      db.calls.push({ op: "collectionCard.findMany", args });
      return db.own.map((cardId) => ({ cardId }));
    },
  },
  // The eBay row pull is a tagged-template DISTINCT ON query: the cheapest
  // (price + COALESCE(shipping, 0)) in-stock listing per card.
  async $queryRaw(_strings: TemplateStringsArray, ...values: unknown[]) {
    const [country, retailer] = values as [string, string];
    db.calls.push({ op: "$queryRaw", args: { country, retailer } });
    const best = new Map<string, Row>();
    for (const r of db.rows) {
      if (r.country !== country || r.retailer !== retailer || !r.inStock) continue;
      const cost = (x: Row) => x.priceCents + (x.shippingCents ?? 0);
      const prev = best.get(r.cardId);
      if (!prev || cost(r) < cost(prev)) best.set(r.cardId, r);
    }
    return [...best.values()].map(({ cardId, priceCents, shippingCents, url }) => ({ cardId, priceCents, shippingCents, url }));
  },
};

let arb: typeof import("../src/lib/arbitrage");
let topDeals: typeof import("../src/lib/top-deals");
let nudge: typeof import("../src/lib/premium-nudge");

before(async () => {
  (globalThis as unknown as { prisma: unknown }).prisma = stub;
  arb = await import("../src/lib/arbitrage");
  topDeals = await import("../src/lib/top-deals");
  nudge = await import("../src/lib/premium-nudge");
});

const row = (over: Partial<Row> & Pick<Row, "cardId" | "retailer" | "priceCents">): Row => ({
  retailerName: over.retailer,
  country: "US",
  shippingCents: null,
  url: `https://example.test/${over.retailer}/${over.cardId}`,
  inStock: true,
  ...over,
});
// TCGplayer's two US rows: the market reference and the cheapest listing.
const tcgMarket = (cardId: string, priceCents: number) => row({ cardId, retailer: "tcgplayer_market", priceCents });
const tcgLow = (cardId: string, priceCents: number) => row({ cardId, retailer: "tcgplayer", priceCents });

function usStore() {
  return arb.dealFinderSources("US").find((s) => !s.isEbay)!.key;
}

// ── Buy side ─────────────────────────────────────────────────────────────────

test("a converted TCGplayer reference row is never a buy source", () => {
  for (const country of ["UK", "SG"] as const) {
    const keys = arb.getArbSources(country).map((s) => s.key);
    assert.ok(!keys.includes(`tcgplayer_${country.toLowerCase()}`), `${country}: the converted reference row must not be offered`);
    assert.deepEqual(arb.resolveTcgBuyKeys(country, [`tcgplayer_${country.toLowerCase()}`]), [], `${country}: nor accepted from a URL`);
  }
  // The US row is a real listing, so getArbSources may list it — but the Deal
  // Finder strips it: TCGplayer is the reference side of every row.
  assert.ok(arb.getArbSources("US").some((s) => s.key === "tcgplayer"));
  assert.ok(!arb.dealFinderSources("US").some((s) => s.key === "tcgplayer"));
  const store = usStore();
  assert.deepEqual(arb.resolveTcgBuyKeys("US", ["tcgplayer", "tcgplayer_market", store, store, "nope", "ebay_us"]), [store, "ebay_us"]);
  for (const country of ["AU", "US", "UK", "SG", "CA", "EU"] as const) {
    for (const k of arb.defaultTcgBuyKeys(country)) {
      assert.ok(!/^tcgplayer|cardmarket/.test(k), `${country}: ${k} must not be on the default buy side`);
    }
  }
});

test("Canada's eBay feed (US listings, postage unquoted) is off the default buy side but still selectable", () => {
  assert.ok(!arb.defaultTcgBuyKeys("CA").includes("ebay_ca"));
  assert.ok(arb.dealFinderSources("CA").some((s) => s.key === "ebay_ca" && s.isEbay));
  assert.ok(arb.defaultTcgBuyKeys("US").includes("ebay_us"), "elsewhere eBay stays in the default");
});

test("a URL naming the reference row never reaches the query", async () => {
  db.rows = [row({ cardId: "c1", country: "UK", retailer: "tcgplayer_uk", priceCents: 400 }), tcgMarket("c1", 1000)];
  db.calls = [];
  const page = await arb.getArbitrageVsTcgplayer("UK", { buy: ["tcgplayer_uk"], sort: "saving" });
  assert.equal(page.total, 0);
  assert.ok(
    !db.calls.some((c) => JSON.stringify(c.args).includes("tcgplayer_uk")),
    "no query may select the converted reference row as a buy source",
  );
});

// ── eBay postage ─────────────────────────────────────────────────────────────

test("unknown eBay postage is never counted as free, and never called delivered", () => {
  const rows = [
    { cardId: "a", priceCents: 500, shippingCents: null, url: "u1" },
    { cardId: "b", priceCents: 500, shippingCents: 150, url: "u2" },
    { cardId: "c", priceCents: 500, shippingCents: 0, url: "u3" },
  ];
  const us = arb.cheapestEbayByCard("US", rows);
  assert.deepEqual(us.get("a"), { cents: 500, url: "u1", postageKnown: false });
  assert.deepEqual(us.get("b"), { cents: 650, url: "u2", postageKnown: true });
  assert.deepEqual(us.get("c"), { cents: 500, url: "u3", postageKnown: true }, "stated free postage IS known");
  // Canada's rows are US listings: postage to Canada is never known.
  assert.equal(arb.cheapestEbayByCard("CA", rows).get("b")?.postageKnown, false);
  assert.equal(arb.cheapestEbayByCard("CA", rows).get("b")?.cents, 500, "compared on the item price there");

  assert.equal(arb.ebayBuyLabel("US", true), "eBay (delivered)");
  assert.equal(arb.ebayBuyLabel("US", false), "eBay + postage");
  assert.equal(arb.ebayBuyLabel("CA", true), "eBay US + intl postage");
  assert.equal(arb.ebayBuyLabel("CA", false), "eBay US + intl postage");
});

test("an eBay row with no stated postage is labelled '+ postage' on the page, with its own price and link", async () => {
  db.rows = [
    row({ cardId: "e1", retailer: "ebay_us", priceCents: 600, shippingCents: null, url: "https://ebay.test/e1" }),
    row({ cardId: "e2", retailer: "ebay_us", priceCents: 600, shippingCents: 100, url: "https://ebay.test/e2" }),
    tcgMarket("e1", 1500),
    tcgMarket("e2", 1500),
  ];
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: ["ebay_us"], sort: "saving" });
  const e1 = page.items.find((i) => i.card.id === "e1")!;
  const e2 = page.items.find((i) => i.card.id === "e2")!;
  assert.equal(e1.buyStoreName, "eBay + postage");
  assert.equal(e1.postageIncluded, false);
  assert.equal(e1.buyCents, 600, "item price, no invented postage");
  assert.match(e1.buyUrl, /\/e1\?/, "the listing's own (affiliate-tagged) link");
  assert.equal(e2.buyStoreName, "eBay (delivered)");
  assert.equal(e2.buyCents, 700, "stated postage is included");
  assert.match(e2.buyUrl, /\/e2\?/);
});

// ── The US "TCGplayer low" rule ──────────────────────────────────────────────

test("in the US, a row TCGplayer's own cheapest listing already beats is not a deal", () => {
  assert.equal(arb.scoreVsTcg("US", 800, 1000, 650), null, "TCGplayer sells it for less");
  assert.equal(arb.scoreVsTcg("US", 800, 1000, 800), null, "…or for the same");
  assert.deepEqual(arb.scoreVsTcg("US", 800, 1000, 850), { belowCents: 200, belowPct: 20 });
  assert.deepEqual(arb.scoreVsTcg("US", 800, 1000, null), { belowCents: 200, belowPct: 20 }, "no listing, no check");
  // Outside the US the listing is a US seller's price with international
  // postage behind it — not a local option, so it is not a reason to drop.
  assert.deepEqual(arb.scoreVsTcg("AU", 800, 1500, 100), { belowCents: 700, belowPct: 46.7 });
  // The existing floors still apply.
  assert.equal(arb.scoreVsTcg("US", 250, 1000, null), null, "under the minimum buy price");
  assert.equal(arb.scoreVsTcg("US", 950, 1000, null), null, "under the minimum gap");
  assert.equal(arb.scoreVsTcg("US", 300, 2000, null), null, "85% below market is a mismatched listing, not a deal");
});

test("the TCGplayer row cache keeps both prices, one row per card, well under the cache ceiling", () => {
  const merged = arb.mergeTcgUsRows([
    { cardId: "a", retailer: "tcgplayer_market", priceCents: 1000, url: "m" },
    { cardId: "a", retailer: "tcgplayer", priceCents: 650, url: "l" },
    { cardId: "b", retailer: "tcgplayer", priceCents: 400, url: "l2" }, // no market row yet: legacy fallback
  ]);
  assert.deepEqual(merged.find((r) => r.cardId === "a"), { cardId: "a", priceCents: 1000, url: "m", lowCents: 650 });
  assert.deepEqual(merged.find((r) => r.cardId === "b"), { cardId: "b", priceCents: 400, url: "l2", lowCents: 400 });
  assert.equal(merged.length, 2);

  // Worst case: twice today's catalogue, both keys, long URLs. unstable_cache
  // silently drops entries past ~1.2 MB raw (src/lib/db.ts rule 2).
  const input = [];
  for (let i = 0; i < 3000; i++) {
    const id = `cm${String(i).padStart(23, "0")}`;
    const url = `https://www.tcgplayer.com/product/${600000 + i}/riftbound-league-of-legends-trading-card-game-origins-some-long-card-name?Language=English`;
    input.push({ cardId: id, retailer: "tcgplayer_market", priceCents: 123456, url }, { cardId: id, retailer: "tcgplayer", priceCents: 98765, url });
  }
  const bytes = JSON.stringify(arb.mergeTcgUsRows(input)).length;
  assert.ok(bytes < 800_000, `a 3,000-card entry is ${bytes} bytes — too close to the ~1.2 MB ceiling`);
});

test("the US list drops a store TCGplayer undercuts, end to end", async () => {
  const store = usStore();
  db.rows = [
    row({ cardId: "beaten", retailer: store, priceCents: 800 }),
    tcgMarket("beaten", 1000),
    tcgLow("beaten", 650),
    row({ cardId: "real", retailer: store, priceCents: 800 }),
    tcgMarket("real", 1000),
    tcgLow("real", 900),
  ];
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: [store], sort: "saving" });
  assert.deepEqual(page.items.map((i) => i.card.id), ["real"]);
  assert.equal(page.items[0].tcgLowCents, 900, "the page can show TCGplayer's low beside the market price");
  const ranks = await arb.getTcgDealRanks("US", [store]);
  assert.ok(!ranks.has("beaten"), "the nudge and the alert trigger rank from the same rule");
});

test("a store row shows the live listing's own price next to its own link", async () => {
  // The ranking is day-cached; if the store repriced since, the row must not
  // pair the cached figure with the live listing's name and URL.
  const store = usStore();
  db.rows = [row({ cardId: "s1", retailer: store, priceCents: 700, url: "https://store.test/s1" }), tcgMarket("s1", 1500)];
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: [store], sort: "saving" });
  const it = page.items[0];
  assert.equal(it.buyCents, 700);
  assert.match(it.buyUrl, /store\.test\/s1/);
  assert.equal(it.belowCents, 800);
  assert.equal(it.belowPct, arb.belowTcgPct(700, 1500));
});

// ── One "% below" ────────────────────────────────────────────────────────────

test("the homepage badge and the Deal Finder column use one % below definition", async () => {
  assert.equal(arb.belowTcgPct(500, 1000), 50, "half of market is 50% below — not the 100% 'margin' the tool used to show");
  assert.equal(arb.belowTcgPct(500, 0), null);
  const store = usStore();
  db.rows = [
    row({ cardId: "h1", retailer: store, priceCents: 500 }),
    tcgMarket("h1", 1000),
    row({ cardId: "h2", retailer: store, priceCents: 1234 }),
    tcgMarket("h2", 2999),
  ];
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: [store], sort: "pct" });
  assert.equal(page.items.length, 2);
  for (const it of page.items) {
    const deal = topDeals.savingsVsMarketDeal(it);
    assert.equal(deal.pctLabel, it.belowPct, `${it.card.id}: homepage "Save X%" must equal the tool's "% below"`);
    assert.equal(deal.refCents, it.marketCents);
    assert.equal(deal.deltaCents, it.belowCents);
  }
  const src = readFileSync(join(process.cwd(), "src/lib/top-deals.ts"), "utf8");
  assert.match(src, /pctLabel: belowTcgPct\(it\.buyCents, it\.marketCents\)/);
  assert.doesNotMatch(src, /const belowTcgPct =/, "no second, local definition");
  const pageSrc = readFileSync(join(process.cwd(), "src/app/tools/deal-finder/page.tsx"), "utf8");
  assert.match(pageSrc, /\{it\.belowPct\}%/, "the column renders the item's belowTcgPct");
});

test("the list is a buyer's list: no sell, profit or margin columns", () => {
  const src = readFileSync(join(process.cwd(), "src/app/tools/deal-finder/page.tsx"), "utf8");
  const ui = src.replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  for (const header of ["Best price", "TCGplayer market", "Below market", "% below"]) {
    assert.ok(ui.includes(`>${header}</th>`), `missing the "${header}" column`);
  }
  assert.doesNotMatch(ui, />\s*(Buy|Sell|Net profit|Margin)\s*</, "no flip-table headers");
  assert.doesNotMatch(ui, /Worth more on eBay|Cross-region|FlipTable|XRegionTable|getEbayCheapest/);
  const filters = readFileSync(join(process.cwd(), "src/components/ArbitrageFilters.tsx"), "utf8");
  assert.doesNotMatch(filters, /Sell on|sellLabel/);
  const lib = readFileSync(join(process.cwd(), "src/lib/arbitrage.ts"), "utf8");
  assert.doesNotMatch(lib, /EBAY_FEE|minByCardAndRetailer|export async function getArbitrage\(|getEbayCheapest/, "the flip and cheapest-on-eBay code is gone");
});

// ── Only my cards ────────────────────────────────────────────────────────────

test("onlyCardIds filters the ranked rows BEFORE paging", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ cardId: `c${i}`, below: 1000 - i }));
  const mine = new Set(rows.filter((_, i) => i % 2 === 0).map((r) => r.cardId)); // 30 cards
  const p2 = arb.pageRanked(rows, { page: 2, pageSize: 25, onlyCardIds: mine });
  assert.equal(p2.total, 30, "total counts only the reader's cards");
  assert.equal(p2.pageCount, 2);
  assert.equal(p2.page, 2);
  assert.deepEqual(p2.slice.map((r) => r.cardId), ["c50", "c52", "c54", "c56", "c58"], "page 2 is the 26th-30th of THEIR cards");
  assert.equal(p2.savingsTotalCents, [...mine].reduce((s, id) => s + rows.find((r) => r.cardId === id)!.below, 0));
  const none = arb.pageRanked(rows, { page: 1, pageSize: 25, onlyCardIds: new Set() });
  assert.deepEqual([none.total, none.pageCount, none.slice.length], [0, 1, 0]);
  const all = arb.pageRanked(rows, { page: 9, pageSize: 25 });
  assert.deepEqual([all.total, all.page, all.slice.length], [60, 3, 10], "no filter: unchanged, page clamped");
});

test("getArbitrageVsTcgplayer honours onlyCardIds end to end", async () => {
  const store = usStore();
  db.rows = [];
  for (let i = 0; i < 40; i++) {
    db.rows.push(row({ cardId: `m${i}`, retailer: store, priceCents: 500 }), tcgMarket(`m${i}`, 2000 - i * 10));
  }
  const only = new Set(["m3", "m30", "m39", "not-listed"]);
  const page = await arb.getArbitrageVsTcgplayer("US", { buy: [store], sort: "saving", page: 1, pageSize: 2, onlyCardIds: only });
  assert.equal(page.total, 3);
  assert.equal(page.pageCount, 2);
  assert.deepEqual(page.items.map((i) => i.card.id), ["m3", "m30"]);
  const p2 = await arb.getArbitrageVsTcgplayer("US", { buy: [store], sort: "saving", page: 2, pageSize: 2, onlyCardIds: only });
  assert.deepEqual(p2.items.map((i) => i.card.id), ["m39"]);
});

test("getUserCardIds is the capped, user-scoped select, and is never cached", async () => {
  db.calls = [];
  db.watch = ["w1", "w2", "w1"];
  db.own = ["o1"];
  assert.deepEqual([...(await nudge.getUserCardIds("u1", "watch"))], ["w1", "w2"]);
  assert.deepEqual([...(await nudge.getUserCardIds("u1", "own"))], ["o1"]);
  assert.deepEqual(db.calls.map((c) => [c.op, c.args]), [
    ["priceAlert.findMany", { where: { userId: "u1" }, select: { cardId: true }, take: 500 }],
    ["collectionCard.findMany", { where: { userId: "u1" }, select: { cardId: true }, take: 1000 }],
  ]);

  // Never inside a cache: a per-user entry would be one per account per day,
  // and wrapping it beside the self-caching ranking would disable that cache
  // (src/lib/db.ts rule 6).
  const ROOT = process.cwd();
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const callers = files.filter((f) => /getUserCardIds\(/.test(readFileSync(f, "utf8")));
  assert.ok(callers.some((f) => f.endsWith(join("tools", "deal-finder", "page.tsx"))), "the Deal Finder page reads it");
  for (const f of callers) {
    const src = readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /unstable_cache/, `${relative(ROOT, f)}: getUserCardIds must not sit beside unstable_cache`);
    assert.doesNotMatch(src, /cachedOrDirect\([\s\S]{0,600}?getUserCardIds/, `${relative(ROOT, f)}: never inside cachedOrDirect`);
  }
});

// ── Links ────────────────────────────────────────────────────────────────────

test("hrefFor carries buy, sort, mine and page through every control", () => {
  const p: DealFinderParams = { buy: ["cardempire", "ebay_us"], sort: "pct", page: 3, mine: "watch" };
  const url = (patch: Partial<DealFinderParams>) => new URL(hrefFor(p, patch), "https://x.test");
  const keep = (u: URL, except: string[] = []) => {
    if (!except.includes("buy")) assert.equal(u.searchParams.get("buy"), "cardempire,ebay_us");
    if (!except.includes("sort")) assert.equal(u.searchParams.get("sort"), "pct");
    if (!except.includes("mine")) assert.equal(u.searchParams.get("mine"), "watch");
    assert.equal(u.searchParams.get("view"), null, "no retired view= is ever emitted");
  };
  const next = url({ page: 4 }); // pager
  keep(next);
  assert.equal(next.searchParams.get("page"), "4");
  const sorted = url({ sort: "saving", page: 1 }); // sort tabs
  keep(sorted, ["sort"]);
  assert.equal(sorted.searchParams.get("sort"), null, "the default sort stays implicit");
  assert.equal(sorted.searchParams.get("page"), null);
  const stores = url({ buy: ["ebay_us"], page: 1 }); // store picker / eBay-only preset
  keep(stores, ["buy"]);
  assert.equal(stores.searchParams.get("buy"), "ebay_us");
  const chips = url({ mine: "own", page: 1 }); // Only my cards
  keep(chips, ["mine"]);
  assert.equal(chips.searchParams.get("mine"), "own");
  const all = url({ mine: null, page: 1 });
  keep(all, ["mine"]);
  assert.equal(all.searchParams.get("mine"), null);
  assert.equal(hrefFor({ buy: null, sort: "saving", page: 1, mine: null }), "/tools/deal-finder", "the canonical URL is bare");

  // Round trip: what a link writes is what the page reads back.
  const back = parseDealFinderParams(Object.fromEntries(next.searchParams), { allowMine: true, ebayKey: "ebay_us" });
  assert.deepEqual(back, { ...p, page: 4 });
});

test("retired and unentitled parameters resolve to the one list", () => {
  const opts = { allowMine: true, ebayKey: "ebay_us" };
  const dflt = { buy: null, sort: "saving", page: 1, mine: null };
  assert.deepEqual(parseDealFinderParams({ view: "flip" }, opts), dflt, "?view=flip lands on the default list");
  assert.deepEqual(parseDealFinderParams({ view: "xregion" }, opts), dflt, "?view=xregion lands on the default list");
  assert.deepEqual(parseDealFinderParams({ view: "deals" }, opts).buy, ["ebay_us"], "?view=deals opens the eBay-only preset");
  assert.equal(parseDealFinderParams({ view: "deals" }, { ...opts, ebayKey: null }).buy, null, "no eBay market: the default list");
  assert.equal(parseDealFinderParams({ sort: "margin" }, opts).sort, "pct", "old sort=margin links keep their order");
  assert.equal(parseDealFinderParams({ sort: "profit" }, opts).sort, "saving");
  assert.equal(parseDealFinderParams({ mine: "watch" }, opts).mine, "watch");
  assert.equal(parseDealFinderParams({ mine: "watch" }, { ...opts, allowMine: false }).mine, null, "free and signed-out: ?mine= is ignored");
  assert.equal(parseDealFinderParams({ mine: "everything" }, opts).mine, null);
  // A repeated key arrives as an array; it must not crash the page.
  assert.deepEqual(parseDealFinderParams({ buy: ["a,b", "c"], page: ["2", "9"] }, opts), { ...dflt, buy: ["a", "b"], page: 2 });
});

test("every link on the page goes through hrefFor", () => {
  const page = readFileSync(join(process.cwd(), "src/app/tools/deal-finder/page.tsx"), "utf8");
  assert.doesNotMatch(page, /["`']\/tools\/deal-finder\?/, "no hand-built Deal Finder query string");
  assert.match(page, /const params = parseDealFinderParams\(searchParams, \{ allowMine: member, ebayKey: ebay\?\.key \?\? null \}\);/);
  assert.match(page, /const member = isPremium\(user\);/, "mine is gated on a real membership, not review mode");
  for (const use of [
    /href=\{hrefFor\(params, \{ mine: c\.key, page: 1 \}\)\}/, // chips
    /href=\{hrefFor\(params, \{ buy: pr\.buy, page: 1 \}\)\}/, // presets
    /linkFor=\{\(s\) => hrefFor\(params, \{ sort: s, page: 1 \}\)\}/, // sort
    /linkFor=\{\(p\) => hrefFor\(params, \{ page: p \}\)\}/, // pager
    /<ArbitrageFilters sources=\{sources\} buy=\{buy\} defaultBuy=\{tcgBuyKeys\} params=\{params\} \/>/, // store picker
  ]) {
    assert.match(page, use);
  }
  const filters = readFileSync(join(process.cwd(), "src/components/ArbitrageFilters.tsx"), "utf8");
  assert.doesNotMatch(filters, /\/tools\/deal-finder/, "the picker builds no URL of its own");
  const records = readFileSync(join(process.cwd(), "src/app/market/records/page.tsx"), "utf8");
  assert.doesNotMatch(records, /view=xregion|full sortable screener/, "the free board no longer points at the cut tab");
});

test("members' nudges link to their own cards; free accounts keep the Plus upsell", () => {
  const card = readFileSync(join(process.cwd(), "src/components/PremiumNudgeCard.tsx"), "utf8");
  assert.match(card, /hrefFor\(\{ buy: null, sort: "saving", page: 1, mine: which \}\)/);
  assert.match(card, /surface === "nudge:portfolio" \? "own" : "watch"/);
  assert.match(card, /<PremiumButton surface=\{surface\} tier="plus" \/>/);
  assert.equal(hrefFor({ buy: null, sort: "saving", page: 1, mine: "watch" }), "/tools/deal-finder?mine=watch");
  assert.equal(hrefFor({ buy: null, sort: "saving", page: 1, mine: "own" }), "/tools/deal-finder?mine=own");

  const n = { watched: { deals: 4, dealsFree: 1, rising: 0, risingFree: 0 }, owned: { deals: 0, dealsFree: 0, rising: 0, risingFree: 0 }, example: null };
  const free = nudge.nudgeCopy(n, "watched")!;
  assert.match(free.line, /Plus shows every one, and can email you when one hits your price\.$/);
  assert.equal(free.kind, "deal");
  const member = nudge.nudgeCopy(n, "watched", "member")!;
  assert.doesNotMatch(member.line, /Plus|Premium|free top 3/, "a member is never pitched");
});
