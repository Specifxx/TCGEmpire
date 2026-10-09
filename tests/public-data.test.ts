import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { runPublicQuery } from "../src/lib/public-data/engine";
import { publicDataSource, resetPublicDataSource } from "../src/lib/public-data/store";
import { PublicDataUnsupported } from "../src/lib/public-data/models";
import { routeQuery } from "../src/lib/public-data/route";
import { withLiveData } from "../src/lib/public-data/mode";

// ─────────────────────────────────────────────────────────────────────────────
// Public data as files (DECISIONS.md, "Public data moves out of Neon into the
// repository", 2026-10-09). Fixture tables go through the exporter into a
// scratch directory, are read back by the store, and are queried through the
// engine with the same argument shapes the site sends Prisma. Every expected
// answer here is what Postgres returns for that query.
// ─────────────────────────────────────────────────────────────────────────────

const T0 = new Date("2026-10-09T07:12:31.000Z");
const T0m = new Date("2026-10-09T07:12:00.000Z");
const OLD = new Date("2026-10-08T19:05:00.000Z");

const card = (id: string, extra: Record<string, unknown>) => ({
  id,
  externalId: null,
  slug: `${id}-slug`,
  name: id,
  nameNormalized: id.toLowerCase(),
  setCode: "OGN",
  setName: "Origins",
  collectorNumber: "001",
  domain: "Fury",
  type: "Unit",
  rarity: "Common",
  variant: null,
  isOvernumbered: false,
  isPromo: false,
  orientation: null,
  energyCost: 1,
  might: 1,
  power: null,
  tags: null,
  description: null,
  flavorText: null,
  imageUrl: null,
  imageThumbUrl: null,
  blurDataUrl: null,
  imageHash: null,
  marketPriceCents: 0,
  lowestPriceCents: null,
  lowestPriceCentsUs: null,
  lowestPriceCentsUk: null,
  lowestPriceCentsSg: null,
  lowestPriceCentsCa: null,
  lowestPriceCentsEu: null,
  artSeed: 1,
  viewCount: 0,
  searchCount: 0,
  lastViewedAt: new Date("2026-10-09T01:00:00Z"),
  ebayCheckedAt: new Date("2026-10-09T02:00:00Z"),
  createdAt: new Date("2026-06-01T00:00:00Z"),
  ...extra,
});

let n = 0;
const price = (cardId: string, extra: Record<string, unknown>) => ({
  id: `db-${++n}`,
  cardId,
  retailer: "storea",
  retailerName: "Store A",
  title: `${cardId} listing`,
  url: `https://a.example/${cardId}/${n}`,
  condition: "NM",
  isFoil: false,
  priceCents: 100,
  shippingCents: null,
  currency: "AUD",
  inStock: true,
  lastSeen: T0,
  derived: null,
  country: "AU",
  ...extra,
});

const tables: Tables = {
  Card: [
    card("Jinx", { collectorNumber: "010", lowestPriceCents: 500, rarity: "Rare", searchCount: 900, viewCount: 4000, setCode: "OGN" }),
    card("Ahri", { collectorNumber: "002", lowestPriceCents: 200, searchCount: 50, viewCount: 4000, setCode: "SFD", nameNormalized: "ahri" }),
    card("Vi", { collectorNumber: "003", lowestPriceCents: null, searchCount: 0, viewCount: 7, tags: "Piltover" }),
    card("Ekko", { collectorNumber: "004", lowestPriceCents: 900, searchCount: 900, viewCount: 1 }),
  ],
  RetailerPrice: [
    price("Jinx", { priceCents: 700 }),
    price("Jinx", { priceCents: 500, retailer: "storeb", retailerName: "Store B", lastSeen: OLD }),
    price("Jinx", { priceCents: 450, inStock: false }),
    price("Jinx", { priceCents: 900, country: "US", currency: "USD", retailer: "tcgplayer", retailerName: "TCGplayer" }),
    price("Ahri", { priceCents: 200 }),
    price("Ekko", { priceCents: 900, condition: null }),
  ],
  SealedListing: [
    { id: "s1", groupKey: "ogn-box", title: "Origins Booster Box", productType: "Booster Box", setCode: "OGN", retailer: "storea", retailerName: "Store A", priceCents: 20000, url: "https://a.example/box", imageUrl: null, inStock: true, country: "AU", lastSeen: T0 },
  ],
  SealedGroupFirstSeen: [{ groupKey: "ogn-box", country: "AU", firstSeenAt: new Date("2026-06-01T00:00:00Z") }],
  EbayAdListing: [],
  EbayGradedListing: [],
  EbayAuctionListing: [
    { id: "auc1", itemId: "123", country: "US", title: "PSA 10 Jinx", url: "https://ebay.example/123", imageUrl: null, currentBidCents: 24750, currency: "USD", bidCount: 43, endsAt: new Date("2026-10-09T10:00:00Z"), buyItNowCents: null, condition: null, grader: "PSA", grade: 10, updatedAt: T0 },
  ],
};

const scratch = mkdtempSync(join(tmpdir(), "rc-public-data-"));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

function writeFiles(dir: string, t: Tables) {
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, body] of buildPublicFiles(t, { generatedAt: T0, source: "TEST" })) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
}
writeFiles(scratch, tables);

const q = (model: string, op: string, args?: Record<string, unknown>) => {
  resetPublicDataSource();
  return runPublicQuery(publicDataSource(scratch), model as never, op, args) as never;
};

test("a card by slug, with its in-stock listings cheapest first — the card page's shape", () => {
  const c = q("Card", "findUnique", {
    where: { slug: "Jinx-slug" },
    select: { id: true, name: true, retailerPrices: { where: { inStock: true }, orderBy: { priceCents: "asc" }, select: { retailer: true, priceCents: true, lastSeen: true } } },
  }) as { name: string; retailerPrices: { retailer: string; priceCents: number; lastSeen: Date }[] };
  assert.equal(c.name, "Jinx");
  assert.deepEqual(c.retailerPrices.map((r) => r.priceCents), [500, 700, 900]);
  // Dates come back as Dates. A store's shared import minute is rebuilt from
  // meta, a row seen at another time keeps its own.
  assert.ok(c.retailerPrices[0].lastSeen instanceof Date);
  assert.equal(c.retailerPrices[0].lastSeen.toISOString(), OLD.toISOString());
  assert.equal(c.retailerPrices[1].lastSeen.toISOString(), T0m.toISOString());
});

test("filters: OR, case-insensitive contains, NULL semantics, in/notIn", () => {
  const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
  assert.deepEqual(names(q("Card", "findMany", { where: { OR: [{ nameNormalized: { contains: "AHR", mode: "insensitive" } }, { name: "Vi" }] } })), ["Ahri", "Vi"]);
  // `not` and `notIn` exclude NULL rows, as `<>` and NOT IN do in SQL.
  assert.deepEqual(names(q("Card", "findMany", { where: { lowestPriceCents: { not: 500 } } })), ["Ahri", "Ekko"]);
  assert.deepEqual(names(q("Card", "findMany", { where: { tags: { notIn: ["x"] } } })), ["Vi"]);
  assert.deepEqual(names(q("Card", "findMany", { where: { lowestPriceCents: null } })), ["Vi"]);
  assert.deepEqual(names(q("Card", "findMany", { where: { lowestPriceCents: { not: null }, NOT: { setCode: "SFD" } } })), ["Ekko", "Jinx"]);
  assert.deepEqual(names(q("Card", "findMany", { where: { lowestPriceCents: { gte: 500, lt: 900 } } })), ["Jinx"]);
});

test("ORDER BY puts NULLs last ascending and first descending, unless told otherwise; then skip/take", () => {
  const order = (args: Record<string, unknown>) => (q("Card", "findMany", { ...args, select: { name: true } }) as { name: string }[]).map((r) => r.name);
  assert.deepEqual(order({ orderBy: { lowestPriceCents: "asc" } }), ["Ahri", "Jinx", "Ekko", "Vi"]);
  assert.deepEqual(order({ orderBy: { lowestPriceCents: "desc" } }), ["Vi", "Ekko", "Jinx", "Ahri"]);
  assert.deepEqual(order({ orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } } }), ["Ekko", "Jinx", "Ahri", "Vi"]);
  assert.deepEqual(order({ orderBy: [{ lowestPriceCents: { sort: "desc", nulls: "last" } }, { name: "asc" }], skip: 1, take: 2 }), ["Jinx", "Ahri"]);
});

test("demand counters are published as ranks: the popular order is exact, the numbers are not in the file", () => {
  const order = (q("Card", "findMany", { orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }, { name: "asc" }], select: { name: true } }) as { name: string }[]).map((r) => r.name);
  assert.deepEqual(order, ["Jinx", "Ekko", "Ahri", "Vi"]);
  assert.deepEqual((q("Card", "findMany", { where: { searchCount: { gt: 0 } }, select: { name: true } }) as unknown[]).length, 3);
  const raw = readFileSync(join(scratch, "cards.json"), "utf8");
  assert.doesNotMatch(raw, /"searchCount":900|"viewCount":4000/);
  assert.doesNotMatch(raw, /lastViewedAt|ebayCheckedAt/);
  const vi = q("Card", "findFirst", { where: { name: "Vi" } }) as { lastViewedAt: unknown; ebayCheckedAt: unknown };
  assert.equal(vi.lastViewedAt, null);
  assert.equal(vi.ebayCheckedAt, null);
});

test("store counts: _count of a filtered relation, and groupBy with _count/_min ordered by an aggregate", () => {
  const rows = q("Card", "findMany", {
    where: { id: { in: ["Jinx", "Ahri", "Vi"] } },
    orderBy: { name: "asc" },
    select: { name: true, _count: { select: { retailerPrices: { where: { inStock: true, country: "AU", retailer: { notIn: ["tcgplayer_au"] } } } } } },
  }) as { name: string; _count: { retailerPrices: number } }[];
  assert.deepEqual(rows.map((r) => [r.name, r._count.retailerPrices]), [["Ahri", 1], ["Jinx", 2], ["Vi", 0]]);

  const groups = q("RetailerPrice", "groupBy", {
    by: ["cardId", "country"],
    where: { inStock: true },
    _count: { _all: true },
    _min: { priceCents: true },
    orderBy: { _min: { priceCents: "asc" } },
  }) as { cardId: string; country: string; _count: { _all: number }; _min: { priceCents: number } }[];
  assert.deepEqual(groups.map((g) => [g.cardId, g.country, g._count._all, g._min.priceCents]), [
    ["Ahri", "AU", 1, 200],
    ["Jinx", "AU", 2, 500],
    // A tie: Postgres leaves its order undefined; the engine keeps scan order.
    ["Ekko", "AU", 1, 900],
    ["Jinx", "US", 1, 900],
  ]);
  assert.equal(q("RetailerPrice", "count", { where: { cardId: "Jinx" } }), 4);
  assert.deepEqual(q("RetailerPrice", "aggregate", { where: { country: "AU" }, _min: { priceCents: true }, _max: { lastSeen: true }, _count: true }), {
    _min: { priceCents: 200 },
    _max: { lastSeen: T0m },
    _count: 5,
  });
});

test("a listing filtered by its card's columns, and including its card", () => {
  const rows = q("RetailerPrice", "findMany", {
    where: { card: { setCode: "SFD" } },
    include: { card: { select: { name: true } } },
  }) as { priceCents: number; card: { name: string } }[];
  assert.deepEqual(rows.map((r) => [r.card.name, r.priceCents]), [["Ahri", 200]]);
});

test("listing ids are stable across exports even though the database re-creates the rows", () => {
  const ids = () => (q("RetailerPrice", "findMany", { where: { cardId: "Jinx" }, orderBy: { priceCents: "asc" }, select: { id: true } }) as { id: string }[]).map((r) => r.id);
  const before = ids();
  const other = mkdtempSync(join(tmpdir(), "rc-public-data-2-"));
  try {
    writeFiles(other, { ...tables, RetailerPrice: tables.RetailerPrice!.map((r) => ({ ...r, id: `fresh-${r.id}` })) });
    resetPublicDataSource();
    const after = (runPublicQuery(publicDataSource(other), "RetailerPrice", "findMany", { where: { cardId: "Jinx" }, orderBy: { priceCents: "asc" }, select: { id: true } }) as { id: string }[]).map((r) => r.id);
    assert.deepEqual(after, before);
    assert.ok(before.every((id) => id.startsWith("pd_")));
    // findUnique by that id finds the row again (the price-report route's lookup).
    const one = q("RetailerPrice", "findUnique", { where: { id: before[0] }, select: { priceCents: true } }) as { priceCents: number };
    assert.equal(one.priceCents, 450);
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

test("compound unique selectors, other public tables, and one file per carded listing set", () => {
  const auction = q("EbayAuctionListing", "findUnique", { where: { itemId_country: { itemId: "123", country: "US" } } }) as { bidCount: number; endsAt: Date };
  assert.equal(auction.bidCount, 43);
  assert.ok(auction.endsAt instanceof Date);
  const first = q("SealedGroupFirstSeen", "findMany", {}) as { groupKey: string }[];
  assert.equal(first[0].groupKey, "ogn-box");
  assert.deepEqual(readdirSync(join(scratch, "listings")).sort(), ["Ahri.json", "Ekko.json", "Jinx.json"]);
});

test("anything the engine cannot answer exactly is refused, never approximated", () => {
  for (const [model, op, args] of [
    ["Card", "findMany", { cursor: { id: "Jinx" }, take: 1 }],
    ["Card", "findMany", { where: { collectedBy: { some: {} } } }],
    ["Card", "findMany", { include: { priceAlerts: true } }],
    ["RetailerPrice", "groupBy", { by: ["cardId"], having: { priceCents: { _min: { gt: 1 } } } }],
    ["Card", "findMany", { where: { name: { search: "jinx" } } }],
    ["Card", "upsert", {}],
  ] as const) {
    assert.throws(() => q(model, op, args as Record<string, unknown>), PublicDataUnsupported, `${model}.${op} ${JSON.stringify(args)}`);
  }
});

test("routing: db mode never reads files; files mode answers from them and hands refusals to Neon; live scope asks Neon first", async () => {
  process.env.PUBLIC_DATA_DIR = scratch;
  const neon = async () => "neon";
  const saved = process.env.PUBLIC_DATA_MODE;
  try {
    delete process.env.PUBLIC_DATA_MODE;
    assert.equal(await routeQuery("Card", "count", {}, neon), "neon");
    process.env.PUBLIC_DATA_MODE = "files";
    resetPublicDataSource();
    assert.equal(await routeQuery("Card", "count", {}, neon), 4);
    assert.equal(await routeQuery("Card", "findMany", { cursor: { id: "x" } }, neon), "neon");
    assert.equal(await routeQuery("User", "count", {}, neon), "neon", "private models always go to Neon");
    assert.equal(await routeQuery("Card", "update", {}, neon), "neon", "writes always go to Neon");
    assert.equal(await withLiveData(() => routeQuery("Card", "count", {}, neon)), "neon");
    // Live scope falls back to files when Neon cannot answer.
    const down = async () => {
      throw Object.assign(new Error("Your project has exceeded the data transfer quota."), { name: "PrismaClientInitializationError" });
    };
    assert.equal(await withLiveData(() => routeQuery("Card", "count", {}, down)), 4);
    // A real query error is not hidden behind the files.
    const broken = async () => {
      throw new Error("Invalid `prisma.card.count()` invocation: Unknown argument");
    };
    await assert.rejects(() => withLiveData(() => routeQuery("Card", "count", {}, broken)), /Unknown argument/);
  } finally {
    if (saved === undefined) delete process.env.PUBLIC_DATA_MODE;
    else process.env.PUBLIC_DATA_MODE = saved;
    resetPublicDataSource();
  }
});

// The site's own query builders, run against the files. These are the shapes
// behind /browse, /sets, search and every card tile; if the engine refused one
// of them, that page would quietly keep reading Neon in "files" mode.
test("the browse and search query builders run on the files without a refusal", async () => {
  const { buildCardWhere, buildCardOrderBy, cardTileSelect } = await import("../src/lib/cards");
  const queries = [
    {},
    { q: "jinx" },
    { q: "akali overnumbered" },
    { domain: "Fury", rarity: "Rare", type: "Unit", set: "OGN" },
    { variant: "alt" },
    { variant: "base" },
    { tag: "Piltover" },
    { rules: "[Empower]", rulesSet: "VEN" },
    { sig: "1" },
    { over: "1" },
    { ult: "1" },
    { promo: "1" },
    { printing: "normal" },
    { priced: "1", min: "1", max: "50" },
  ];
  for (const country of ["AU", "US", "UK", "SG", "CA", "EU"] as const) {
    for (const sort of ["price_asc", "price_desc", "name", "popular", "new", "number", undefined]) {
      for (const query of queries) {
        const args = {
          where: buildCardWhere({ ...query, sort }, country),
          orderBy: buildCardOrderBy(sort, country),
          select: cardTileSelect(country),
          skip: 0,
          take: 24,
        };
        assert.doesNotThrow(() => q("Card", "findMany", args as Record<string, unknown>), `${country} ${sort} ${JSON.stringify(query)}`);
        assert.doesNotThrow(() => q("Card", "count", { where: args.where } as Record<string, unknown>));
      }
    }
  }
  const tiles = q("Card", "findMany", { where: buildCardWhere({ q: "jinx" }, "AU"), select: cardTileSelect("AU") }) as { name: string; _count: { retailerPrices: number } }[];
  assert.deepEqual(tiles.map((t) => [t.name, t._count.retailerPrices]), [["Jinx", 2]]);
});

test("every cron route reads Neon first, and so do alert baselines and the auction board", () => {
  const { readdirSync: ls, statSync } = require("node:fs") as typeof import("node:fs");
  const walk = (dir: string): string[] =>
    ls(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : f === "route.ts" ? [p] : [];
    });
  const routes = walk(join(process.cwd(), "src/app/api/cron"));
  assert.ok(routes.length >= 18);
  for (const r of routes) {
    const src = readFileSync(r, "utf8");
    assert.doesNotMatch(src, /^export async function (GET|POST)/m, `${r}: an unwrapped handler`);
    for (const m of src.matchAll(/^export const (GET|POST) = ([^;]+);/gm)) assert.match(m[2], /^liveRoute\(/, `${r}: ${m[1]} is not wrapped in liveRoute`);
  }
  assert.match(readFileSync("src/lib/alert-price.ts", "utf8"), /return withLiveData\(\(\) => computeAlertPricesInner\(\.\.\.args\)\)/);
  assert.match(readFileSync("src/lib/ebay-auctions.ts", "utf8"), /withLiveData\(\(\) => prisma\.ebayAuctionListing/);
});

test("the exporter reads the database, never the files it replaces, and publishing never deploys", () => {
  const exporter = readFileSync("scripts/export-public-data.ts", "utf8");
  assert.match(exporter, /process\.env\.PUBLIC_DATA_MODE = "db";/);
  const publish = readFileSync("scripts/publish-public-data.sh", "utf8");
  assert.match(publish, /refusing to publish public data with a deploy marker/);
  assert.doesNotMatch(publish.replace(/^#.*$/gm, ""), /SUBJECT="[^"]*\[deploy\]/i);
  const wf = readFileSync(".github/workflows/refresh-prices.yml", "utf8");
  assert.match(wf, /- name: Export and publish the public data snapshot[\s\S]*?github\.event\.schedule == '0 7 \* \* \*'/, "morning run only");
});

test("nothing private is in the published snapshot, if one is committed", () => {
  const dir = join(process.cwd(), "data", "public");
  let files: string[] = [];
  try {
    files = ["cards.json", "meta.json"].filter((f) => readdirSync(dir).includes(f));
  } catch {
    return; // no snapshot committed yet
  }
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(raw, /"(email|userId|passwordHash|token|lastViewedAt|ebayCheckedAt)"/, f);
  }
});

test("the snapshot is bundled only when PUBLIC_DATA_MODE will read it", () => {
  const load = (mode: string | undefined) => {
    const saved = process.env.PUBLIC_DATA_MODE;
    if (mode === undefined) delete process.env.PUBLIC_DATA_MODE;
    else process.env.PUBLIC_DATA_MODE = mode;
    try {
      const p = require.resolve(join(process.cwd(), "next.config.js"));
      delete require.cache[p];
      return (require(p) as { experimental: { outputFileTracingIncludes: Record<string, string[]> } }).experimental.outputFileTracingIncludes["/**"];
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_DATA_MODE;
      else process.env.PUBLIC_DATA_MODE = saved;
    }
  };
  assert.deepEqual(load(undefined), ["./data/price-history/**/*.json"]);
  assert.deepEqual(load("db"), ["./data/price-history/**/*.json"]);
  assert.ok(load("files").includes("./data/public/**/*.json"));
  assert.ok(load("fallback").includes("./data/public/**/*.json"));
});
