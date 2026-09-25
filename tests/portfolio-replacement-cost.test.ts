import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { optimizeBasket, type BasketCard } from "../src/lib/basket";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// "Replacement cost, delivered" on /portfolio — from inbox feedback cmu24pck9
// (2026-09-15): the headline collection value prices every card at the cheapest
// in-stock ITEM price in the market, so a card whose only cheap copy sits at one
// far-off store is counted at a price nobody can actually pay. Postage never
// appears anywhere on the page.
//
// The fix answers the second question rather than corrupting the first. What
// this file pins:
//   • the headline stays an item price — postage is NOT folded into it;
//   • postage is charged the way stores charge it (once per order, free over a
//     threshold), which is why this reuses the Best-Basket optimiser instead of
//     adding a shipping fee per card;
//   • the heavy listing read stays behind a button and stays scoped, because
//     RetailerPrice is the standing suspect in the transfer burn.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE = "src/app/api/portfolio/replacement/route.ts";
const PANEL = "src/components/PortfolioReplacementCost.tsx";
// The binder and listing reads, shared with /api/basket since 2026-09-25.
const READS = "src/lib/basket-server.ts";

test("postage is charged once per store, not once per card — the whole reason this reuses the optimiser", () => {
  // Two cards, each cheapest at a DIFFERENT store, both stores charging $12
  // postage. Buying each from its own cheapest shop is two lots of postage;
  // consolidating onto one store pays a little more per card and one postage.
  const stores = {
    a: { name: "Store A", ship: { shippingFlatCents: 1200, freeOverCents: 0 } },
    b: { name: "Store B", ship: { shippingFlatCents: 1200, freeOverCents: 0 } },
  };
  const cards: BasketCard[] = [
    {
      cardId: "one", name: "One", slug: null, qty: 1,
      listings: [
        { retailer: "a", retailerName: "Store A", priceCents: 1000, url: "u" },
        { retailer: "b", retailerName: "Store B", priceCents: 1100, url: "u" },
      ],
    },
    {
      cardId: "two", name: "Two", slug: null, qty: 1,
      listings: [
        { retailer: "a", retailerName: "Store A", priceCents: 1100, url: "u" },
        { retailer: "b", retailerName: "Store B", priceCents: 1000, url: "u" },
      ],
    },
  ];

  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.itemsCents + plan.shippingCents, plan.totalCents, "the parts must add up to the total");
  // The portfolio's own reading of these two cards is $20.00 — the sum of the
  // cheapest item prices, postage nowhere in it. That is the gap this panel
  // exists to show.
  assert.ok(plan.totalCents > 2000, "a delivered total must exceed the sum of the cheapest item prices");
  // One store, so postage is paid once rather than once per card.
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.shippingCents, 1200);
  assert.equal(plan.totalCents, 3300); // 10 + 11 + 12
  // …against two separate orders if you chased each cheapest listing.
  assert.equal(plan.naiveStoreCount, 2);
  assert.equal(plan.naiveTotalCents, 4400); // 10 + 12 + 10 + 12
  assert.equal(plan.savedCents, 1100);
});

test("a free-shipping threshold is honoured when a single move can reach it", () => {
  const stores = {
    a: { name: "Store A", ship: { shippingFlatCents: 1500, freeOverCents: 0 } },
    b: { name: "Store B", ship: { shippingFlatCents: 900, freeOverCents: 2000 } },
  };
  const plan = optimizeBasket(
    [
      {
        cardId: "one", name: "One", slug: null, qty: 1,
        listings: [
          { retailer: "a", retailerName: "Store A", priceCents: 1000, url: "u" },
          { retailer: "b", retailerName: "Store B", priceCents: 1050, url: "u" },
        ],
      },
      {
        cardId: "two", name: "Two", slug: null, qty: 1,
        listings: [{ retailer: "b", retailerName: "Store B", priceCents: 1050, url: "u" }],
      },
    ],
    stores
  );
  // Both on B: $21.00, over the $20 threshold, delivery free.
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.shippingCents, 0);
  assert.equal(plan.totalCents, 2100);
  assert.equal(plan.stores[0].freeShipping, true);
});

test("a card no tracked store stocks is left out of the total rather than guessed at", () => {
  const stores = { a: { name: "Store A", ship: { shippingFlatCents: 500, freeOverCents: 0 } } };
  const plan = optimizeBasket(
    [
      { cardId: "have", name: "Have", slug: null, qty: 1, listings: [{ retailer: "a", retailerName: "Store A", priceCents: 700, url: "u" }] },
      { cardId: "gone", name: "Gone", slug: null, qty: 2, listings: [] },
    ],
    stores
  );
  assert.equal(plan.itemsCents, 700);
  assert.deepEqual(plan.unbuyable, [{ name: "Gone", qty: 2 }]);
  assert.equal(plan.matchedCards, 1);
});

test("the headline collection value is untouched — no postage is folded into getPortfolio", () => {
  const premium = readCode("src/lib/premium.ts");
  const portfolio = premium.slice(premium.indexOf("export async function getPortfolio"));
  assert.doesNotMatch(portfolio, /shipping/i, "collection VALUE must stay an item price; replacement COST is the other number");
  // The page still labels it as such, so the two can't be read as the same thing.
  assert.match(read("src/app/portfolio/page.tsx"), /Collection value · \{info\.code\} market/);
});

test("the heavy listing read runs on demand, never on every portfolio render", () => {
  const panel = readCode(PANEL);
  assert.match(panel, /fetch\("\/api\/portfolio\/replacement"\)/, "the panel must call the route itself");
  assert.doesNotMatch(panel, /useEffect/, "no fetch-on-mount — this must cost nothing until someone asks for it");
  assert.match(panel, /onClick=\{run\}/, "it is a button");
  // The page renders the panel; it must NOT compute the plan server-side.
  const page = readCode("src/app/portfolio/page.tsx");
  assert.match(page, /<PortfolioReplacementCost currency=\{info\.currency\} \/>/);
  assert.doesNotMatch(page, /optimizeBasket/, "the page render must not run the optimiser");
});

test("the RetailerPrice query obeys the egress rules at the top of lib/db.ts", () => {
  const reads = readCode(READS);
  const q = reads.slice(reads.indexOf("prisma.retailerPrice"), reads.indexOf("const best = new Map"));
  assert.match(q, /cardId:\s*\{\s*in:\s*cardIds\s*\}/, "scoped to this user's cards, never the whole table");
  assert.match(q, /country/, "one market only");
  assert.match(q, /inStock:\s*true/);
  assert.match(q, /retailer:\s*\{\s*in:\s*allowed\s*\}/, "only stores serving this market");
  assert.match(q, /select:\s*\{/, "explicit select — rule 3");
  assert.doesNotMatch(q, /retailerName/, "store names come from RETAILERS, not the column");
  // The card-id list itself is capped, which is what bounds this query.
  assert.match(reads, /export const MAX_HOLDINGS = \d+/);
  assert.match(reads, /ranked\.slice\(0, MAX_HOLDINGS\)/);
  for (const f of [ROUTE, READS]) assert.doesNotMatch(readCode(f), /unstable_cache/, `${f}: a per-user answer must not go in a shared cache`);
  // A failed read is an error, never an empty "nothing in stock" plan.
  assert.doesNotMatch(reads, /\.catch\(\(\) => \[\]\)/);
  assert.match(readCode(ROUTE), /status: 503/);
});

test("the route is rate-limited per user", () => {
  assert.match(readCode(ROUTE), /rateLimit\(`replacement:\$\{user\.id\}`/);
});

test("the total is free; the store-by-store plan is Premium", () => {
  const route = readCode(ROUTE);
  assert.match(route, /const full = isPremium\(user, "premium"\)/);
  assert.match(route, /\.\.\.basketPreview\(plan\)/, "everyone gets the aggregate");
  assert.match(route, /\.\.\.\(full \? \{ plan \} : \{\}\)/, "only Premium gets the plan itself");
  const panel = readCode(PANEL);
  // Premium's panel links on to the plan in Best Basket…
  const premiumBranch = panel.slice(panel.indexOf("{plan ? ("), panel.indexOf(") : (", panel.indexOf("{plan ? (")));
  assert.match(premiumBranch, /href="\/tools\/best-basket\?source=binder"/, "Premium opens the plan in Best Basket");
  // …everyone else gets the Premium button, never a link promising a plan
  // Best Basket won't show them (QA, 2026-09-25: it led Plus members to a wall).
  const otherBranch = panel.slice(panel.indexOf(") : (", panel.indexOf("{plan ? (")));
  assert.match(otherBranch.slice(0, 600), /<PremiumButton surface="gate:replacement-plan"/);
  assert.doesNotMatch(otherBranch.slice(0, 600), /tier="plus"/, "the replacement plan is a Premium wall: default tier");
  assert.doesNotMatch(otherBranch.slice(0, 600), /\/tools\/best-basket/, "no Best Basket link for a viewer without the plan");
});

test("a capped run prices the dearest holdings and says so, instead of silently pricing some of them", () => {
  const reads = readCode(READS);
  assert.match(reads, /sort\(\(a, b\) => b\.valueCents - a\.valueCents\)/, "rank by value before capping");
  assert.match(readCode(ROUTE), /skippedHoldings/, "the response must report what it left out");
  assert.match(readCode(PANEL), /result\.skippedHoldings > 0/, "and the panel must surface it");
});

test("the comparison is like-for-like: the same cards, valued both ways", () => {
  const route = readCode(ROUTE);
  // valuedCents covers exactly the holdings that were priced, not the whole
  // portfolio — otherwise the cap and the unbuyable rows get charged to postage.
  assert.match(route, /valuedCents: wanted\.reduce/);
  assert.match(readCode(PANEL), /result\.totalCents - result\.valuedCents/);
});

test("the gate matches the rest of the page, so this panel can't lock while its neighbours are open", () => {
  assert.match(readCode(ROUTE), /!isPremium\(user\) && !PORTFOLIO_FREE/);
  assert.match(readCode("src/app/portfolio/page.tsx"), /\{pro && <PortfolioReplacementCost/);
});

test("the honest caveats are stated, not buried", () => {
  const panel = read(PANEL);
  assert.match(panel, /eBay/, "eBay's per-listing postage isn't comparable and the panel must say it is excluded");
  assert.match(panel, /not what your cards are worth/, "replacement cost must not be presented as market value");
  assert.match(panel, /It can land lower/, "the gap is signed both ways, so the copy must not claim cost always exceeds value");
  assert.match(panel, /condition/i, "a played copy is replaced at the shop's price, not at its condition multiplier");
  assert.match(panel, /how-much-is-your-riftbound-collection-worth/, "link the guide that separates the three values");
});
