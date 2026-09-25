import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { basketPreview, optimizeBasket, planBasket, type BasketCard, type BasketStores } from "../src/lib/basket";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Best Basket, rebuilt 2026-09-25. The optimiser tests are BEHAVIOURAL: they
// replace the regex-on-source tests that pinned the old greedy + single-card
// hill-climb (and its UI wiring), which is what let three wrong answers ship:
// $14.00 for a list one store sells for $9.40, six orders where one was
// cheaper, and $400 for a list one store sells for $105.
// ─────────────────────────────────────────────────────────────────────────────

const L = (retailer: string, priceCents: number, condition: string | null = null) => ({
  retailer,
  priceCents,
  url: `https://${retailer}.example/p`,
  condition,
});
const card = (id: string, qty: number, listings: ReturnType<typeof L>[]): BasketCard => ({ cardId: id, name: id, slug: null, qty, listings });
const flat = (shippingFlatCents: number, freeOverCents = 0) => ({ shippingFlatCents, freeOverCents });

test("consolidates two cards off a store: 4 cards / 2 stores costs $9.40 from one store, not $14.00 from two", () => {
  // The old hill-climb moved one card at a time, so it could never empty a
  // store holding two — it returned the naive $14.00 split with no "save" box.
  const stores: BasketStores = { a: { name: "A", ship: flat(500) }, b: { name: "B", ship: flat(500) } };
  const cards = [
    card("1", 1, [L("a", 100), L("b", 120)]),
    card("2", 1, [L("a", 100), L("b", 120)]),
    card("3", 1, [L("a", 120), L("b", 100)]),
    card("4", 1, [L("a", 120), L("b", 100)]),
  ];
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 940);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.naiveTotalCents, 1400);
  assert.equal(plan.naiveStoreCount, 2);
  assert.equal(plan.savedCents, 460);
  assert.equal(alternatives.singleStore?.totalCents, 940);
  assert.equal(alternatives.twoStores?.storeCount, 2, "the two-store alternative really uses two stores");
  assert.equal(alternatives.twoStores?.totalCents, 1400);
});

// Twelve cards over six small stores ($1.50 flat postage), plus one hub store
// stocking all twelve at +3% ($3.95, free over $50). From the 2026-09-25 audit.
function hubCase(smallFreeOver: number) {
  const stores: BasketStores = { hub: { name: "Hub", ship: flat(395, 5000) } };
  for (let s = 0; s < 6; s++) stores["s" + s] = { name: "S" + s, ship: flat(150, smallFreeOver) };
  const base = [450, 300, 800, 120, 220, 650, 90, 400, 250, 180, 700, 330];
  const cards = base.map((p, i) => card(String(i), 1 + (i % 3), [L("s" + (i % 6), p), L("hub", Math.round(p * 1.03))]));
  const hubTotal = base.reduce((s, p, i) => s + Math.round(p * 1.03) * (1 + (i % 3)), 0);
  return { stores, cards, hubTotal };
}

test("a hub store that stocks the whole list gives ONE order, not six", () => {
  const { stores, cards, hubTotal } = hubCase(0);
  assert.ok(hubTotal >= 5000, "the hub order clears its free-postage threshold");
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(plan.naiveStoreCount, 6, "buying each card's cheapest copy takes six orders");
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.stores[0].key, "hub");
  assert.equal(plan.totalCents, hubTotal, "one free-postage order from the hub");
  assert.ok(plan.savedCents > 0 && plan.totalCents < plan.naiveTotalCents);
  assert.equal(alternatives.singleStore?.totalCents, hubTotal);
  assert.equal(plan.stores[0].freeShipping, true);
});

test("the audit's own hub list: never six orders, never dearer than the one-store order", () => {
  // With the small stores' $30 free-postage threshold, one small store's pair
  // of cards clears it too — so hub + that store (both post-free) beats the
  // hub alone. The old answer was six orders for $109.20.
  const { stores, cards, hubTotal } = hubCase(3000);
  const { plan, alternatives } = planBasket(cards, stores);
  assert.equal(alternatives.singleStore?.totalCents, hubTotal);
  assert.ok(plan.totalCents <= hubTotal);
  assert.ok(plan.storeCount <= 2, `expected at most two orders, got ${plan.storeCount}`);
  assert.equal(plan.shippingCents, 0, "both orders clear their thresholds");
  assert.ok(plan.totalCents < 10920 && plan.naiveTotalCents === 10920);
});

test("100-store fan-out: every card 1c cheaper at its own store still buys from the one hub, $105 not $400", () => {
  const stores: BasketStores = { h: { name: "H", ship: flat(300) } };
  const cards: BasketCard[] = [];
  for (let i = 0; i < 100; i++) {
    stores["s" + i] = { name: "S" + i, ship: flat(300) };
    cards.push(card(String(i), 1, [L("s" + i, 100), L("h", 102)]));
  }
  const t0 = Date.now();
  const { plan } = planBasket(cards, stores);
  assert.equal(plan.totalCents, 10500);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.naiveTotalCents, 40000);
  assert.ok(Date.now() - t0 < 2000, "pure CPU and quick");
});

test("postage is charged once per store, and the parts add up", () => {
  const stores: BasketStores = { a: { name: "A", ship: flat(1200) }, b: { name: "B", ship: flat(1200) } };
  const plan = optimizeBasket([card("one", 1, [L("a", 1000), L("b", 1100)]), card("two", 1, [L("a", 1100), L("b", 1000)])], stores);
  assert.equal(plan.itemsCents + plan.shippingCents, plan.totalCents);
  assert.equal(plan.totalCents, 3300);
  assert.equal(plan.stores.reduce((s, g) => s + g.subtotalCents + g.shippingCents, 0), plan.totalCents);
});

test("free-shipping thresholds are crossed when it pays, and reported per store", () => {
  // Case from the audit: reachable only by moving two cards at once.
  const stores: BasketStores = { a: { name: "A", ship: flat(395, 5000) }, b: { name: "B", ship: flat(395, 5000) } };
  const cards = [
    card("1", 1, [L("a", 2000), L("b", 2050)]),
    card("2", 1, [L("a", 2000), L("b", 2050)]),
    card("3", 1, [L("a", 1050), L("b", 1000)]),
    card("4", 1, [L("a", 1050), L("b", 1000)]),
  ];
  const plan = optimizeBasket(cards, stores);
  assert.equal(plan.totalCents, 6100);
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.stores[0].freeShipping, true);
  assert.equal(plan.stores[0].freeOverCents, 5000, "the threshold travels with the plan, for the page");
  assert.equal(plan.stores[0].shippingFlatCents, 395);
});

test("the plan is never dearer than the naive split or either alternative — and optimal on small lists", () => {
  // Brute force over every assignment on small random lists (seeded, so the
  // run is repeatable). The search found the optimum every time on 3,000 of
  // these when it was built; 300 keep the suite quick.
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 300; trial++) {
    const m = 2 + Math.floor(rnd() * 4);
    const n = 1 + Math.floor(rnd() * 6);
    const stores: BasketStores = {};
    for (let s = 0; s < m; s++) stores["s" + s] = { name: "S" + s, ship: flat(Math.floor(rnd() * 800), rnd() < 0.5 ? 0 : 500 + Math.floor(rnd() * 3000)) };
    const cards: BasketCard[] = [];
    for (let i = 0; i < n; i++) {
      let ls = Object.keys(stores)
        .filter(() => rnd() < 0.7)
        .map((k) => L(k, 50 + Math.floor(rnd() * 1500)));
      if (!ls.length) ls = [L("s0", 300)];
      cards.push(card("c" + i, 1 + Math.floor(rnd() * 3), ls));
    }
    let best = Infinity;
    const rec = (i: number, assign: string[]) => {
      if (i === n) {
        const sub: Record<string, number> = {};
        let items = 0;
        assign.forEach((k, j) => {
          const p = cards[j].listings.find((l) => l.retailer === k)!.priceCents * cards[j].qty;
          items += p;
          sub[k] = (sub[k] ?? 0) + p;
        });
        let ship = 0;
        for (const [k, v] of Object.entries(sub)) {
          const st = stores[k].ship;
          if (!(st.freeOverCents > 0 && v >= st.freeOverCents)) ship += st.shippingFlatCents;
        }
        best = Math.min(best, items + ship);
        return;
      }
      for (const l of cards[i].listings) rec(i + 1, [...assign, l.retailer]);
    };
    rec(0, []);
    const { plan, alternatives } = planBasket(cards, stores);
    assert.equal(plan.totalCents, best, `trial ${trial}: expected the optimum`);
    assert.ok(plan.totalCents <= plan.naiveTotalCents);
    if (alternatives.singleStore) assert.ok(plan.totalCents <= alternatives.singleStore.totalCents);
    if (alternatives.twoStores) {
      assert.ok(plan.totalCents <= alternatives.twoStores.totalCents);
      assert.equal(alternatives.twoStores.storeCount, 2);
    }
  }
});

test("alternatives are null when no single store / no pair stocks the whole list", () => {
  const stores: BasketStores = { a: { name: "A", ship: flat(100) }, b: { name: "B", ship: flat(100) }, c: { name: "C", ship: flat(100) } };
  const { alternatives } = planBasket([card("1", 1, [L("a", 100)]), card("2", 1, [L("b", 100)]), card("3", 1, [L("c", 100)])], stores);
  assert.equal(alternatives.singleStore, null);
  assert.equal(alternatives.twoStores, null);
});

test("a card no tracked store stocks is left out of the total and listed, never priced at $0", () => {
  const stores: BasketStores = { a: { name: "A", ship: flat(500) } };
  const plan = optimizeBasket([card("have", 1, [L("a", 700)]), card("gone", 2, [])], stores);
  assert.equal(plan.itemsCents, 700);
  assert.deepEqual(plan.unbuyable, [{ name: "gone", qty: 2 }]);
  assert.equal(plan.matchedCards, 1);
  assert.equal(plan.coveredCopies, 1);
});

test("every plan line carries the listing's condition and a link", () => {
  const stores: BasketStores = { a: { name: "A", ship: flat(500) } };
  const plan = optimizeBasket([card("x", 2, [L("a", 300, "Lightly Played")])], stores, { loc: "/tools/best-basket" });
  const line = plan.stores[0].lines[0];
  assert.equal(line.condition, "Lightly Played");
  assert.equal(line.qty, 2);
  assert.ok(line.url.startsWith("https://a.example/"));
});

test("the non-Premium preview is the aggregate only — no store names, lines or URLs", () => {
  const stores: BasketStores = { a: { name: "Secret Store", ship: flat(500) }, b: { name: "Other Store", ship: flat(500) } };
  const plan = optimizeBasket([card("1", 2, [L("a", 100), L("b", 120)]), card("2", 1, [L("b", 100)]), card("3", 1, [])], stores);
  const preview = basketPreview(plan, [{ raw: "1 Not A Card", qty: 1 }]);
  assert.deepEqual(Object.keys(preview).sort(), [
    "covered",
    "naiveTotalCents",
    "requested",
    "savedCents",
    "shippingCents",
    "storeCount",
    "totalCents",
    "unmatched",
  ]);
  const json = JSON.stringify(preview);
  for (const leak of ["Secret Store", "Other Store", "example", "url", "stores", "lines"]) assert.ok(!json.includes(leak), `preview leaks "${leak}"`);
  assert.equal(preview.covered, 3);
  assert.equal(preview.requested, 5, "covered + unbuyable + unmatched copies");
  assert.equal(preview.totalCents, plan.totalCents);
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring that can only be checked in source.
// ─────────────────────────────────────────────────────────────────────────────

test("CardSearch is a standalone reusable component with an onPick callback, not a navigate-away link", () => {
  const code = readCode("src/components/CardSearch.tsx");
  assert.match(code, /export function CardSearch/, "must be an exported component");
  assert.match(code, /onPick:\s*\(c:\s*SearchCard\)\s*=>\s*void/, "must expose a select callback");
  assert.match(code, /\/api\/search\?q=/, "must reuse the existing /api/search endpoint, no new backend needed");
  assert.doesNotMatch(code, /next\/link/, "a pick must select the card, not navigate via <Link>");
});

test("CardSearch supports keyboard arrow/enter selection", () => {
  const code = readCode("src/components/CardSearch.tsx");
  assert.match(code, /ArrowDown/);
  assert.match(code, /ArrowUp/);
  assert.match(code, /key === "Enter"/);
});

const ROUTE = "src/app/api/basket/route.ts";
const READS = "src/lib/basket-server.ts";

test("the basket route withholds the plan from non-Premium callers", () => {
  const code = readCode(ROUTE);
  assert.match(code, /const full = isPremium\(user, "premium"\)/);
  const at = code.indexOf("if (!full) {");
  assert.ok(at > 0);
  const branch = code.slice(at, code.indexOf("}", code.indexOf("});", at)) + 1);
  assert.match(branch, /basketPreview\(optimizeBasket\(basketCards, stores\), unmatched\)/);
  assert.doesNotMatch(branch, /plan|alternatives|fuzzy/, "the preview branch returns nothing but the aggregate");
  // The full plan's store links carry the page for the affiliate sub-id.
  assert.match(code, /planBasket\(basketCards, stores, \{ loc: "\/tools\/best-basket" \}\)/);
});

test("a failed read answers 503, never a $0.00 plan", () => {
  const code = readCode(ROUTE);
  assert.match(code, /status: 503/);
  assert.doesNotMatch(code, /\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(readCode(READS), /\.catch\(/, "the shared reads must throw, not swallow");
});

test("rate limits: 5 a day free, 30 an hour Premium, keyed by user", () => {
  const code = readCode(ROUTE);
  assert.match(code, /const HOUR = 3_600_000/);
  assert.match(code, /const DAY = 86_400_000/);
  assert.match(code, /rateLimit\(`basket-premium:\$\{user\.id\}`, 30, HOUR\)/);
  assert.match(code, /rateLimit\(`basket:\$\{user\.id\}`, 5, DAY\)/);
  // …checked before any database read.
  assert.ok(code.indexOf("rateLimit(") < code.indexOf("loadWatchlistCardIds("));
  assert.match(readCode("src/app/api/deck/price/route.ts"), /rateLimit\(`deck-price:\$\{clientIp\(req\)\}`/);
});

test("watchlist, binder and owned reads are per-user, selected and capped", () => {
  const code = readCode(READS);
  const watch = code.slice(code.indexOf("prisma.priceAlert.findMany"), code.indexOf("return [...new Set"));
  assert.match(watch, /where: \{ userId, market: country \}/);
  assert.match(watch, /select: \{ cardId: true \}/);
  assert.match(watch, /take: WATCHLIST_BASKET_CAP/);
  assert.match(code, /export const WATCHLIST_BASKET_CAP = 200/);
  const owned = code.slice(code.indexOf("export async function loadOwnedQty"), code.indexOf("for (const r of rows) owned.set"));
  assert.match(owned, /where: \{ userId, cardId: \{ in: cardIds \} \}/);
  assert.match(owned, /select: \{ cardId: true, quantity: true \}/);
  assert.match(owned, /take: 400/);
  const binder = code.slice(code.indexOf("export async function loadBinderHoldings"));
  assert.match(binder, /where: \{ userId \}/);
  assert.match(binder, /take: BINDER_ROW_CAP/);
  const listing = code.slice(code.indexOf("prisma.retailerPrice.findMany"), code.indexOf("const best = new Map"));
  assert.match(listing, /condition: true/, "condition is selected so every line can show it");
  assert.doesNotMatch(listing, /retailerName/, "unused column dropped");
});

test("nothing in Best Basket is cached: every answer is per user", () => {
  for (const f of [ROUTE, READS, "src/app/tools/best-basket/page.tsx", "src/app/api/portfolio/replacement/route.ts"]) {
    assert.doesNotMatch(readCode(f), /unstable_cache|cachedOrDirect/, `${f} must not cache`);
  }
});

test("skipOwned subtracts owned copies (and doesn't apply to the binder itself)", () => {
  const code = readCode(ROUTE);
  assert.match(code, /const skipOwned = body\?\.skipOwned === true && source !== "binder"/);
  assert.match(code, /loadOwnedQty\(user\.id, \[\.\.\.wanted\.keys\(\)\]\)/);
});

test("the page: auto-run only for Premium, a sign-in prompt signed out, honest copy", () => {
  const page = read("src/app/tools/best-basket/page.tsx");
  assert.match(page, /autoRun=\{premium && handedIn\}/);
  assert.match(page, /Sign in free/);
  for (const banned of [/wishlist/i, /every viable split/i, /ranks the results/i, /price: "0"/]) {
    assert.doesNotMatch(page, banned);
  }
  assert.doesNotMatch(readCode("src/app/tools/best-basket/page.tsx"), /"offers"|offers:/, "no Offer in the JSON-LD");
});

test("the UI: tracked store links, the free preview's own-numbers copy, and its upgrade button", () => {
  const ui = read("src/components/BestBasket.tsx");
  assert.match(ui, /<OutboundLink\s+href=\{l\.url\}\s+retailer=\{s\.key\}/, "store lines go through OutboundLink with the store key");
  assert.doesNotMatch(ui, /<a href=\{l\.url\}/, "no plain anchors for store lines");
  assert.match(ui, /Your list: \{fmt\(r\.totalCents\)\} delivered from \{stores\}, \{fmt\(r\.savedCents\)\} less than buying each card&apos;s cheapest copy\s+separately\. Premium shows which store to buy each card from\./);
  assert.match(ui, /Buying each card&apos;s cheapest copy is already the cheapest way for\s+this list\./);
  assert.match(ui, /<PremiumButton surface="gate:basket-preview" \/>/);
  assert.match(ui, /Skip copies I already own/);
  for (const t of ["Paste a list", "My watchlist", "My binder"]) assert.ok(ui.includes(t), `tab "${t}"`);
  for (const t of ["Cheapest split", "Best single store", "Best two stores"]) assert.ok(ui.includes(t), `plan card "${t}"`);
  assert.match(ui, /l\.condition \?\? "Condition not stated"/, "condition on every line");
  // Changing an input clears the answer on screen.
  assert.match(ui, /function touched\(\) \{\s*setResult\(null\);/);
  assert.match(ui, /<QtyInput/);
});
