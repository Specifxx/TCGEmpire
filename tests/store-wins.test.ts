import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_BADGE_WINS,
  addDay,
  cheapestBadgeHtml,
  dayWins,
  emptyMonth,
  lastCompleteMonth,
  monthLabel,
  storeClaim,
  summarise,
  type WinsRow,
} from "../src/lib/store-wins";

// Monthly cheapest-price badges for stores (2026-11-26, DECISIONS.md "Monthly cheapest-price badges for stores").
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const row = (retailer: string, groupKey: string, priceCents: number, over: Partial<WinsRow> = {}): WinsRow => ({
  groupKey,
  title: `${groupKey} title`,
  productType: "Booster Box",
  retailer,
  retailerName: retailer.toUpperCase(),
  priceCents,
  inStock: true,
  country: "US",
  ...over,
});

test("a win needs a contested product: two or more stores in stock in the same market", () => {
  const { stores } = dayWins([
    row("a", "BOX", 10000),
    row("b", "BOX", 9000),
    row("a", "SOLO", 5000), // only store with it: never a win
    row("c", "BOX", 1, { country: "UK" }), // another market and currency: not compared
    row("d", "UK-ONLY", 2000, { country: "UK" }),
  ]);
  assert.deepEqual([...stores.get("b")!.won], ["BOX"]);
  assert.deepEqual([...stores.get("a")!.won], []);
  assert.deepEqual([...stores.get("a")!.contested], ["BOX"]);
  assert.equal(stores.has("c"), false, "a lone UK row is uncontested");
  assert.equal(stores.has("d"), false);
});

test("eBay, TCGplayer, Amazon, reference rows, out-of-stock and zero prices never win or contest", () => {
  const { stores } = dayWins([
    row("ebay_us", "BOX", 100),
    row("tcgplayer", "BOX", 100),
    row("amazon", "BOX", 100),
    row("cardmarket", "BOX", 100, { country: "EU" }),
    row("cheapbutgone", "BOX", 100, { inStock: false }),
    row("free", "BOX", 0),
    row("a", "BOX", 10000),
    row("b", "BOX", 12000),
  ]);
  assert.deepEqual([...stores.keys()].sort(), ["a", "b"]);
  assert.deepEqual([...stores.get("a")!.won], ["BOX"]);
});

test("a tie is a win for each store, and a store's own dearer duplicate never counts against it", () => {
  const { stores } = dayWins([row("a", "BOX", 9000), row("a", "BOX", 9900), row("b", "BOX", 9000), row("c", "BOX", 9500)]);
  assert.deepEqual([...stores.get("a")!.won], ["BOX"]);
  assert.deepEqual([...stores.get("b")!.won], ["BOX"]);
  assert.deepEqual([...stores.get("c")!.won], []);
});

test("days add up, a day is recorded once, and a day from another month is refused", () => {
  let m = emptyMonth("2026-11");
  m = addDay(m, "2026-11-01", [row("a", "BOX", 9000), row("b", "BOX", 9500)]);
  m = addDay(m, "2026-11-02", [row("a", "BOX", 9000), row("b", "BOX", 8500), row("a", "PACK", 500), row("b", "PACK", 600)]);
  const again = addDay(m, "2026-11-02", [row("a", "BOX", 1), row("b", "BOX", 2)]);
  assert.equal(again, m, "re-running a day changes nothing");
  assert.deepEqual(m.days, ["2026-11-01", "2026-11-02"]);
  assert.deepEqual(m.stores.a.wins, { BOX: 1, PACK: 1 });
  assert.deepEqual(m.stores.a.contested, { BOX: 2, PACK: 1 });
  assert.deepEqual(m.stores.b.wins, { BOX: 1 });
  assert.equal(m.products.PACK.title, "PACK title");
  assert.throws(() => addDay(m, "2026-12-01", []), /not in 2026-11/);
});

test("stores rank within their own market by products, then days, and ties share a rank", () => {
  let m = emptyMonth("2026-11");
  m = addDay(m, "2026-11-01", [
    row("a", "X", 1), row("b", "X", 2),
    row("a", "Y", 1), row("b", "Y", 2),
    row("b", "Z", 1), row("c", "Z", 1),
    row("u", "X", 1, { country: "UK" }), row("v", "X", 2, { country: "UK" }),
  ]);
  const s = summarise(m);
  const by = Object.fromEntries(s.map((r) => [r.retailer, r]));
  assert.equal(by.a.products, 2);
  assert.equal(by.a.rankInMarket, 1);
  assert.equal(by.b.rankInMarket, 2);
  assert.equal(by.c.rankInMarket, 2, "b and c are level on products and days");
  assert.equal(by.a.storesInMarket, 3);
  assert.equal(by.u.rankInMarket, 1, "the UK ranks on its own");
  assert.equal(by.v, undefined, "no win, no row");
});

test(`a badge needs ${MIN_BADGE_WINS} or more products`, () => {
  let m = emptyMonth("2026-11");
  const rows = ["P1", "P2", "P3"].flatMap((g) => [row("a", g, 1), row("b", g, 2)]);
  m = addDay(m, "2026-11-01", rows);
  assert.equal(storeClaim(m, "a")?.products, 3);
  assert.equal(storeClaim(m, "b"), null);
  assert.equal(storeClaim(null, "a"), null);
});

test("the badge is one plain link with inline SVG to the store's own page: no script, image, iframe or tracking", () => {
  for (const theme of ["dark", "light"] as const) {
    const html = cheapestBadgeHtml({ slug: "games401", name: `401 "Games" <&>`, month: "2026-11", products: 12, theme });
    assert.match(html, /^<a href="https:\/\/riftcompare\.com\/stores\/games401" /);
    assert.equal(html.match(/<a /g)?.length, 1);
    assert.match(html, /Cheapest price · November 2026/);
    assert.match(html, /on 12 Riftbound products/);
    assert.match(html, /<svg /);
    assert.doesNotMatch(html, /<script|<img|<iframe|src=|url\(|\?|nofollow|class=/);
    assert.doesNotMatch(html, /<&>|"Games"/, "store names are escaped");
    assert.match(html, /&quot;Games&quot; &lt;&amp;&gt;/);
  }
});

test("months: the label, and the last complete month (UTC)", () => {
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.equal(lastCompleteMonth(new Date("2026-12-01T00:30:00Z")), "2026-11");
  assert.equal(lastCompleteMonth(new Date("2026-11-30T23:59:00Z")), "2026-10");
  assert.equal(lastCompleteMonth(new Date("2027-01-15T00:00:00Z")), "2026-12");
});

test("committed month files are well formed and hold store prices only", () => {
  const dir = join(process.cwd(), "data", "store-wins");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(raw, /"(email|userId|token|clicks?|ip)"/i, f);
    const m = JSON.parse(raw);
    assert.equal(`${m.month}.json`, f);
    for (const d of m.days) assert.equal(d.slice(0, 7), m.month, `${f}: ${d}`);
    for (const [k, s] of Object.entries<{ wins: Record<string, number>; contested: Record<string, number> }>(m.stores)) {
      assert.doesNotMatch(k, /^(ebay|tcgplayer|amazon|cardmarket)/, `${f}: ${k}`);
      for (const [g, n] of Object.entries(s.wins)) {
        assert.ok(n <= (s.contested[g] ?? 0), `${f}: ${k} won ${g} more days than it was contested`);
        assert.ok(n <= m.days.length);
      }
    }
  }
});

test("the daily recorder runs from the snapshot before it is published, never fatal, and publishing never deletes a month", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  const at = (s: string) => wf.indexOf(s);
  assert.ok(at("npx tsx scripts/store-wins.ts || true") > at("npx tsx scripts/export-public-data.ts"));
  assert.ok(at("npx tsx scripts/store-wins.ts || true") < at("bash scripts/publish-public-data.sh"));
  const publish = read("scripts/publish-public-data.sh");
  assert.match(publish, /rsync -a "\$WINS\/" "\$WORK\/tree\/\$WINS\/"/);
  assert.doesNotMatch(publish, /rsync[^\n]*--delete[^\n]*\$WINS/);
  assert.match(read("next.config.js"), /"\/stores\/\*\*": \["\.\/data\/store-wins\/\*\*\/\*\.json"\]/);
  const script = read("scripts/store-wins.ts");
  assert.doesNotMatch(script, /prisma|@\/lib\/db|from "\.\.\/src\/lib\/db"/, "files only, never Neon");
});

test("the store page shows last month's record only through the guarded reader", () => {
  const page = read("src/app/stores/[slug]/page.tsx");
  assert.match(page, /const month = badgeMonth\(\);\s*const claim = storeClaim\(month, store\.key\);/);
  assert.match(page, /\{wins && <StoreCheapestBadge /);
});

test("rows pass the sealed pages' own guards and take the product's own name", async () => {
  const { winsRows } = await import("../src/lib/store-wins-rows");
  const base = { title: "Riftbound Radiance Booster Display [PREORDER]", productType: "Booster Box", setCode: "RAD", retailerName: "A", inStock: true };
  const rows = winsRows([
    { ...base, groupKey: "RAD|Booster Box", retailer: "gatorscardden", priceCents: 12999, country: "US" },
    { ...base, groupKey: "RAD|Booster Box", retailer: "wulfgaming", priceCents: 100, country: "US" }, // a $1 box: under the floor
    { ...base, groupKey: "RAD|Vault", productType: "Vault", retailer: "cardsnmo", priceCents: 4999, country: "US" },
  ]);
  assert.deepEqual(rows.map((r) => r.retailer), ["gatorscardden", "cardsnmo"]);
  assert.equal(rows[0].title, "Radiance Booster Box");
  assert.equal(rows[1].groupKey, "RAD|Bundle", "a legacy Vault row joins its Bundle group");
  assert.equal(rows[1].title, "Radiance Vault Bundle");
});
