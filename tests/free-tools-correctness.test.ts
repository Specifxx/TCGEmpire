import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cheapestBoxOffers, verdictFor, NO_BOOSTER_SETS, type BoxOfferListing } from "../src/lib/box-ev";
import { computeFees, parseRate, type FeeInputs } from "../src/lib/selling-fees";
import { playedDiscounts, playedDiscountText, type ConditionListing } from "../src/lib/played-discount";
import { soldOutEverywhere } from "../src/lib/sealed-offers";
import { EBAY_SITE_LABEL } from "../src/lib/ebay-auctions";

// ─────────────────────────────────────────────────────────────────────────────
// The free tools must be right for the paid tiers to be believable (2026-09-25
// lineup pass, workstream F). Each block pins one fix from the audit.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (p: string) =>
  read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const NOW = Date.parse("2026-09-25T12:00:00Z");
const fresh = new Date(NOW - 3600_000).toISOString();
const stale = new Date(NOW - 5 * 86400_000).toISOString();

// ── Box EV ───────────────────────────────────────────────────────────────────

test("Box EV: a box priced over its EV says the PRICE is above EV, not 'well below EV'", () => {
  const v = verdictFor(0.7)!;
  assert.equal(v.tone, "down");
  assert.match(v.text, /^Price is well above EV/);
  assert.doesNotMatch(v.text, /Well below EV/, "that read as 'the price is below EV': a bargain");
});

test("Box EV: the verdict's tone agrees with the colour of the ratio it sits under", () => {
  // The calculator paints ratio ≥ 1 green and ≥ 0.85 gold; the verdict used to
  // stay gold up to 1.10, under a green 105%.
  assert.equal(verdictFor(1.05)!.tone, "up");
  assert.equal(verdictFor(1.2)!.tone, "up");
  assert.equal(verdictFor(0.9)!.tone, "flat");
  assert.equal(verdictFor(null), null);
});

test("Box EV: Proving Grounds is not offered — it has no booster packs", () => {
  assert.ok(NO_BOOSTER_SETS.has("OGS"));
  assert.match(codeOnly("src/app/tools/box-ev/page.tsx"), /!NO_BOOSTER_SETS\.has\(s\.code\)/);
});

const listing = (over: Partial<BoxOfferListing>): BoxOfferListing => ({
  retailer: "store_a",
  retailerName: "Store A",
  url: "https://a.example/box",
  priceCents: 20_000,
  inStock: true,
  lastSeen: fresh,
  ...over,
});

test("Box EV: the prefill is the cheapest OPEN booster box for each set", () => {
  const groups = [
    {
      productType: "Booster Box",
      setCode: "VEN",
      listings: [
        listing({ priceCents: 18_000, inStock: false }), // sold out: never the prefill
        listing({ retailer: "b", priceCents: 19_000, lastSeen: stale }), // not read lately: unknown
        listing({ retailer: "c", retailerName: "Store C", priceCents: 21_000 }),
      ],
    },
    { productType: "Booster Pack", setCode: "VEN", listings: [listing({ priceCents: 600 })] },
    { productType: "Booster Box", setCode: "UNL", listings: [listing({ priceCents: 25_000 })] },
    { productType: "Booster Box", setCode: "OGS", listings: [listing({ priceCents: 1 })] },
    { productType: "Booster Box", setCode: "SFD", listings: [listing({ inStock: false })] },
  ];
  const out = cheapestBoxOffers(groups, new Set(["VEN", "UNL", "SFD"]), NOW);
  assert.equal(out.get("VEN")?.priceCents, 21_000);
  assert.equal(out.get("VEN")?.retailerName, "Store C");
  assert.equal(out.get("UNL")?.priceCents, 25_000);
  assert.equal(out.has("OGS"), false, "only sets the calculator offers");
  assert.equal(out.has("SFD"), false, "nothing open, no prefill");
});

test("Box EV: getSealedGroups is called at the page's top level, never inside getBoxEvData's cache", () => {
  const page = codeOnly("src/app/tools/box-ev/page.tsx");
  const start = page.indexOf("function getBoxEvData");
  const end = page.indexOf("\ntype CardRow", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(page.slice(start, end), /getSealedGroups/, "nested in cachedOrDirect it would bypass its own cache");
  const body = page.slice(page.indexOf("export default async function BoxEvPage"));
  assert.match(body, /getSealedGroups\(code\)/);
  assert.match(body, /<BoxEvCalculator sets=\{sets\} offers=\{boxOffers\} \/>/);
});

// ── Selling fees ─────────────────────────────────────────────────────────────

const base: FeeInputs = {
  price: 40,
  shipCharged: 1,
  shipCost: 0.8,
  commissionPct: 13.25,
  processingPct: 0,
  fixedFee: 0.3,
  commissionBase: "itemPlusShipping",
};

test("Selling fees: eBay's final value fee is charged on item + shipping", () => {
  const r = computeFees(base);
  assert.equal(r.commissionBaseAmount, 41);
  assert.ok(Math.abs(r.commission - 0.1325 * 41) < 1e-9);
  assert.ok(Math.abs(r.net - (41 - 0.1325 * 41 - 0.3 - 0.8)) < 1e-9);
  // TCGplayer's commission stays on the item price.
  const tcg = computeFees({ ...base, commissionBase: "item" });
  assert.equal(tcg.commissionBaseAmount, 40);
  assert.ok(r.net < tcg.net, "charging shipping too can only lower the payout");
});

test("Selling fees: no net payout until the commission is entered", () => {
  // The first paint used to read "US$38.71" on a $40 TCGplayer sale, commission
  // silently 0 — the largest fee missing from the headline.
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("  "), null);
  assert.equal(parseRate("0"), 0, "0% is an answer; blank is not");
  assert.equal(computeFees({ ...base, commissionPct: null }).complete, false);
  assert.equal(computeFees({ ...base, commissionPct: 0 }).complete, true);
  const ui = codeOnly("src/components/FeeCalculator.tsx");
  assert.match(ui, /calc\.complete \?/);
  assert.match(ui, /Enter your commission/);
  assert.match(ui, /commissionBase: "itemPlusShipping"/, "the eBay preset");
});

// ── Card page: played listings vs the cheapest NM here ───────────────────────

const row = (id: string, condition: string | null, priceCents: number, isFoil = false): ConditionListing => ({
  id,
  condition,
  isFoil,
  priceCents,
});

test("Played listing: 'LP · 22% under the cheapest NM here', from the page's own listings", () => {
  const d = playedDiscounts([
    row("nm1", "Near Mint", 1_000),
    row("nm2", "NM", 1_200),
    row("lp", "Lightly Played", 780),
    row("mp", "MP", 1_050),
    row("hp", "Heavily Played", 1_000),
  ]);
  assert.equal(d.get("lp")?.grade, "LP");
  assert.equal(d.get("lp")?.pctUnder, 22);
  assert.equal(d.get("lp")?.cheapestNmCents, 1_000);
  assert.equal(d.get("lp")?.typicalPct, 15, "the site's standard LP multiplier, as context");
  assert.equal(playedDiscountText(d.get("lp")!), "22% under the cheapest NM here");
  // A played copy that isn't cheaper says so rather than hiding it.
  assert.equal(playedDiscountText(d.get("mp")!), "costs more than the cheapest NM here");
  assert.equal(playedDiscountText(d.get("hp")!), "same price as the cheapest NM here");
  assert.equal(d.has("nm1"), false, "NM rows carry no note");
});

test("Played listing: only against an NM copy of the same finish, and only when one exists", () => {
  // A foil LP is not compared with a non-foil NM: the foil premium would swamp it.
  const d = playedDiscounts([row("nm", "NM", 1_000), row("lpFoil", "LP", 1_500, true), row("odd", "Default Title", 500)]);
  assert.equal(d.has("lpFoil"), false);
  assert.equal(d.has("odd"), false, "an unreadable condition is not 'played'");
  assert.equal(playedDiscounts([row("lp", "LP", 800)]).size, 0, "no NM in this market, no note");
  const foil = playedDiscounts([row("nmF", "NM", 2_000, true), row("lpF", "LP", 1_500, true)]);
  assert.equal(foil.get("lpF")?.pctUnder, 25);
});

test("Played listing: the card page renders it from the rows it already has (no new query)", () => {
  const src = codeOnly("src/components/CardMarketSection.tsx");
  assert.match(src, /playedDiscounts\(prices\)/);
  assert.match(src, /playedDiscountText\(d\)/);
});

// ── /sealed: "Sold out at every store we track" ──────────────────────────────

test("Sealed: sold out everywhere means every tracked store says so on a fresh read", () => {
  const soldOut = { priceCents: 20_000, inStock: false, lastSeen: fresh };
  assert.equal(soldOutEverywhere([soldOut, { ...soldOut, priceCents: 21_000 }], NOW), true);
  assert.equal(soldOutEverywhere([soldOut, { ...soldOut, lastSeen: stale }], NOW), false, "a stale store is unknown, not sold out");
  assert.equal(soldOutEverywhere([soldOut, { ...soldOut, inStock: true }], NOW), false);
  assert.equal(soldOutEverywhere([], NOW), false, "untracked is not sold out");
});

test("Sealed: the badge is computed from the page's own top-level getSealedGroups read", () => {
  const page = codeOnly("src/app/sealed/page.tsx");
  assert.match(page, /all\.filter\(\(g\) => soldOutEverywhere\(g\.listings\)\)/);
  assert.match(page, /soldOutEverywhere=\{soldOutKeys\.has\(g\.groupKey\)\}/);
  assert.match(read("src/components/SealedTile.tsx"), /Sold out at every store we track/);
});

// ── /auctions ────────────────────────────────────────────────────────────────

test("Auctions: the bid is labelled as of the last check, with its age", () => {
  const lib = codeOnly("src/lib/ebay-auctions.ts");
  const loader = lib.slice(lib.indexOf("export function getLiveAuctions"));
  assert.match(loader, /updatedAt: true/, "the loader must select when the bid was read");
  assert.match(loader, /checkedAt: updatedAt\.toISOString\(\)/);
  const board = codeOnly("src/components/AuctionsBoard.tsx");
  assert.match(board, /Bid at last check/);
  assert.match(board, /timeAgo\(row\.checkedAt\)/);
  assert.doesNotMatch(codeOnly("src/app/auctions/page.tsx"), /Current bid/);
});

test("Auctions: the EU board names eBay Spain, not a non-existent 'eBay Europe'", () => {
  assert.equal(EBAY_SITE_LABEL.EU, "eBay Spain");
  const page = codeOnly("src/app/auctions/page.tsx");
  assert.doesNotMatch(page, /eBay \{info\.label\}/);
  assert.match(page, /EBAY_SITE_LABEL\[market\]/);
});
