import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getArticles } from "../src/lib/articles";

// What the site says about ITSELF has to be true (DECISIONS.md, "Blog and
// tools, joined up", 2026-09-26). An AdSense reviewer who reads "every price is
// ranked by total delivered cost, shipping included" and then opens a card page
// showing "postage at checkout" marks the whole site down, and the rejection it
// answered was for low-value content.
//
// The facts these patterns defend, each checkable in code:
//  - comparisons sort by ITEM price; postage only breaks ties and is shown where
//    a store publishes it (lib/market-rows.ts computeMarket). Only Best Basket
//    prices whole orders with measured postage (lib/shipping.ts);
//  - six markets: AU, US, UK, Singapore, Canada and the EU (since 2026-08-24);
//  - prices are snapshots from two imports a day, never real-time lookups;
//  - the Index and every price we show come from listings, never sold/completed
//    sales, which we do not collect.
//
// Scoped to claims ABOUT THE SITE: general buying advice ("compare the total
// including shipping", eBay's fee being charged on the shipping-included total)
// is true and allowed, by exact sentence fragment below.

const CLAIMS: [string, RegExp][] = [
  ["ranked by delivered cost", /\b(rank|sort)\w*\b[^.\n]{0,60}\b(delivered|total cost|including (postage|shipping)|shipping included|what you(?:'d| would) actually pay)/i],
  ["shipping included", /(riftcompare|\bwe\b|\bour\b|every (figure|price))[^.\n]{0,90}(shipping included|including shipping|with shipping|postage included|total cost[^.\n]{0,20}shipping)|\bno hidden fees\b/i],
  ["five markets", /\b(five|5) (markets|countries)\b|\bUS, UK, AU, CA,? (and|&) SG\b|\bAU, US, UK, Singapore (&|and) Canada\b|\bUS\/UK\/AU\/CA\/SG\b(?!\/EU)/i],
  ["sold listings", /(riftcompare|\bour\b|\bwe\b|the index)[^.\n]{0,90}\b(completed sales|sold listings|completed listings)/i],
  ["real-time", /(riftcompare|\bour\b|\bwe\b)[^.\n]{0,60}\b(real[- ]time|updated hourly|checked hourly|live lookups?)\b/i],
  // "…compared across 24 UK stores, with UK delivered cost" — the region homes'
  // meta description said it for a month with no rank/sort word nearby.
  ["delivered-cost comparison", /\bwith (\w+ )?delivered cost\b|\bon (total )?delivered cost\b|\bcheapest delivered (first|price)\b/i],
];

// True sentences that match a pattern, with the reason each is true.
const ALLOW = [
  "with delivered cost shown where", // the corrected wording itself: sorted by price, postage shown where known
  "whole order, shipping included", // eBay's final value fee base (tools/selling-fees)
  "Nine events across five countries", // Riot's promo events, not our markets
];

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

// Comments are notes to developers, not claims to visitors: blank them out,
// keeping every newline so reported line numbers stay right.
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const allowed = (s: string) => ALLOW.some((a) => s.includes(a));

function findings(text: string, where: string, split: RegExp): string[] {
  const out: string[] = [];
  for (const piece of text.split(split)) {
    if (allowed(piece)) continue;
    for (const [name, re] of CLAIMS) if (re.test(piece)) out.push(`${where} [${name}]: ${piece.trim().slice(0, 160)}`);
  }
  return out;
}

test("no page, component or intro claims something about the site the code does not do", () => {
  const files = [
    ...walk(join(ROOT, "src/app")),
    ...walk(join(ROOT, "src/components")),
    join(ROOT, "src/lib/content/hub-intros.ts"),
    join(ROOT, "src/lib/content/authors.ts"),
    join(ROOT, "src/lib/seo.ts"),
  ];
  const bad: string[] = [];
  for (const f of files) {
    stripComments(readFileSync(f, "utf8"))
      .split("\n")
      .forEach((line, i) => bad.push(...findings(line, `${relative(ROOT, f)}:${i + 1}`, /\n/)));
  }
  assert.deepEqual(bad, [], `\n${bad.join("\n")}`);
});

test("no published article claims something about the site the code does not do", () => {
  const bad: string[] = [];
  for (const a of getArticles()) {
    const fields: [string, unknown][] = [
      ["title", a.title],
      ["excerpt", a.excerpt],
      ["body", a.body],
      ["summary", (a as { summary?: unknown }).summary],
      ["faq", (a as { faq?: unknown }).faq],
      ["browseCta", (a as { browseCta?: unknown }).browseCta],
    ];
    for (const [name, value] of fields) {
      if (value == null) continue;
      const text = typeof value === "string" ? value : JSON.stringify(value);
      bad.push(...findings(text, `${a.slug}.${name}`, /(?<=[.!?])\s+|\n|","/));
    }
  }
  assert.deepEqual(bad, [], `\n${bad.join("\n")}`);
});

test("the patterns catch the claims they exist for, and pass the true sentences", () => {
  const hit = (s: string) => CLAIMS.some(([, re]) => re.test(s)) && !allowed(s);
  assert.ok(hit("Every comparison ranks stores by total delivered cost."));
  assert.ok(hit("RiftCompare shows the true all-in price with shipping included."));
  assert.ok(hit("It tracks stores in five markets."));
  assert.ok(hit("Live prices across US, UK, AU, CA and SG stores."));
  assert.ok(hit("The index is built from tracked listings and completed sales."));
  assert.ok(hit("RiftCompare shows real-time prices."));
  assert.ok(hit("1,101 cards compared across 24 UK stores in GBP, with UK delivered cost."));
  assert.ok(hit("RiftCompare compares every store, cheapest delivered first."));
  assert.ok(!hit("Best Basket's store-by-store plan for the cheapest delivered order."));
  assert.ok(!hit("Compare the total cost including shipping before you buy from a new store."));
  assert.ok(!hit("Every store's price, ranked by price, with delivered cost shown where the store publishes postage."));
  assert.ok(!hit("eBay's fee is charged on the whole order, shipping included, so the eBay tab reads higher."));
  assert.ok(!hit("Stores in six markets: Australia, the US, the UK, Singapore, Canada and the EU."));
});
