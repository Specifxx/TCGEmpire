import { test } from "node:test";
import assert from "node:assert/strict";
import { epnItemSales, epnTransactions, impactActions, impactItemSales, impactSkuLines, latestPerSale, type ItemSale } from "../src/lib/earnings/core";
import { parseAmazonEntry } from "../src/lib/earnings/amazon";
import { allItems, itemInRange, itemLabel, sellingReportText, setOf, topClickedOverall, topProducts, topSets, type TopClicks } from "../src/lib/earnings/top-items";

// "What's selling" on the earnings dashboard (owner, 2026-11-25): products and sets
// ranked from the networks' item rows (sales), kept apart from buy clicks.

const today = "2026-11-25";

test("eBay transaction rows carry their item; a sale without one has none", () => {
  const json = {
    Records: [
      { EventDate: "2026-11-20", EpnTransactionId: "1", CustomId: "dex-us-card-ebay", Earnings: "3.10", ItemName: "Pokemon Prismatic Evolutions Elite Trainer Box", ItemId: "1234", Quantity: "2", Sales: "120.00", LeafCategoryName: "CCG Sealed Boxes", Status: "Approved" },
      { EventDate: "2026-11-21", EpnTransactionId: "2", CustomId: "", Earnings: "1.00", Status: "Pending" },
      { EventDate: "2026-07-01", EpnTransactionId: "3", CustomId: "op-us-x", Earnings: "1.00", ItemName: "Old sale" },
    ],
  };
  const items = epnItemSales(latestPerSale(epnTransactions(json, "AUD")), today);
  assert.equal(items.length, 1, "the unnamed sale and the one older than 90 days are left out");
  assert.deepEqual(items[0], {
    network: "ebay",
    day: "2026-11-20",
    tag: "dex-us-card-ebay",
    name: "Pokemon Prismatic Evolutions Elite Trainer Box",
    itemId: "1234",
    category: "CCG Sealed Boxes",
    qty: 2,
    saleCents: 12000,
    cents: 310,
    currency: "AUD",
    orders: 1,
  });
});

test("Impact SKU lines take their action's tag and a share of its payout; reversed orders drop", () => {
  const actions = impactActions({
    Actions: [
      { Id: "A1", EventDate: "2026-11-22T10:00:00Z", State: "PENDING", Currency: "USD", Payout: "10.00", Amount: "300.00", SharedId: "mtg-us-quickview-table" },
      { Id: "A2", EventDate: "2026-11-22T10:00:00Z", State: "REVERSED", Currency: "USD", Payout: "0", Amount: "50.00", SharedId: "mtg-us-x" },
    ],
  });
  const lines = impactSkuLines({
    Records: [
      { "Action Id": "A1", Sku: "555", "Item Name": "Foundations Play Booster Box", Quantity: "1", "Sale Amount": "200.00" },
      { "Action Id": "A1", Sku: "556", "Item Name": "Foundations Collector Booster Box", Quantity: "1", "Sale Amount": "100.00" },
      { "Action Id": "A2", Sku: "557", "Item Name": "Returned", Quantity: "1", "Sale Amount": "50.00" },
    ],
  });
  const items = impactItemSales(lines, actions, today);
  assert.equal(items.length, 2);
  assert.equal(items[0].tag, "mtg-us-quickview-table");
  assert.equal(items[0].cents, 667);
  assert.equal(items[1].cents, 333);
  assert.equal(items[0].saleCents + items[1].saleCents, 30000);
  assert.equal(items[0].currency, "USD");
});

test("Amazon item lines parse and are never counted as days or ids", () => {
  const [e] = parseAmazonEntry("store: us\nrange: 2026-10-26 to 2026-11-24\nday 2026-11-24 5.00 2\nitem 3.20 2 asin:B0ABCDEFGH Pokemon 151 Booster Bundle\nitem 1.80 1 One Piece OP-09 Booster Box");
  assert.equal(e.days.length, 1);
  assert.equal(e.ids.length, 0);
  assert.deepEqual(e.products, [
    { name: "Pokemon 151 Booster Bundle", asin: "B0ABCDEFGH", cents: 320, items: 2 },
    { name: "One Piece OP-09 Booster Box", cents: 180, items: 1 },
  ]);
  const items = allItems([], [{ store: "us", currency: "USD", from: e.from, to: e.to, products: e.products! }]);
  assert.equal(items.length, 2);
  assert.ok(itemInRange(items[0], "30d", today), "a 30-day Amazon range shows in the 30-day view");
  assert.ok(!itemInRange(items[0], "7d", today), "but not in the 7-day one");
});

test("sets are product names without their product words", () => {
  assert.equal(setOf("Pokemon TCG Prismatic Evolutions Elite Trainer Box"), "pokemon prismatic evolutions");
  assert.equal(setOf("Pokémon 151 Booster Bundle (6 packs) - Brand New Sealed"), "pokemon 151");
  assert.equal(setOf("Booster Box"), "");
});

const row = (name: string, day: string, cents: number, tag = "dex-us-x"): ItemSale => ({ network: "ebay", day, tag, name, qty: 1, saleCents: 0, cents, currency: "AUD", orders: 1 });

test("products rank by orders, fold one name's spellings, and keep to the range", () => {
  const items = [row("Prismatic Evolutions ETB", "2026-11-24", 100), row("prismatic evolutions  ETB!", "2026-11-23", 100, "oc-us-y"), row("Surging Sparks Booster Box", "2026-11-24", 900), row("Old thing", "2026-09-01", 5000)];
  const top = topProducts(items, "30d", today, "AUD");
  assert.equal(top[0].name, "Prismatic Evolutions ETB");
  assert.equal(top[0].orders, 2);
  assert.deepEqual(top[0].sites.length, 2);
  assert.equal(top.length, 2);
  const sets = topSets(items, "30d", today, "AUD");
  assert.equal(sets[0].name, "Prismatic Evolutions");
});

test("clicks stay clicks: the views fallback never joins the click ranking, and the report labels both", () => {
  const clicks: TopClicks = {
    fetchedAt: 0,
    sites: [
      { site: "dex", label: "DexCompare", status: "ok", kind: "clicks", items: [{ key: "surging-sparks-booster-box", d28: 40, d7: 9 }] },
      { site: "figure", label: "FigureCompare", status: "ok", kind: "views", items: [{ key: "/figure/x", d28: 900, d7: 100 }] },
    ],
  };
  const overall = topClickedOverall(clicks);
  assert.equal(overall.length, 1);
  assert.equal(itemLabel("/sealed/origins-booster-box"), "Origins Booster Box");
  const text = sellingReportText([row("Surging Sparks Booster Box", "2026-11-24", 900)], clicks, today);
  assert.match(text, /SALES/);
  assert.match(text, /BUY CLICKS, NOT SALES/);
  assert.match(text, /Surging Sparks Booster Box/);
});
