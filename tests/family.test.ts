// RiftCompare's family feed (lib/family.ts, DECISIONS.md "Sites that grow each other").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { familyItemsFromRows, type SealedRow } from "../src/lib/family";
import { buildFeed, validFeed } from "../src/lib/family-network";

const row = (o: Partial<SealedRow>): SealedRow => ({
  groupKey: "ogn-box",
  title: "Origins Booster Box",
  productType: "Booster Box",
  setCode: "OGN",
  retailer: "a",
  retailerName: "Store A",
  priceCents: 10000,
  imageUrl: null,
  inStock: true,
  country: "US",
  ...o,
});

test("deals: stores only, 3+ stores, at least 10% under their median; eBay and TCGplayer never count", () => {
  const rows = [
    row({ retailer: "a", priceCents: 8000 }),
    row({ retailer: "b", priceCents: 10000 }),
    row({ retailer: "c", priceCents: 11000 }),
    row({ retailer: "ebay_us", priceCents: 5000 }),
    row({ retailer: "tcgplayer_market", priceCents: 6000 }),
    row({ retailer: "d", priceCents: 1, inStock: false }),
  ];
  const items = familyItemsFromRows(rows, "2026-11-02");
  assert.equal(items.length, 1);
  assert.equal(items[0].cents, 8000);
  assert.equal(items[0].refCents, 10000);
  assert.equal(items[0].store, "Store A");
  assert.match(items[0].title, /^Riftbound Origins Booster Box$/);
  assert.ok(validFeed(buildFeed("rift", items, {}), "rift"));
  assert.equal(familyItemsFromRows(rows.slice(1, 3), "2026-11-02").length, 0, "two stores is no deal");
});

test("pre-orders: the next set's booster box, cheapest in-stock store, with its release date", () => {
  const items = familyItemsFromRows([row({ setCode: "LGC", groupKey: "lgc-box", priceCents: 15999 }), row({ setCode: "LGC", groupKey: "lgc-pack", productType: "Booster Pack", priceCents: 599 })], "2026-11-02");
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "preorder");
  assert.equal(items[0].releaseDate, "2027-01-29");
  assert.equal(items[0].url, "https://riftcompare.com/legacy-preorders");
});

test("the block sits on the deals, pre-order and set pages, and the report links every card sister", () => {
  for (const p of ["src/components/HolidaySalePage.tsx", "src/app/legacy-preorders/page.tsx", "src/app/radiance-preorders/page.tsx", "src/app/sets/[set]/page.tsx"]) {
    assert.equal((readFileSync(p, "utf8").match(/<FamilyDeals /g) ?? []).length, 1, `${p}: one block`);
  }
  const report = readFileSync("src/app/market/report/page.tsx", "utf8");
  assert.match(report, /getFamilyFeeds\("1d"\)/, "the report is held a day: its family read must be too");
  assert.match(report, /clusterSisters\("rift", "cards"\)/);
});
