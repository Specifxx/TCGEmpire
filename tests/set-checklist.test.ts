import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foldStoreRows, readSetChecklist } from "../src/lib/set-checklist";
import { ownedBySet, OWNED_TAKE, type OwnedDb } from "../src/lib/set-owned";
import { ALL_FALLBACK_RETAILERS } from "../src/lib/constants";
import { summarise } from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// The set checklist loader (2026-09-29, DECISIONS.md, "Set tracker"): one lean
// groupBy over REAL-STORE RetailerPrice rows, never Card.lowestPriceCents*
// (stores + eBay), and the account's owned map scoped to one user and one set.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

type CardRow = Record<string, unknown>;
const cardRow = (id: string, extra: CardRow = {}): CardRow => ({
  id, slug: id, name: `Card ${id}`, collectorNumber: `${id.replace(/\D/g, "").padStart(3, "0")}/298`, rarity: "Common",
  variant: null, isPromo: false, isOvernumbered: false, setCode: "OGN", lowestPriceCentsUs: null, ...extra,
});

function stub(cards: CardRow[], groups: { cardId: string; retailer: string; min: number | null }[]) {
  const calls = { card: [] as any[], group: [] as any[] };
  const db = {
    card: { findMany: async (a: any) => (calls.card.push(a), cards) },
    retailerPrice: {
      groupBy: async (a: any) => (calls.group.push(a), groups.map((g) => ({ cardId: g.cardId, retailer: g.retailer, _min: { priceCents: g.min } }))),
    },
  };
  return { db: db as never, calls };
}

test("min price and distinct store count per card come from the store rows, not from the card's price column", async () => {
  // The column says 100 (an eBay listing feeds it); the real stores say 500 and 650.
  const { db } = stub(
    [cardRow("c1", { lowestPriceCentsUs: 100 })],
    [{ cardId: "c1", retailer: "ozzie", min: 650 }, { cardId: "c1", retailer: "cherry", min: 500 }],
  );
  const [c] = await readSetChecklist("OGN", "US", db);
  assert.equal(c.minCents, 500, "the cheapest STORE listing, not the column");
  assert.equal(c.stores, 2);
  assert.equal(c.otherSource, false);
});

test("an eBay-only card is 'other source', has no price, and is counted in neither total", async () => {
  const { db } = stub(
    [cardRow("c1", { lowestPriceCentsUs: 320 }), cardRow("c2"), cardRow("c3", { lowestPriceCentsUs: 900 })],
    [{ cardId: "c3", retailer: "cherry", min: 900 }],
  );
  const cards = await readSetChecklist("OGN", "US", db);
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.deepEqual([by.c1.minCents, by.c1.otherSource], [null, true], "the column has a price but no store does: eBay only");
  assert.deepEqual([by.c2.minCents, by.c2.otherSource], [null, false], "nothing anywhere: not in stock");
  assert.deepEqual([by.c3.minCents, by.c3.otherSource], [900, false]);
  const s = summarise(cards, {}, "base");
  assert.deepEqual([s.priced, s.costCents, s.notInStock, s.otherOnly], [1, 900, 1, 1]);
});

test("the read is ONE lean groupBy over real stores, in stock, in the market, scoped to the set's card ids", async () => {
  const { db, calls } = stub([cardRow("c1"), cardRow("c2")], []);
  await readSetChecklist("OGN", "AU", db);
  assert.equal(calls.group.length, 1, "one groupBy, not one query per card");
  assert.equal(calls.card.length, 1);
  const g = calls.group[0];
  assert.deepEqual(g.by, ["cardId", "retailer"]);
  assert.deepEqual(g.where.cardId, { in: ["c1", "c2"] });
  assert.equal(g.where.country, "AU");
  assert.equal(g.where.inStock, true);
  assert.deepEqual(g.where.priceCents, { gt: 0 });
  assert.deepEqual(g.where.retailer, { notIn: [...ALL_FALLBACK_RETAILERS] }, "no converted reference rows");
  assert.deepEqual(g.where.NOT, { retailer: { startsWith: "ebay" } }, "no eBay key, ebay_us and ebay_ca included");
  assert.deepEqual(g.where.OR, [{ derived: null }, { derived: false }], "no derived (cloned) rows");
  assert.deepEqual(g._min, { priceCents: true });
  // Narrow, capped card read, scoped to one set; no include.
  const c = calls.card[0];
  assert.deepEqual(c.where, { setCode: "OGN" });
  assert.equal(typeof c.take, "number");
  assert.equal(c.include, undefined);
  assert.ok(Object.keys(c.select).length <= 12, "a narrow select");
  assert.equal(c.select.lowestPriceCentsAu, undefined);
  assert.equal(c.select.lowestPriceCents, true, "the AU market's own column, only to tell eBay-only from not in stock");
});

test("an empty set makes no price query at all", async () => {
  const { db, calls } = stub([], []);
  assert.deepEqual(await readSetChecklist("VEN", "US", db), []);
  assert.equal(calls.group.length, 0);
});

test("foldStoreRows ignores null and non-positive minimums and takes the cheapest store", () => {
  const m = foldStoreRows([
    { cardId: "a", retailer: "x", _min: { priceCents: 300 } },
    { cardId: "a", retailer: "y", _min: { priceCents: 200 } },
    { cardId: "a", retailer: "z", _min: { priceCents: null } },
    { cardId: "b", retailer: "x", _min: { priceCents: 0 } },
  ]);
  assert.deepEqual(m.get("a"), { minCents: 200, stores: 2 });
  assert.equal(m.has("b"), false);
});

// ── The cache: its own key, tag and TTL, and no nesting ─────────────────────

test("its own unstable_cache entry: key [set-checklist, code, country], 3600s, CONTENT_TAG, no self-cached loader inside", () => {
  const src = read("src/lib/set-checklist.ts");
  const c = code("src/lib/set-checklist.ts");
  assert.match(c, /unstable_cache\(\(\) => readSetChecklist\(setCode, country\), \[SET_CHECKLIST_KEY, setCode, country\]/);
  assert.match(c, /SET_CHECKLIST_KEY = "set-checklist"/);
  assert.match(c, /revalidate: 3600/);
  assert.match(c, /tags: \[CONTENT_TAG\]/);
  // Not the set page's entry, not a wrap of it, and not the price-guide read.
  assert.doesNotMatch(c, /set-narrative-guide|set-default|storeCountsByCountry|getSetRevealCount/);
  // The callback (readSetChecklist) calls no cached loader and reads no lowestPriceCents sum.
  const body = c.slice(c.indexOf("export async function readSetChecklist"), c.indexOf("export async function getSetChecklist"));
  assert.doesNotMatch(body, /unstable_cache|cachedOrDirect|get[A-Z]\w+\(/);
  assert.doesNotMatch(body, /_sum|\.aggregate\(|lowestPriceCents\w*\s*\+/);
  assert.match(src, /AND NOT Card\.lowestPriceCents/, "the reason is written where the query is");
});

test("the pages call the loader directly, never inside another cache", () => {
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    const c = code(f);
    assert.match(c, /await getSetChecklist\(|getSetChecklist\(set\.code, country\)/, f);
    assert.doesNotMatch(c, /unstable_cache/, f);
  }
  const nested = read("tests/nested-cache.test.ts");
  assert.match(nested, /"getSetChecklist"/, "registered as a self-cached loader");
});

// ── Owned: one user, one set, one groupBy ───────────────────────────────────

test("the owned read is one groupBy scoped by userId and the set, capped, and sums across finish and condition", async () => {
  const seen: any[] = [];
  const db: OwnedDb = {
    collectionCard: {
      groupBy: async (a: any) => (seen.push(a), [
        { cardId: "c1", _sum: { quantity: 3 } },
        { cardId: "c2", _sum: { quantity: 1 } },
        { cardId: "c3", _sum: { quantity: null } },
        { cardId: "c4", _sum: { quantity: 0 } },
      ]),
    },
  };
  const owned = await ownedBySet(db, "user-1", "OGN");
  assert.deepEqual(owned, { c1: 3, c2: 1 }, "copies of a card across finishes and conditions are one number; zero is not owned");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].where, { userId: "user-1", card: { setCode: "OGN" } });
  assert.deepEqual(seen[0].by, ["cardId"]);
  assert.equal(seen[0].take, OWNED_TAKE);
  assert.ok(OWNED_TAKE <= 1500);
  await ownedBySet(db, "user-1", ["OGN", "SFD"]);
  assert.deepEqual(seen[1].where, { userId: "user-1", card: { setCode: { in: ["OGN", "SFD"] } } });
});

test("GET /api/collection/owned is authenticated, validates the set, and answers no-store from the caller's own rows", () => {
  const c = code("src/app/api/collection/owned/route.ts");
  assert.match(c, /getCurrentUser\(\)/);
  assert.match(c, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in" \}, \{ status: 401/);
  assert.match(c, /setByCode\(code\)/, "an unknown set is a 400, not a query");
  assert.match(c, /ownedBySet\(prisma, user\.id, code\)/, "only the caller's id is ever queried");
  assert.doesNotMatch(c, /searchParams\.get\("(user|userId|email)"\)/, "no caller-supplied identity");
  assert.match(c, /"Cache-Control": "private, no-store"/);
  assert.match(c, /export const dynamic = "force-dynamic"/);
});
