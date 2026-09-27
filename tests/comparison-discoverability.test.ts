import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  homeDescription,
  homeSocialDescription,
  homeSocialTitle,
  homeTitle,
  regionHomeDescription,
} from "../src/lib/seo";
import { webApplication } from "../src/lib/jsonld";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const REGIONS = ["AU", "UK", "SG", "CA", "EU"] as const;
// Every count shape the live metadata can see: real counts, the widest numbers
// that fit the format, and each fallback.
const COUNTS: [number | null, number | null][] = [[1431, 172], [9999, 999], [null, null], [9999, null], [null, 999], [0, 0]];

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-27: "compare riftbound card prices" / "riftbound price comparison".
// No page owned the comparison phrasing. The market homepages' DESCRIPTIONS
// now lead with it; their TITLES keep the "Riftbound Card Prices" head term
// three audits settled (tests/keyword-ownership.test.ts). The share previews,
// the site JSON-LD, a WebApplication node, the homepage FAQs and llms.txt name
// the product in the same words.
// ─────────────────────────────────────────────────────────────────────────────

test("the market homepage descriptions lead with the comparison query and fit Google's snippet", () => {
  for (const [c, s] of COUNTS) {
    const d = homeDescription(c, s);
    assert.match(d, /^Compare Riftbound card prices /, d);
    assert.ok(d.length <= 155, `${d.length} chars: ${d}`);
    for (const r of REGIONS) {
      const rd = regionHomeDescription(r, c, s);
      assert.match(rd, /^Compare Riftbound card prices in /, rd);
      assert.ok(rd.length <= 155, `${rd.length} chars: ${rd}`);
    }
  }
});

test("the SERP title keeps its head term; the share preview names the engine", () => {
  for (const [, s] of COUNTS) {
    assert.ok(homeTitle(s).startsWith("Riftbound Card Prices"), homeTitle(s));
    assert.match(homeSocialTitle(s), /Riftbound price comparison engine/);
    assert.match(homeSocialDescription(s), /^Compare Riftbound card and sealed prices/);
  }
  assert.match(read("src/lib/home-metadata.ts"), /openGraph: pageOpenGraph\(\{\s*title: homeSocialTitle/);
});

test("no surface promises live shipping or a no-hidden-fees total", () => {
  // Postage is a measured checkout snapshot (lib/shipping.ts), shown on card
  // pages only where a listing carries it (lib/market-rows.ts ranks by ITEM
  // price). "Live shipping" and "no hidden fees" are claims nothing backs.
  const surfaces = [
    "src/lib/seo.ts",
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/trade/page.tsx",
    "src/app/llms.txt/route.ts",
    "src/app/.well-known/ai-plugin.json/route.ts",
  ];
  const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
  for (const f of surfaces) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /live (regional )?shipping|no hidden fees|real-time shipping/i, f);
  }
  // Delivered-cost ranking is Best Basket's, never the card comparison's.
  for (const [c, s] of COUNTS) {
    assert.doesNotMatch(homeDescription(c, s), /ranked by delivered|sorted by delivered/i);
  }
});

test("the WebApplication node is honest: free, feature-listed, and carries no rating", () => {
  const node = webApplication({
    id: "#app",
    name: "x",
    href: "/trade",
    description: "d",
    featureList: ["a"],
    applicationCategory: "UtilitiesApplication",
  }) as Record<string, unknown>;
  assert.equal(node["@type"], "WebApplication");
  assert.equal(node["@id"], "https://riftcompare.com/trade#app");
  assert.deepEqual(node.offers, { "@type": "Offer", price: "0", priceCurrency: "USD" });
  assert.ok(!("aggregateRating" in node) && !("review" in node), "no fabricated rating to chase a rich result");
  assert.equal(
    (webApplication({ id: "#app", name: "x", href: "/", description: "d", featureList: [], applicationCategory: "ShoppingApplication" }) as Record<string, unknown>)["@id"],
    "https://riftcompare.com/#app",
  );

  const home = read("src/app/page.tsx");
  assert.match(home, /webApplication\(\{\s*id: "#app",\s*name: "RiftCompare — Riftbound price comparison engine"/);
  assert.match(home, /q: "What is RiftCompare\?"[\s\S]{0,120}a free Riftbound price comparison engine/);
  assert.match(home, /q: "Does RiftCompare include shipping costs\?"/);
  assert.match(home, /q: "Is there a Riftbound trade calculator\?"/);
  assert.match(home, /faqPage\(FAQS\)/, "the new questions ship as FAQPage JSON-LD too");

  const layout = read("src/app/layout.tsx");
  assert.match(layout, /"@type": "WebSite"[\s\S]{0,700}description:\s*\n\s*"Riftbound price comparison:/);
});

test("the Trade Calculator leads with its query, fits the title budget and describes itself", () => {
  const src = read("src/app/trade/page.tsx");
  const title = /const TITLE = "([^"]+)"/.exec(src)?.[1] ?? "";
  assert.ok(title.startsWith("Riftbound Trade Calculator"), title);
  assert.ok(`${title} — RiftCompare`.length <= 60, `${title} is over budget with the suffix`);
  const desc = /const DESCRIPTION =\s*\n\s*"([^"]+)"/.exec(src)?.[1] ?? "";
  assert.ok(desc.length > 0 && desc.length <= 155, `${desc.length}: ${desc}`);
  assert.match(src, />Riftbound Trade Calculator<\/h1>/);
  assert.match(src, /webApplication\(\{[\s\S]*applicationCategory: "UtilitiesApplication"/);
});

test("llms.txt names all six markets and maps the money-saving intents to pages", () => {
  const src = read("src/app/llms.txt/route.ts");
  assert.match(src, /free Riftbound price comparison engine/);
  for (const m of ["United States", "Australia", "United Kingdom", "Singapore", "Canada", "the EU"]) assert.ok(src.includes(m), m);
  assert.match(src, /## What to use it for/);
  for (const p of ["/browse", "/tools/best-basket", "/trade", "/sealed", "/deck"]) {
    assert.match(src, new RegExp(`abs\\("${p.replace(/\//g, "\\/")}"\\)`), `intent list links ${p}`);
  }
});
