import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cardHeadlineLastKnown,
  inStockAnywhere,
  lastKnownDayLabel,
  lastKnownLabel,
  lastKnownPrice,
  newestRecordedPrice,
} from "../src/lib/last-known-price";
import { computeMarket, type MarketRow } from "../src/lib/market-rows";
import { TCGPLAYER_MARKET_RETAILER } from "../src/lib/constants";
import { COUNTRIES, DEFAULT_COUNTRY } from "../src/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// LAST KNOWN PRICE (2026-10-18, DECISIONS.md "Last known price where a card has
// none"). Where the card page's headline (and the quick view's price box) would
// read "—", the newest day of the card's own public price history stands in,
// muted and labelled "Last known price · <day>". These tests pin the selection
// (newest day, this card only, the slot's market series), the gate (only an
// empty slot, and only while no market has the card in stock), and the rule
// that it is display-only: no ranking, JSON-LD, metadata or list reads it.
// ─────────────────────────────────────────────────────────────────────────────

// The components compile to the classic JSX runtime here, as in the other render tests.
(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

// The history store resolves its directory at load: point it at a scratch one
// before anything imports it (price-history.ts below, lazily).
const scratch = mkdtempSync(join(tmpdir(), "rc-last-known-"));
process.env.PRICE_HISTORY_DIR = scratch;
test.after(() => rmSync(scratch, { recursive: true, force: true }));

let rowId = 0;
const row = (over: Partial<MarketRow>): MarketRow => ({
  id: `r${++rowId}`,
  country: "US",
  retailer: "somestore",
  retailerName: "Some Store",
  priceCents: 1000,
  ship: null,
  condition: "NM",
  isFoil: false,
  inStock: true,
  lastSeen: "2026-10-17T00:00:00.000Z",
  buyHref: "https://example.com",
  policyUrl: null,
  ...over,
});

const SERIES = [
  { t: at("2026-08-01"), v: 300 },
  { t: at("2026-09-12"), v: 420 },
  { t: at("2026-09-01"), v: 250 }, // older and cheaper: never "the last known"
];

// ── Selection ────────────────────────────────────────────────────────────────

test("the most recent recorded day wins, not the cheapest or the last in the array", () => {
  assert.deepEqual(newestRecordedPrice(SERIES), { cents: 420, day: "2026-09-12" });
});

test("no history, or nothing valid in it, is no last known price", () => {
  assert.equal(newestRecordedPrice([]), null);
  assert.equal(newestRecordedPrice(null), null);
  assert.equal(newestRecordedPrice(undefined), null);
  assert.equal(newestRecordedPrice([{ t: at("2026-09-12"), v: 0 }, { t: Number.NaN, v: 500 }, { t: at("2026-09-13"), v: -1 }]), null);
  assert.deepEqual(newestRecordedPrice([{ t: at("2026-09-10"), v: 700 }, { t: at("2026-09-12"), v: 0 }]), { cents: 700, day: "2026-09-10" });
});

test("the fine print is text in the card page's date form, the same on server and client", () => {
  assert.equal(lastKnownDayLabel("2026-09-12"), "12 Sep 2026");
  assert.equal(lastKnownDayLabel("2026-01-05"), "5 Jan 2026");
  assert.equal(lastKnownLabel("2026-09-12"), "Last known price · 12 Sep 2026");
});

// ── The gate: the headline slot (US, DEFAULT_COUNTRY) ───────────────────────

test("an empty headline with history shows the newest recorded day", () => {
  assert.deepEqual(cardHeadlineLastKnown([], "US", SERIES), { cents: 420, day: "2026-09-12" });
});

test("a current price in the slot's market means no last known price", () => {
  assert.equal(cardHeadlineLastKnown([row({ inStock: true })], "US", SERIES), null);
});

test("a foil copy in stock is the slot's current price too (the headline is one figure across finishes)", () => {
  assert.equal(cardHeadlineLastKnown([row({ isFoil: true })], "US", SERIES), null);
});

test("an out-of-stock listing in the slot's market keeps its own 'Last seen' figure", () => {
  const rows = [row({ inStock: false, priceCents: 999 })];
  assert.notEqual(computeMarket(rows, "US").lastSeen, null);
  assert.equal(cardHeadlineLastKnown(rows, "US", SERIES), null);
});

test("stock in ANOTHER market means no last known price: the shared series' newest point would be that market's live price", () => {
  assert.equal(cardHeadlineLastKnown([row({ country: "AU" })], "US", SERIES), null);
  assert.equal(cardHeadlineLastKnown([row({ country: "CA" })], "US", SERIES), null);
});

test("other markets' sold-out rows and reference rows are not current prices", () => {
  const rows = [
    row({ country: "AU", inStock: false }),
    row({ country: "US", retailer: TCGPLAYER_MARKET_RETAILER, inStock: true }), // a reference, never a store
  ];
  assert.equal(inStockAnywhere(rows), false);
  assert.deepEqual(cardHeadlineLastKnown(rows, "US", SERIES), { cents: 420, day: "2026-09-12" });
});

test("no history means nothing, whatever the slot", () => {
  assert.equal(cardHeadlineLastKnown([], "US", []), null);
  assert.equal(lastKnownPrice({ slotIsEmpty: true, rows: [], recorded: null }), null);
  assert.equal(lastKnownPrice({ slotIsEmpty: false, rows: [], recorded: { cents: 1, day: "2026-09-12" } }), null);
});

// ── The series: this card only, the slot's market and currency ──────────────

test("read through getPriceHistory, another printing's newer points never stand in, and the market's own conversion applies", async () => {
  const store = await import("../src/lib/price-history-store");
  const { getPriceHistory, historySource } = await import("../src/lib/price-history");
  const iso = (daysAgo: number) => new Date(Math.floor(Date.now() / DAY) * DAY - daysAgo * DAY);
  // "base" and "alt" are two printings of one card: two card ids in the same day files.
  store.writeCardHistoryDay(iso(40), [["base", 650], ["alt", 4000]]);
  store.writeCardHistoryDay(iso(20), [["base", 500], ["alt", 4100]]);
  store.writeCardHistoryDay(iso(5), [["alt", 9000]]);
  store.resetPriceHistoryStore();

  const us = newestRecordedPrice(await getPriceHistory("base", "US"));
  assert.deepEqual(us, { cents: 500, day: iso(20).toISOString().slice(0, 10) }, "the base printing's own newest day, not the alt art's");

  const au = newestRecordedPrice(await getPriceHistory("base", "AU"));
  assert.equal(au?.cents, historySource("AU").convert(500), "converted exactly as the chart converts it");
  assert.equal(au?.day, us?.day);

  assert.equal(newestRecordedPrice(await getPriceHistory("unknown", "US")), null);
});

// ── Display: muted, labelled, never the accent ──────────────────────────────

test("the headline renders it muted under 'No live price', with the fine print, and never as 'Cheapest'", async () => {
  const { CardPriceMetrics } = await import("../src/components/CardMarketSection");
  const html = renderToStaticMarkup(
    createElement(CardPriceMetrics, { rows: [], energyCost: null, might: null, power: null, lastKnown: { cents: 420, day: "2026-09-12" } }),
  );
  const place = COUNTRIES[DEFAULT_COUNTRY].place;
  assert.match(html, new RegExp(`No live price · ${place}`));
  assert.match(html, /Last known price · 12 Sep 2026/);
  assert.doesNotMatch(html, /Cheapest price/);
  const value = /<div class="([^"]*)">US\$4\.20<\/div>/.exec(html);
  assert.ok(value, `the figure is rendered: ${html}`);
  assert.match(value![1], /text-slate-400/, "the secondary text colour");
  assert.doesNotMatch(value![1], /text-accent/, "never the price accent");
});

test("a live price always wins in the headline, even if a last known one were passed", async () => {
  const { CardPriceMetrics } = await import("../src/components/CardMarketSection");
  const html = renderToStaticMarkup(
    createElement(CardPriceMetrics, {
      rows: [row({ country: DEFAULT_COUNTRY, priceCents: 777 })],
      energyCost: null,
      might: null,
      power: null,
      lastKnown: { cents: 420, day: "2026-09-12" },
    }),
  );
  assert.match(html, /Cheapest price/);
  assert.doesNotMatch(html, /Last known price|No live price|4\.20/);
});

// ── Display-only: nothing that ranks, prices, indexes or describes reads it ──

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

// Every file that may touch it, and why. Adding one means reading
// lib/last-known-price.ts's header first: a sort, filter, index, mover, deal,
// alert, basket, collection value, eBay comparison, "cheapest"/"from" claim,
// JSON-LD, title, description, share image, sitemap or public-data export must
// never be on this list.
const ALLOWED: Record<string, string> = {
  "src/lib/last-known-price.ts": "the selection, the gate and the label",
  "src/app/card/[id]/page.tsx": "computes it once for the headline tile and the no-listings explainer",
  "src/components/CardMarketSection.tsx": "CardPriceMetrics draws it, muted, in the headline tile",
  "src/components/QuickView.tsx": "the quick view's price box draws it, muted",
  "src/app/api/card/[id]/history/route.ts": "hands the quick view the series' newest recorded day",
};

test("only the display path names the last known price", () => {
  const touches = /\blastKnown|last-known-price|cardHeadlineLastKnown|newestRecordedPrice/;
  const found = walk(join(ROOT, "src"))
    .map((f) => relative(ROOT, f))
    .filter((rel) => touches.test(readFileSync(join(ROOT, rel), "utf8")))
    .sort();
  assert.deepEqual(found, Object.keys(ALLOWED).sort(), "a new reader of the last known price must be display-only and listed here");
});

test("on the card page it never reaches the metadata, the JSON-LD, the FAQ, the narrative or a ranking query", () => {
  const page = read("src/app/card/[id]/page.tsx");
  const slice = (from: string, to: string) => {
    const a = page.indexOf(from);
    const b = page.indexOf(to, a + from.length);
    assert.ok(a >= 0 && b > a, `expected ${from} … ${to} in the card page`);
    return page.slice(a, b);
  };
  const forbidden: [string, string][] = [
    ["export async function generateMetadata", "export default async function CardPage"], // title, description, robots, OG
    ["const priceValidUntil", "const tags ="], // Product, AggregateOffer and Offer JSON-LD
    ["const printings = await prisma.card.findMany", "const history = await getPriceHistory"], // similar / cheaper / champion rails
    ["const about = buildCardNarrative(", "const priceState ="], // the About prose
    ["const faqs = buildFaqs(", "return ("], // the FAQ and its FAQPage JSON-LD
  ];
  for (const [from, to] of forbidden) assert.doesNotMatch(slice(from, to), /lastKnown/, `${from} must not read the last known price`);

  // Every remaining use, line by line: the import, the one computation, the
  // headline prop and the explainer's sentence.
  const uses = page
    .split("\n")
    .filter((l) => /\blastKnown/.test(l) && !/^\s*(\/\/|\{\/\*|\*)/.test(l.trim()) && !/^\s*\/\//.test(l));
  const allowedLine = [
    /^import \{ cardHeadlineLastKnown, lastKnownDayLabel \} from "@\/lib\/last-known-price";$/,
    /^const lastKnown = cardHeadlineLastKnown\(rows, DEFAULT_COUNTRY, history\);$/,
    /^<CardPriceMetrics rows=\{rows\} .*lastKnown=\{lastKnown\} \/>$/,
    /^\{lastKnown &&$/,
    /^` The last price we recorded for it, on \$\{lastKnownDayLabel\(lastKnown\.day\)\}, is shown above as a guide only\.`\}$/,
    /^\{lastKnown$/,
    /^\? `, so there is nothing to compare\. The last price we recorded for it, on \$\{lastKnownDayLabel\(lastKnown\.day\)\}, is shown above as a guide only, not a price you can pay today\.`$/,
  ];
  for (const l of uses) {
    assert.ok(allowedLine.some((re) => re.test(l.trim())), `unexpected use of the last known price on the card page: ${l.trim()}`);
  }
  assert.ok(uses.length >= 4, "fixture check: the card page uses it");
});

test("the headline computation and the comparison never learn about it", () => {
  // computeMarket is the headline, the JSON-LD's offers and every per-market
  // figure; the tile and list data are what sorts, filters and ranks.
  for (const file of ["src/lib/market-rows.ts", "src/components/CardTile.tsx", "src/lib/cards.ts", "src/lib/card-seo.ts"]) {
    assert.doesNotMatch(read(file), /lastKnown|last-known-price/, `${file} must not read the last known price`);
  }
  // In the card's market section only CardPriceMetrics takes it: the
  // comparison list, the out-of-stock list and the eBay fallback do not.
  const section = read("src/components/CardMarketSection.tsx");
  const comparison = section.slice(section.indexOf("export function CardPriceComparison"));
  assert.doesNotMatch(comparison, /lastKnown|LastKnown/);
});
