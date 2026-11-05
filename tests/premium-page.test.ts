import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annualMonthsFree, demoAnswer, monthlyPriceCents, paysForItself, teaserDeals, DEMO_LINE_CAP } from "../src/lib/premium-page";
import { annualSavingPct, premiumMoneyNum, PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT } from "../src/lib/site";
import { convertCents } from "../src/lib/fx";
import { PREMIUM_TESTIMONIALS } from "../src/lib/content/premium-testimonials";
import type { Deal } from "../src/lib/top-deals";
import type { BasketPlan, BasketResult } from "../src/lib/basket";

// /premium's conversion redesign (2026-10-23, DECISIONS.md "/premium, rebuilt
// to convert, honestly"): every computed figure is held to its source here.

const page = readFileSync(new URL("../src/app/premium/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/premium/demo/route.ts", import.meta.url), "utf8");

const deal = (over: Partial<Deal> = {}): Deal => ({
  dealType: "savings-vs-market",
  title: "Card",
  subtitle: null,
  href: "/card/x",
  outboundUrl: null,
  outboundRetailer: null,
  imageUrl: null,
  priceCents: 500,
  pctLabel: 50,
  deltaCents: 500,
  refCents: 1000,
  note: null,
  card: null,
  ...over,
});

test("months free comes from the configured prices, rounded to the nearest month", () => {
  const m = premiumMoneyNum(PREMIUM_PRICE_AMOUNT);
  const a = premiumMoneyNum(PREMIUM_ANNUAL_AMOUNT);
  assert.equal(annualMonthsFree(), Math.round((m * 12 - a) / m));
  // At the 2026-10-23 prices ($9.99 / $79.99): 3.99 months, said as "≈ 4", beside "Save 33%".
  if (PREMIUM_PRICE_AMOUNT === "$9.99" && PREMIUM_ANNUAL_AMOUNT === "$79.99") {
    assert.equal(annualMonthsFree(), 4);
    assert.equal(annualSavingPct(), 33);
  }
  assert.equal(monthlyPriceCents(), Math.round(m * 100));
});

test("the months-free line says ≈, never an exact claim", () => {
  const cards = readFileSync(new URL("../src/components/PremiumPricingCards.tsx", import.meta.url), "utf8");
  assert.match(cards, /Save \{savePct\}% ≈ \{monthsFree\} months free/);
});

test("teaser takes only real below-market deals, three at most", () => {
  const ds = [deal(), deal({ deltaCents: 0 }), deal({ priceCents: 0 }), deal({ dealType: "price-drops" }), deal(), deal(), deal()];
  assert.equal(teaserDeals(ds).length, 3);
  assert.ok(teaserDeals(ds).every((d) => (d.deltaCents ?? 0) > 0 && d.priceCents > 0 && d.dealType === "savings-vs-market"));
  assert.deepEqual(teaserDeals(null), []);
});

test("pays-for-itself shows only when the average gap beats a month of Premium", () => {
  // US: average of 1500 and 500 = 1000 > 999.
  const yes = paysForItself([deal({ deltaCents: 1500 }), deal({ deltaCents: 500 })], "USD", 999);
  assert.deepEqual(yes, { avgSavingCents: 1000, monthlyInMarketCents: 999, dealCount: 2 });
  // Below the price: no line.
  assert.equal(paysForItself([deal({ deltaCents: 900 })], "USD", 999), null);
  // Equal is not "above".
  assert.equal(paysForItself([deal({ deltaCents: 999 })], "USD", 999), null);
  // No deals, no line.
  assert.equal(paysForItself([], "USD", 999), null);
  // Another market: the US$ price is converted with the site's reference rate before comparing.
  const aud = convertCents(999, "USD", "AUD");
  assert.equal(paysForItself([deal({ deltaCents: aud })], "AUD", 999), null);
  assert.equal(paysForItself([deal({ deltaCents: aud + 1 })], "AUD", 999)?.monthlyInMarketCents, aud);
});

const plan = (over: Partial<BasketPlan> = {}): BasketPlan => ({
  stores: [],
  itemsCents: 0,
  shippingCents: 0,
  topUpCents: 0,
  totalCents: 3000,
  storeCount: 2,
  naiveTotalCents: 3200,
  naiveStoreCount: 3,
  savedCents: 200,
  unbuyable: [],
  excludedStores: [],
  matchedCards: 3,
  coveredCopies: 3,
  ...over,
});
const result = (p: BasketPlan, single: BasketPlan | null): BasketResult => ({
  plan: p,
  alternatives: { singleStore: single, twoStores: null, twoStoresNone: null },
});

test("demo answer: single store vs split, totals only", () => {
  const a = demoAnswer(result(plan(), plan({ totalCents: 3500, storeCount: 1 })), [{ raw: "Nope", qty: 2 }], 1);
  assert.deepEqual(a, {
    splitCents: 3000,
    splitStores: 2,
    singleStoreCents: 3500,
    savedCents: 500,
    covered: 3,
    requested: 5,
    unmatched: ["Nope"],
    skippedLines: 1,
  });
  // Nothing that names a store, a line or a link.
  assert.deepEqual(Object.keys(a).sort(), ["covered", "requested", "savedCents", "singleStoreCents", "skippedLines", "splitCents", "splitStores", "unmatched"]);
  // No one store has it all: no saving claimed.
  const none = demoAnswer(result(plan(), null), [], 0);
  assert.equal(none.singleStoreCents, null);
  assert.equal(none.savedCents, null);
  // A one-store order that covers fewer cards is not the same list: not compared.
  assert.equal(demoAnswer(result(plan(), plan({ coveredCopies: 2, totalCents: 100 })), [], 0).singleStoreCents, null);
  // Never a negative saving.
  assert.equal(demoAnswer(result(plan(), plan({ totalCents: 2900 })), [], 0).savedCents, 0);
});

test("demo route: capped, rate limited, read-only, totals only", () => {
  assert.equal(DEMO_LINE_CAP, 10);
  assert.match(route, /rateLimit\(`premium-demo:\$\{clientIp\(req\)\}`, 10, HOUR\)/);
  assert.match(route, /slice\(0, DEMO_LINE_CAP\)/);
  assert.match(route, /planBasket\(/, "reuses the Best Basket solver");
  assert.match(route, /parseDeckList\(/, "reuses the list parser");
  assert.doesNotMatch(route, /\.(create|update|upsert|delete)\w*\(/, "writes nothing");
  assert.doesNotMatch(route, /plan:|alternatives:|stores:/, "never returns the store-by-store plan");
});

test("honesty: example content is labelled, no fabricated proof patterns", () => {
  const preview = readFileSync(new URL("../src/components/premium/PremiumAlertPreview.tsx", import.meta.url), "utf8");
  assert.match(preview, />\s*Example alert\s*</);
  for (const bad of [/countdown/i, /people (bought|joined)/i, /\bonly \d+ left\b/i, /subscribers? (love|trust)/i, /★★★★★/]) {
    assert.doesNotMatch(page, bad);
  }
});

test("one plan table at the top, nothing said twice: no proof strip, teaser, demo, alert preview, sticky bar or FAQ", () => {
  // 2026-10-25, owner: "way too much going on … we just need one at the very top
  // … an annual and monthly plan table, and then the comparison between features,
  // and that's it". DECISIONS.md, "/premium is one plan table and one comparison".
  const jsx = page.slice(page.indexOf("export default async function PremiumPage"));
  const h1 = jsx.indexOf("<h1");
  const table = jsx.indexOf("<PremiumPlanTable");
  assert.ok(h1 > 0 && table > h1, "the plan table straight under the headline");
  for (const gone of ["PremiumProofStrip", "PremiumDealsTeaser", "PremiumSavingsDemo", "PremiumAlertPreview", "PremiumStickyCta", "PremiumFaqList", "data-premium-hero-price", "data-stores-crosslink", "PREMIUM_TESTIMONIALS"]) {
    assert.ok(!jsx.includes(gone), `${gone} is gone from /premium`);
  }
  assert.equal((jsx.match(/<PremiumCta\b/g) ?? []).length, 0, "no hero button: the plan cards hold the only buttons");
  assert.match(page, /data-premium-terms/, "the terms, said once");
  assert.doesNotMatch(page, /STORE_PLAN_AMOUNT/, "no Stores price on /premium");
  // The plan table: Annual (lit) and Monthly, each with its own button, then Free vs Premium.
  const t = readFileSync(new URL("../src/components/premium/PremiumPlanTable.tsx", import.meta.url), "utf8");
  assert.match(t, /name="Annual"[\s\S]*?plan="annual"[\s\S]*?name="Monthly"[\s\S]*?plan="monthly"/);
  assert.equal((t.match(/<PremiumCta\b/g) ?? []).length, 2, "one button per plan");
  assert.match(t, /Free vs Premium/);
  assert.match(t, /plan-glow/, "the annual card's animated border");
  assert.doesNotMatch(t, /\$\d/, "no price typed in: every number from lib/site.ts");
});

test("the header's link reads Pricing (2026-10-24); the homepage hero keeps Get Premium", () => {
  const link = readFileSync(new URL("../src/components/GetPremiumLink.tsx", import.meta.url), "utf8");
  assert.match(link, /\{full \? <span>Get Premium<\/span> : <span>Pricing<\/span>\}/);
  assert.match(link, /\{full \? "Premium" : "Pricing"\}/);
  assert.doesNotMatch(link, /<span className="hidden xl:inline">Get Premium<\/span>/);
});
