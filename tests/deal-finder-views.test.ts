import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Deal Finder: three views (2026-09-30, DECISIONS.md "Deal Finder: three
// views"). Owner: "Can we just rename it underpriced versus TCG player? And get
// rid of the other ones … Then there should be a cheapest on eBay column. And
// then there should be an underpriced versus eBay column."
//
//   tcg      "Underpriced vs TCGplayer" (default) — store picker, no presets
//   ebay     "Cheapest on eBay"  — the whole ranking, paged, FREE for everyone
//   vs-ebay  "Underpriced vs eBay" — the mirror, gated like tcg
//
// The loaders run for real against a stub Prisma client installed as the
// global client before lib/db.ts is first imported (the pattern of
// tests/ebay-clicks-home.test.ts); cachedOrDirect falls back to a direct call
// outside Next, so every read the loaders make is visible in db.calls.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `expected ${JSON.stringify(from)}`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `expected ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return src.slice(a, b);
};
const PAGE = "src/app/tools/deal-finder/page.tsx";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Honours a nested `retailerPrices` select (where / orderBy priceCents asc / take), as Prisma does.
    async findMany(args: { where: { id: { in: string[] } }; select: Record<string, unknown>; take?: number }) {
      db.calls.push({ op: "card.findMany", args });
      const nested = args.select.retailerPrices as { where: Where; take?: number; select: Record<string, true> } | undefined;
      return args.where.id.in.slice(0, args.take ?? Infinity).map((id) => {
        const card: Record<string, unknown> = { id, name: `Card ${id}`, slug: `card-${id}`, setCode: "OGN", collectorNumber: id, imageThumbUrl: null };
        if (nested) {
          const rows = db.rows.filter((r) => r.cardId === id && matches(r, nested.where)).sort((a, b) => a.priceCents - b.priceCents);
          card.retailerPrices = rows.slice(0, nested.take ?? Infinity).map((r) => ({ retailer: r.retailer, retailerName: r.retailerName, priceCents: r.priceCents, url: r.url }));
        }
        return card;
      });
    },
  },
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

before(async () => {
  (globalThis as unknown as { prisma: unknown }).prisma = stub;
  arb = await import("../src/lib/arbitrage");
});

const row = (over: Partial<Row> & Pick<Row, "cardId" | "retailer" | "priceCents">): Row => ({
  retailerName: `${over.retailer} store`,
  country: "AU",
  shippingCents: null,
  url: `https://store.test/${over.retailer}/${over.cardId}`,
  inStock: true,
  ...over,
});
const ebay = (cents: number, postageKnown = true) => ({ cents, postageKnown, url: `https://www.ebay.com.au/itm/${cents}` });

// ── The mirror ranking, as pure logic ────────────────────────────────────────

test("rankUnderpricedVsEbay: a store below the cheapest eBay listing is listed; equal prices and cards with no eBay row are not", () => {
  const store = new Map([
    ["below", 1000],
    ["equal", 1500],
    ["dearer", 2500],
    ["no-ebay", 500],
  ]);
  const eb = new Map([
    ["below", ebay(1500)],
    ["equal", ebay(1500)],
    ["dearer", ebay(2000)],
    ["ebay-only", ebay(3000)], // no store at all
  ]);
  const out = arb.rankUnderpricedVsEbay("AU", store, eb);
  assert.deepEqual(out.map((r) => r.cardId), ["below"], "only the store that is genuinely cheaper");
  assert.deepEqual(out[0], { cardId: "below", store: 1000, ebay: 1500, postageKnown: true, ebayUrl: "https://www.ebay.com.au/itm/1500", below: 500, pct: 33.3 });
});

test("rankUnderpricedVsEbay: % below is a share of the EBAY price, not the store price", () => {
  const [r] = arb.rankUnderpricedVsEbay("UK", new Map([["a", 1500]]), new Map([["a", ebay(2000)]]));
  assert.equal(r.pct, 25, "(2000 − 1500) / 2000, never (2000 − 1500) / 1500 = 33.3");
  assert.equal(r.pct, arb.pctBelow(1500, 2000));
  assert.equal(arb.pctBelow(1500, 2000), arb.belowTcgPct(1500, 2000), "one arithmetic for every '% below' on the page");
});

test("rankUnderpricedVsEbay: sorted by money or by %, ties broken by the other measure, then the card id", () => {
  const store = new Map([
    ["a", 1000], // 1000 below 2000: 50%
    ["b", 3000], // 1000 below 4000: 25%
    ["c", 500], // 400 below 900: 44.4%
    ["d", 1000], // exact twin of "a"
  ]);
  const eb = new Map([
    ["a", ebay(2000)],
    ["b", ebay(4000)],
    ["c", ebay(900)],
    ["d", ebay(2000)],
  ]);
  assert.deepEqual(arb.rankUnderpricedVsEbay("AU", store, eb, "saving").map((r) => r.cardId), ["a", "d", "b", "c"], "money first; a and b tie at 1000, the bigger % first; a/d are twins, by id");
  assert.deepEqual(arb.rankUnderpricedVsEbay("AU", store, eb, "pct").map((r) => r.cardId), ["a", "d", "c", "b"], "% first");
  assert.deepEqual(arb.rankUnderpricedVsEbay("AU", store, eb).map((r) => r.cardId), ["a", "d", "b", "c"], "money is the default");
});

test("rankUnderpricedVsEbay: the guards mirror Cheapest on eBay's (100-unit floor, 50-unit gap, 80% outlier)", () => {
  const one = (storeCents: number, ebayCents: number) => arb.rankUnderpricedVsEbay("AU", new Map([["a", storeCents]]), new Map([["a", ebay(ebayCents)]])).length;
  assert.equal(one(99, 400), 0, "a store price under 1.00 is noise");
  assert.equal(one(100, 400), 1);
  assert.equal(one(1000, 1049), 0, "49 below is a near-tie");
  assert.equal(one(1000, 1050), 1);
  assert.equal(one(200, 1000), 0, "80% below eBay: the eBay listing is probably a different product");
  assert.equal(one(201, 1000), 1);
  assert.equal(arb.scoreVsEbay(1500, 1500), null, "a tie is not below");
  assert.equal(arb.scoreVsEbay(1600, 1500), null);
});

test("rankUnderpricedVsEbay: the eBay figure and its postage flag are carried exactly as the Deal Finder measures them", () => {
  const eb = arb.cheapestEbayByCard("AU", [
    { cardId: "k", priceCents: 1800, shippingCents: 200, url: "https://www.ebay.com.au/itm/k" },
    { cardId: "u", priceCents: 1800, shippingCents: null, url: "https://www.ebay.com.au/itm/u" },
  ]);
  const out = arb.rankUnderpricedVsEbay("AU", new Map([["k", 1000], ["u", 1000]]), eb);
  const by = Object.fromEntries(out.map((r) => [r.cardId, r]));
  assert.deepEqual([by.k.ebay, by.k.postageKnown, by.k.below], [2000, true, 1000], "delivered: item + stated postage");
  assert.deepEqual([by.u.ebay, by.u.postageKnown, by.u.below], [1800, false, 800], "no postage stated: the item price, flagged");
});

test("rankUnderpricedVsEbay: Canada is skipped — its eBay rows are US listings with unquoted postage", () => {
  const store = new Map([["a", 1000]]);
  const eb = new Map([["a", ebay(2000, false)]]);
  assert.equal(arb.rankUnderpricedVsEbay("AU", store, eb).length, 1, "the same input qualifies elsewhere");
  assert.deepEqual(arb.rankUnderpricedVsEbay("CA", store, eb), []);
});

test("the two eBay views can never both claim a card", () => {
  const store = new Map([["x", 1000], ["y", 3000], ["z", 2000]]);
  const eb = new Map([["x", ebay(2000)], ["y", ebay(1500)], ["z", ebay(2000)]]);
  const cheapest = new Set(arb.rankCheapestOnEbay("AU", store, eb, []).map((r) => r.cardId));
  const vs = new Set(arb.rankUnderpricedVsEbay("AU", store, eb).map((r) => r.cardId));
  assert.deepEqual([...cheapest], ["y"]);
  assert.deepEqual([...vs], ["x"]);
  assert.ok(!cheapest.has("z") && !vs.has("z"), "an equal price is on neither");
});

// ── Paging ───────────────────────────────────────────────────────────────────

test("pageOf: 1-based pages, clamped into range, with a total and a page count", () => {
  const rows = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual(arb.pageOf(rows, 1, 25).slice, rows.slice(0, 25));
  const last = arb.pageOf(rows, 3, 25);
  assert.deepEqual([last.slice, last.total, last.page, last.pageCount], [[50, 51, 52], 53, 3, 3]);
  assert.equal(arb.pageOf(rows, 99, 25).page, 3, "past the end: the last page");
  assert.equal(arb.pageOf(rows, 0, 25).page, 1);
  assert.equal(arb.pageOf(rows, Number.NaN, 25).page, 1);
  const none = arb.pageOf([], 4, 25);
  assert.deepEqual([none.slice, none.total, none.page, none.pageCount], [[], 0, 1, 1], "an empty list is one empty page");
});

test("getCheapestOnEbayPage: the whole ranking, paged, with ONE narrow detail query for the page's cards", async () => {
  const stores = arb.defaultBuySplit("AU").storeKeys;
  db.rows = [];
  for (let i = 0; i < 30; i++) {
    db.rows.push(
      row({ cardId: `c${String(i).padStart(2, "0")}`, retailer: stores[0], priceCents: 2000 + i * 10 }),
      row({ cardId: `c${String(i).padStart(2, "0")}`, retailer: "ebay", priceCents: 1000, shippingCents: 100, url: `https://www.ebay.com.au/itm/${i}` }),
    );
  }
  db.calls = [];
  const p2 = await arb.getCheapestOnEbayPage("AU", 2, 25);
  assert.deepEqual([p2.total, p2.page, p2.pageCount, p2.available], [30, 2, 2, true]);
  // Biggest gap first: c29 (2290 − 1100) … c00; page 2 is the five smallest.
  assert.deepEqual(p2.items.map((i) => i.card.id), ["c04", "c03", "c02", "c01", "c00"]);
  assert.equal(p2.items[0].ebayKey, "ebay");
  const detail = db.calls.filter((c) => c.op === "card.findMany");
  assert.equal(detail.length, 1, "one detail query");
  assert.deepEqual([...detail[0].args.where.id.in].sort(), ["c00", "c01", "c02", "c03", "c04"], "scoped to this page's cards");
  assert.equal(detail[0].args.take, 5, "take-bounded");
  assert.deepEqual(Object.keys(detail[0].args.select).sort(), ["collectorNumber", "id", "imageThumbUrl", "name", "setCode", "slug"], "narrow");
  assert.ok(!db.calls.some((c) => c.op === "retailerPrice.findMany"), "no listing read: the cached eBay row carries its URL");

  const p9 = await arb.getCheapestOnEbayPage("AU", 9, 25);
  assert.equal(p9.page, 2, "a page past the end is the last page, not an empty one");
});

test("getCheapestOnEbayPage: Canada is unavailable, at no read at all", async () => {
  db.rows = [row({ cardId: "a", country: "CA", retailer: "ebay_ca", priceCents: 500 })];
  db.calls = [];
  const p = await arb.getCheapestOnEbayPage("CA", 1, 25);
  assert.deepEqual([p.available, p.items, p.total], [false, [], 0]);
  assert.deepEqual(db.calls, []);
});

// ── Underpriced vs eBay end to end ───────────────────────────────────────────

test("getUnderpricedVsEbay: the same cached reads as Cheapest on eBay, then ONE nested detail query for the page", async () => {
  for (const country of ["AU", "US", "UK", "SG", "EU"] as const) {
    db.rows = [];
    db.calls = [];
    await arb.getCheapestOnEbayPage(country, 1, 25);
    const shape = (cs: typeof db.calls) =>
      cs
        .filter((c) => c.op === "groupBy" || c.op === "$queryRaw")
        .map((c) => (c.op === "groupBy" ? `groupBy ${[...c.args.where.retailer.in].sort().join("|")}` : `$queryRaw ${c.args.retailer}`))
        .sort();
    const cheapestReads = shape(db.calls);
    db.calls = [];
    await arb.getUnderpricedVsEbay(country, { sort: "saving" });
    assert.deepEqual(shape(db.calls), cheapestReads, `${country}: the very aggregates Cheapest on eBay reads, no more`);
  }

  const stores = arb.defaultBuySplit("AU").storeKeys;
  db.rows = [
    // a: two stores, the cheaper one wins; eBay 2000 delivered.
    row({ cardId: "a", retailer: stores[0], priceCents: 1200 }),
    row({ cardId: "a", retailer: stores[1], priceCents: 1000, retailerName: "Cheap Store" }),
    row({ cardId: "a", retailer: "ebay", priceCents: 1800, shippingCents: 200, url: "https://www.ebay.com.au/itm/a" }),
    // b: eBay is cheaper — Cheapest on eBay's card, not this view's.
    row({ cardId: "b", retailer: stores[0], priceCents: 3000 }),
    row({ cardId: "b", retailer: "ebay", priceCents: 1000 }),
    // c: store below eBay with no postage stated.
    row({ cardId: "c", retailer: stores[0], priceCents: 500 }),
    row({ cardId: "c", retailer: "ebay", priceCents: 900, url: "https://www.ebay.com.au/itm/c" }),
    // d: no eBay listing at all.
    row({ cardId: "d", retailer: stores[0], priceCents: 400 }),
  ];
  db.calls = [];
  const page = await arb.getUnderpricedVsEbay("AU", { sort: "saving", page: 1, pageSize: 25 });
  assert.equal(page.available, true);
  assert.deepEqual(page.items.map((i) => i.card.id), ["a", "c"]);
  const a = page.items[0];
  assert.deepEqual(
    [a.storeCents, a.storeKey, a.storeName, a.ebayCents, a.postageKnown, a.belowCents, a.belowPct],
    [1000, stores[1], "Cheap Store", 2000, true, 1000, 50],
  );
  assert.equal(page.items[1].postageKnown, false, "c's eBay seller stated no postage");
  // Both links are the listing's own, tagged with the Deal Finder as their page.
  assert.ok(decodeURIComponent(a.storeUrl).includes(`store.test/${stores[1]}/a`), `the winning store's own listing: ${a.storeUrl}`);
  assert.match(a.ebayUrl, /ebay\.com\.au\/itm\/a/);
  assert.equal(new URL(a.ebayUrl).searchParams.get("customid"), "rc-au-ebay-tools-product", "EPN names the Deal Finder's page, as the default list's eBay rows do — not -home");

  const detail = db.calls.filter((c) => c.op === "card.findMany");
  assert.equal(detail.length, 1, "one detail query");
  assert.deepEqual([...detail[0].args.where.id.in].sort(), ["a", "c"], "scoped to the page's cards");
  assert.equal(detail[0].args.take, 2, "take-bounded");
  const nested = detail[0].args.select.retailerPrices;
  assert.deepEqual([nested.take, nested.orderBy, nested.where.country, nested.where.inStock], [1, { priceCents: "asc" }, "AU", true], "each card's one cheapest in-stock listing");
  assert.deepEqual([...nested.where.retailer.in].sort(), [...stores].sort(), "on exactly the store side it was ranked on");
  assert.ok(!db.calls.some((c) => c.op === "retailerPrice.findMany"), "no second per-request read");
});

test("getUnderpricedVsEbay: in the EU CardTrader is on the store side, as it is on Cheapest on eBay's", async () => {
  db.rows = [];
  db.calls = [];
  await arb.getUnderpricedVsEbay("EU", { sort: "saving" });
  assert.ok(db.calls.some((c) => c.op === "groupBy" && c.args.where.retailer.in.includes("cardtrader")));
  db.rows = [
    row({ cardId: "a", country: "EU", retailer: "cardtrader", retailerName: "CardTrader", priceCents: 800 }),
    row({ cardId: "a", country: "EU", retailer: "ebay_eu", priceCents: 1500, shippingCents: 100 }),
  ];
  const page = await arb.getUnderpricedVsEbay("EU", { sort: "saving" });
  assert.deepEqual(page.items.map((i) => [i.storeKey, i.storeCents, i.belowCents]), [["cardtrader", 800, 800]]);
});

test("getUnderpricedVsEbay: a store that repriced since the cache was built is re-scored, never shown with a stale figure", async () => {
  const stores = arb.defaultBuySplit("AU").storeKeys;
  db.rows = [
    row({ cardId: "a", retailer: stores[0], priceCents: 1000 }),
    row({ cardId: "a", retailer: "ebay", priceCents: 2000, shippingCents: 0 }),
    row({ cardId: "b", retailer: stores[0], priceCents: 1000 }),
    row({ cardId: "b", retailer: "ebay", priceCents: 2000, shippingCents: 0 }),
  ];
  // The ranking reads the aggregate; then b's store reprices before the detail read.
  const realFindMany = stub.card.findMany;
  stub.card.findMany = async (args) => {
    db.rows = db.rows.map((r) => (r.cardId === "b" && r.retailer === stores[0] ? { ...r, priceCents: 1990 } : r.cardId === "a" && r.retailer === stores[0] ? { ...r, priceCents: 1100 } : r));
    return realFindMany(args);
  };
  try {
    const page = await arb.getUnderpricedVsEbay("AU", { sort: "saving" });
    assert.deepEqual(page.items.map((i) => [i.card.id, i.storeCents, i.belowCents]), [["a", 1100, 900]], "a shows its live price and gap; b no longer qualifies");
    assert.equal(page.total, 2, "the total is the cached ranking's");
  } finally {
    stub.card.findMany = realFindMany;
  }
});

test("getUnderpricedVsEbay: 'Only my cards' filters before paging", async () => {
  const stores = arb.defaultBuySplit("AU").storeKeys;
  db.rows = [];
  for (let i = 0; i < 10; i++) {
    db.rows.push(row({ cardId: `c${i}`, retailer: stores[0], priceCents: 1000 }), row({ cardId: `c${i}`, retailer: "ebay", priceCents: 2000 + i * 100 }));
  }
  const page = await arb.getUnderpricedVsEbay("AU", { sort: "saving", page: 2, pageSize: 2, onlyCardIds: new Set(["c1", "c3", "c5", "c7", "zz"]) });
  assert.deepEqual([page.total, page.page, page.pageCount], [4, 2, 2]);
  assert.deepEqual(page.items.map((i) => i.card.id), ["c3", "c1"], "page 2 of the member's own cards, not of the whole list");
});

test("getUnderpricedVsEbay: Canada is unavailable at no read, and a failed read is an empty page", async () => {
  db.calls = [];
  const ca = await arb.getUnderpricedVsEbay("CA", { sort: "saving" });
  assert.deepEqual([ca.available, ca.items.length], [false, 0]);
  assert.deepEqual(db.calls, []);
  const realGroupBy = stub.retailerPrice.groupBy;
  stub.retailerPrice.groupBy = async () => {
    throw new Error("neon down");
  };
  try {
    // A fresh key list is not coalesced outside Next, so the throw reaches the loader.
    const failed = await arb.getUnderpricedVsEbay("SG", { sort: "pct" });
    assert.deepEqual([failed.items.length, failed.total], [0, 0]);
  } finally {
    stub.retailerPrice.groupBy = realGroupBy;
  }
});

test("the new loaders are self-cached through their inputs: never wrapped, and listed in the nested-cache guard", () => {
  const lib = code("src/lib/arbitrage.ts");
  for (const fn of ["export async function getCheapestOnEbayPage", "export async function getUnderpricedVsEbay"]) {
    const body = between(lib, fn, "\n}\n");
    assert.doesNotMatch(body, /cachedOrDirect\(|unstable_cache\(/, `${fn}: no cache of its own`);
  }
  assert.match(between(lib, "async function ebayComparisonInputs", "\n}\n"), /minByCard\(country, storeKeys\)[\s\S]*minByCard\(country, extraKeys\)[\s\S]*getEbayRowsMemoized\(country, buyEbayKey\)/);
  const nested = read("tests/nested-cache.test.ts");
  assert.match(nested, /"getCheapestOnEbayPage",/);
  assert.match(nested, /"getUnderpricedVsEbay",/);
});

// ── The page ─────────────────────────────────────────────────────────────────

test("three view tabs, directly under the intro, built by hrefFor", () => {
  const src = code(PAGE);
  assert.match(src, /\{ key: "tcg", label: "Underpriced vs TCGplayer" \},\s*\{ key: "ebay", label: "Cheapest on eBay" \},\s*\{ key: "vs-ebay", label: "Underpriced vs eBay" \},/);
  assert.equal((src.match(/<ViewTabs params=\{params\} \/>/g) ?? []).length, 1, "one tab row");
  const intro = src.indexOf("<HubIntro");
  const tabs = src.indexOf("<ViewTabs");
  assert.ok(intro > 0 && tabs > intro, "after the intro");
  for (const section of ['{view === "tcg" && (', '{view === "ebay" && cheapestEbay && (', '{view === "vs-ebay" && (']) {
    assert.ok(src.indexOf(section) > tabs, `${section} renders below the tabs`);
  }
  const tabRow = between(src, "function ViewTabs(", "\n}\n");
  assert.match(tabRow, /href=\{hrefFor\(params, \{ view: v\.key, page: 1 \}\)\}/, "a link per view, the page reset");
  assert.match(tabRow, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(tabRow, /grid grid-cols-3 /, "one row of three at every width (tests/grid-base-columns.test.ts)");
  assert.match(tabRow, /min-h-11/, "44px tap targets");
  assert.doesNotMatch(tabRow, /useState|onClick/, "links, not client state");
});

test("the default view is renamed, and the Buy-from presets are gone", () => {
  const src = code(PAGE);
  assert.match(src, />Underpriced vs TCGplayer<\/h2>/);
  assert.doesNotMatch(read(PAGE), /Cheaper than TCGplayer market/, "the old heading, nowhere on the page");
  assert.doesNotMatch(src, /presets|Stores only|Stores \+ eBay|Buy from|sameSet/, "no preset chips or their code");
  // The store picker stays, on the TCGplayer view only.
  assert.equal((src.match(/<ArbitrageFilters /g) ?? []).length, 1);
  const tcg = between(src, '{view === "tcg" && (', '{view === "ebay" && cheapestEbay && (');
  assert.match(tcg, /<ArbitrageFilters sources=\{sources\} buy=\{buy\} defaultBuy=\{tcgBuyKeys\} params=\{params\} \/>/);
  const rest = src.slice(src.indexOf('{view === "ebay" && cheapestEbay && ('));
  assert.doesNotMatch(rest.slice(0, rest.indexOf("function ")), /ArbitrageFilters/, "no picker on the eBay views");
  for (const f of ["src/app/llms.txt/route.ts", "src/app/tools/page.tsx", "src/lib/articles.ts", "src/lib/content/hub-intros.ts", "src/components/TierComparisonTable.tsx"]) {
    assert.doesNotMatch(read(f), /Cheaper than TCGplayer market|eBay-only view/, `${f}: the old name or the retired preset`);
  }
});

test("gating per view: vs-ebay is locked / top 3 / full like the TCGplayer list; the eBay view is free", () => {
  const src = code(PAGE);
  // Underpriced vs eBay: nothing signed out, three rows queried for a free
  // account (page 1, default sort, never ?mine=), a full page for members.
  assert.match(
    src,
    /const vsEbay =\s*view !== "vs-ebay"\s*\?\s*null\s*:\s*access === "full"\s*\?\s*await getUnderpricedVsEbay\(country, \{ sort, page, pageSize: PAGE_SIZE, onlyCardIds \}\)\s*:\s*access === "top3"\s*\?\s*await getUnderpricedVsEbay\(country, \{ sort: "saving", page: 1, pageSize: FREE_PREVIEW_ROWS \}\)\s*:\s*null;/,
  );
  // The TCGplayer list is queried only on its own view.
  assert.match(src, /const data =\s*view !== "tcg"\s*\?\s*null\s*:\s*access === "full"/);
  const vs = between(src, '{view === "vs-ebay" && (', "How Deal Finder works");
  assert.match(vs, /\{vsEbay === null \? \(\s*<>\s*<LockedPreview \/>/, "signed out: the prop-less lock");
  assert.match(vs, /access === "full" \? \(\s*<Pager total=\{vsEbay\.total\}/, "members page");
  assert.match(vs, /<MorePremium more=\{vsEbay\.total - vsEbay\.items\.length\} unit="cards" \/>/, "a free account gets a count, never rows");
  assert.match(vs, /access === "full" && vsEbay\?\.available && \(/, "the sort bar is members-only");
  assert.match(vs, /<SortTabs sorts=\{VS_EBAY_SORTS\}/);
  // Cheapest on eBay: one call, no access in it, a pager for everyone.
  assert.match(src, /const cheapestEbay = view === "ebay" \? await getCheapestOnEbayPage\(country, page, PAGE_SIZE\) : null;/);
  const eb = between(src, '{view === "ebay" && cheapestEbay && (', '{view === "vs-ebay" && (');
  assert.doesNotMatch(eb, /access|LockedPreview|MorePremium/);
  assert.match(eb, /<Pager\s+total=\{cheapestEbay\.total\}/, "paged for every visitor");
  // The "Prices as of" aggregate: skipped signed out on the gated views only.
  assert.match(src, /view !== "ebay" && access === "none" \? Promise\.resolve\(null\) : getPricesAsOf\(country\)/);
});

test("Canada and markets with no eBay feed get an honest empty state on both eBay views", () => {
  const src = code(PAGE);
  const eb = between(src, '{view === "ebay" && cheapestEbay && (', '{view === "vs-ebay" && (');
  assert.match(eb, /!cheapestEbay\.available \? \(\s*<Empty>\s*<NoEbayComparison /);
  const vs = between(src, '{view === "vs-ebay" && (', "How Deal Finder works");
  assert.match(vs, /!vsEbay\.available \? \(\s*<Empty>\s*<NoEbayComparison /);
  const msg = between(src, "function NoEbayComparison(", "\n}\n");
  assert.match(msg, /country === "CA"/);
  assert.match(msg, /international\s+postage/);
});

test("the eBay mirror's copy is honest: an asking price, item prices postage extra, % of the eBay price", () => {
  const src = read(PAGE);
  const vs = between(src, '{view === "vs-ebay" && (', "How Deal Finder works");
  assert.match(vs, /asking\s+price, not a sale/);
  assert.match(vs, /postage is added at checkout, so the real gap is smaller/);
  assert.match(vs, /% below is a share of the eBay price|%\s+below is a share of the eBay price/);
  const table = between(src, "function VsEbayTable(", "\n}\n");
  assert.match(table, /known \? "delivered" : "\+ postage"/, "delivered only when the seller stated postage");
  for (const col of ["Card", "Best store price", "Cheapest on eBay", "Below eBay", "% below"]) assert.match(table, new RegExp(`>${col.replace(/[+%]/g, "\\$&")}</th>`));
  assert.match(table, /href=\{it\.storeUrl\}\s+retailer=\{it\.storeKey\}[\s\S]*?pageType="deals"\s+surface="table"/, "the store link is a measured OutboundLink");
  assert.match(table, /href=\{it\.ebayUrl\} retailer=\{it\.ebayKey\}/);
  assert.doesNotMatch(code(PAGE), /money.?back|buyer protection|\bhurry\b|\bonly \d+ left\b/i);
});
