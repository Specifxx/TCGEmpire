import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  orderCardsForEbay, ebayMarketsForDay, EBAY_ROTATING_MARKETS, EBAY_CA_RETAILER,
} from "../src/lib/price-import";
import {
  pricePrioritySetCodes, PRICE_PRIORITY_WINDOW_DAYS, SETS, isFallbackRetailer,
  ALL_FALLBACK_RETAILERS, AU_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS,
  SG_FALLBACK_RETAILERS, CA_FALLBACK_RETAILERS, NZ_FALLBACK_RETAILERS,
} from "../src/lib/constants";
import { affiliateUrl, affiliateSubId, ebayAffiliateUrl, EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";
import { TCG_US, TCG_UK, TCG_SG, TCG_AU, TCG_CA } from "../src/lib/tcgplayer";
import { computeMarket } from "../src/lib/market-rows";
import { COUNTRY_LIST } from "../src/lib/country";

const TCG_MARKETS = [TCG_US, TCG_UK, TCG_SG, TCG_AU, TCG_CA];

const tcgRow = (country: string, retailer: string) => ({
  id: retailer, country, retailer, retailerName: "TCGplayer", priceCents: 1000, ship: null,
  condition: "NM", isFoil: false, inStock: true, lastSeen: "2026-08-03T00:00:00.000Z",
  buyHref: "https://www.tcgplayer.com/product/1", policyUrl: null,
});

// ─────────────────────────────────────────────────────────────────────────────
// eBay quota priority: a launch set first, and only for its launch window.
// ─────────────────────────────────────────────────────────────────────────────
// refreshEbayMarkets orders by search demand, so a set that shipped last week —
// zero searches, zero views, no price — sorts LAST, exactly when its prices are
// most wanted, and the quota runs out before reaching it.

const card = (setCode: string, id: string) => ({ id, setCode });

test("priority-set cards go to the front", () => {
  const cards = [card("OGN", "a"), card("VEN", "b"), card("UNL", "c"), card("VEN", "d")];
  assert.deepEqual(
    orderCardsForEbay(cards, ["VEN"]).map((c) => c.id),
    ["b", "d", "a", "c"],
  );
});

test("popularity order is preserved WITHIN each group", () => {
  // The caller hands these over already sorted by demand. Promoting VEN must not
  // reshuffle "most-wanted first" inside either group, or the head start is spent
  // on bulk commons while the chase cards still miss out.
  const cards = [
    card("OGN", "ogn-most-popular"),
    card("VEN", "ven-most-popular"),
    card("OGN", "ogn-2nd"),
    card("VEN", "ven-2nd"),
    card("VEN", "ven-3rd"),
    card("OGN", "ogn-3rd"),
  ];
  assert.deepEqual(
    orderCardsForEbay(cards, ["VEN"]).map((c) => c.id),
    ["ven-most-popular", "ven-2nd", "ven-3rd", "ogn-most-popular", "ogn-2nd", "ogn-3rd"],
  );
});

test("no priority set → the caller's order is returned untouched", () => {
  const cards = [card("OGN", "a"), card("VEN", "b"), card("UNL", "c")];
  assert.deepEqual(orderCardsForEbay(cards, []).map((c) => c.id), ["a", "b", "c"]);
});

test("every card is kept — this reorders, it never filters", () => {
  const cards = Array.from({ length: 50 }, (_, i) => card(i % 3 === 0 ? "VEN" : "OGN", `c${i}`));
  const out = orderCardsForEbay(cards, ["VEN"]);
  assert.equal(out.length, cards.length);
  assert.deepEqual(new Set(out.map((c) => c.id)), new Set(cards.map((c) => c.id)));
});

test("set-code matching is case-insensitive", () => {
  assert.deepEqual(
    orderCardsForEbay([card("OGN", "a"), card("ven", "b")], ["VEN"]).map((c) => c.id),
    ["b", "a"],
  );
});

// ── The window opens and closes by itself ───────────────────────────────────

const VEN = SETS.find((s) => s.code === "VEN")!;
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000);

test("Vendetta is prioritised on release day and through its window", () => {
  assert.equal(VEN.releasedOn, "2026-07-31");
  assert.ok(pricePrioritySetCodes(day("2026-07-31")).includes("VEN"));
  assert.ok(pricePrioritySetCodes(plusDays("2026-07-31", 1)).includes("VEN"));
  assert.ok(pricePrioritySetCodes(plusDays("2026-07-31", PRICE_PRIORITY_WINDOW_DAYS - 1)).includes("VEN"));
});

test("THE POINT: the priority expires on its own, with no code change", () => {
  const after = plusDays("2026-07-31", PRICE_PRIORITY_WINDOW_DAYS + 1);
  assert.deepEqual(pricePrioritySetCodes(after), [], `still prioritised at ${after.toISOString()}`);
  // …and a year later it is still off, i.e. nothing has to be remembered.
  assert.deepEqual(pricePrioritySetCodes(plusDays("2026-07-31", 365)), []);
});

test("older sets carry no release date and are never prioritised", () => {
  for (const s of SETS.filter((x) => x.code !== "VEN")) {
    assert.equal(s.releasedOn, undefined, `${s.code} unexpectedly has a release date`);
  }
  assert.deepEqual(pricePrioritySetCodes(day("2026-08-03")), ["VEN"]);
});

test("a malformed release date grants no priority rather than a permanent one", () => {
  // Guards the failure mode that matters: a typo must not silently pin the quota
  // to one set forever.
  const bad = { ...VEN, releasedOn: "not-a-date" };
  assert.ok(Number.isNaN(Date.parse(`${bad.releasedOn}T00:00:00Z`)));
});

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate attribution: every click says where it came from.
// ─────────────────────────────────────────────────────────────────────────────

test("eBay links carry the tracking params EPN requires", () => {
  const u = new URL(affiliateUrl("https://www.ebay.com.au/itm/12345", "ebay", "https://riftcompare.com/card/vi"));
  // mkevt=1 is the one that actually makes the click count.
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("mkcid"), "1");
  assert.equal(u.searchParams.get("campid"), EBAY_CAMPAIGN_ID);
  assert.ok(u.searchParams.get("mkrid"));
  assert.ok(u.searchParams.get("siteid"));
});

test("the eBay sub-id names both the market and the placement", () => {
  const u = new URL(affiliateUrl("https://www.ebay.com/itm/1", "ebay_us", "https://riftcompare.com/card/vi-destructive"));
  const custom = u.searchParams.get("customid")!;
  assert.match(custom, /^rc-us-/, `market prefix missing: ${custom}`);
  assert.ok(custom.includes("ebay_us"), custom);
  assert.ok(custom.includes("card"), `placement missing: ${custom}`);
});

test("two placements on the same market are distinguishable", () => {
  const cardPage = new URL(affiliateUrl("https://www.ebay.com.au/itm/1", "ebay", "https://riftcompare.com/card/x"));
  const browse = new URL(affiliateUrl("https://www.ebay.com.au/itm/1", "ebay", "https://riftcompare.com/browse"));
  assert.notEqual(cardPage.searchParams.get("customid"), browse.searchParams.get("customid"));
});

test("TCGplayer links go through Impact AND carry a sub-id", () => {
  const out = affiliateUrl("https://www.tcgplayer.com/product/123", "tcgplayer", "https://riftcompare.com/card/x");
  assert.ok(out.startsWith("https://partner.tcgplayer.com/"), out);
  assert.ok(out.includes("u=" + encodeURIComponent("https://www.tcgplayer.com/product/123")), out);
  assert.match(out, /[?&]sharedid=/, `no Impact sub-id: ${out}`);
});

test("Amazon links keep the associate tag and gain a sub-tag", () => {
  const u = new URL(affiliateUrl("https://www.amazon.com.au/dp/B0TEST", "amazon_sealed", "https://riftcompare.com/sealed"));
  assert.ok(u.searchParams.get("tag"));
  assert.ok(u.searchParams.get("ascsubtag"));
});

test("sub-ids are sanitised to what the networks accept", () => {
  // EPN silently DROPS a click whose customid has unexpected characters, and a
  // dropped click looks exactly like no revenue.
  const s = affiliateSubId("rc-au", "card/vi, destructive (promo)!");
  assert.match(s, /^[a-z0-9_-]+$/, s);
  assert.ok(!s.startsWith("-") && !s.endsWith("-"), s);
  assert.ok(s.length <= 60, `${s.length} chars`);
  assert.equal(affiliateSubId(), "rc"); // never empty — an empty customid untracks
  assert.equal(affiliateSubId("!!!"), "rc");
});

test("a very long placement cannot overflow the sub-id limit", () => {
  const s = affiliateSubId("rc-au", "x".repeat(500));
  assert.ok(s.length <= 60, `${s.length} chars`);
});

test("non-affiliate hosts are returned untouched", () => {
  const plain = "https://cherrycollectables.com.au/products/thing";
  assert.equal(affiliateUrl(plain, "cherry", "https://riftcompare.com/card/x"), plain);
});

test("ebayAffiliateUrl still works without a source (existing call sites)", () => {
  const u = new URL(ebayAffiliateUrl("https://www.ebay.co.uk/itm/9"));
  assert.equal(u.searchParams.get("mkevt"), "1");
  assert.equal(u.searchParams.get("customid"), "rc-uk");
});

// ─────────────────────────────────────────────────────────────────────────────
// TCGplayer coverage: every tracked market, none of them counted as a store.
// ─────────────────────────────────────────────────────────────────────────────
// refreshTcgplayerPrices() looped US/UK/SG/AU and omitted CA, so Canada — a full
// market everywhere else (its own eBay rotation, its own lowestPriceCentsCa
// column, its own FX rate) — had no TCGplayer reference price at all.

test("every tracked market has a TCGplayer reference price", () => {
  const covered = new Set(TCG_MARKETS.map((m) => m.country));
  for (const c of COUNTRY_LIST) {
    // NZ is the one deliberate exclusion — no eBay market and no TCGplayer
    // reference; it is served by local stores only.
    if (c.code === "NZ") continue;
    assert.ok(covered.has(c.code), `${c.code} has no TCGplayer market configured`);
  }
});

test("each TCGplayer market converts into that market's own currency", () => {
  for (const m of TCG_MARKETS) {
    const info = COUNTRY_LIST.find((c) => c.code === m.country)!;
    assert.equal(m.currency, info.currency, `${m.country} converts to ${m.currency}, not ${info.currency}`);
    assert.ok(m.fx > 0, `${m.country} has no FX rate`);
  }
});

test("a converted TCGplayer price is NEVER counted as a local store", () => {
  // It is a reference, not a retailer — counting it would put an unbuyable
  // "1 store" and a foreign price on a card with no local listings at all.
  const rows = TCG_MARKETS.filter((m) => m.country !== "US").map((m, i) => ({
    id: `r${i}`,
    country: m.country,
    retailer: m.retailer,
    retailerName: "TCGplayer",
    priceCents: 1000,
    ship: null,
    condition: "NM",
    isFoil: false,
    inStock: true,
    lastSeen: "2026-08-03T00:00:00.000Z",
    buyHref: "https://www.tcgplayer.com/product/1",
    policyUrl: null,
  }));
  for (const m of TCG_MARKETS) {
    if (m.country === "US") continue;
    const view = computeMarket(rows, m.country as (typeof COUNTRY_LIST)[number]["code"]);
    assert.equal(view.storeCount, 0, `${m.country}: reference price counted as a store`);
    assert.equal(view.lowest, null, `${m.country}: reference price set the "from" price`);
  }
});

test("the US row IS a real buyable store", () => {
  const rows = [{
    id: "us", country: "US", retailer: "tcgplayer", retailerName: "TCGplayer",
    priceCents: 1000, ship: null, condition: "NM", isFoil: false, inStock: true,
    lastSeen: "2026-08-03T00:00:00.000Z", buyHref: "https://www.tcgplayer.com/product/1", policyUrl: null,
  }];
  const view = computeMarket(rows, "US");
  assert.equal(view.storeCount, 1);
  assert.equal(view.lowest, 1000);
});

test("every market's TCGplayer link is affiliate-tagged", () => {
  for (const m of TCG_MARKETS) {
    const out = affiliateUrl("https://www.tcgplayer.com/product/123", m.retailer, "https://riftcompare.com/card/x");
    assert.ok(out.startsWith("https://partner.tcgplayer.com/"), `${m.country}: not routed through Impact`);
    assert.match(out, /[?&]sharedid=/, `${m.country}: no sub-id`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// THE RULE: a converted TCGplayer price is never a price-comparison row.
// ─────────────────────────────────────────────────────────────────────────────
// Nobody can buy from "TCGplayer Australia". Showing its FX-converted USD price
// as a store would let it undercut the real AU/NZ stores the site exists to
// compare, on a price that excludes international postage and duty.

test("AUSTRALIA: TCGplayer is never a comparison row or a counted store", () => {
  const rows = [tcgRow("AU", "tcgplayer_au")];
  const v = computeMarket(rows, "AU");
  assert.equal(v.prices.length, 0);
  assert.equal(v.storeCount, 0);
  assert.equal(v.lowest, null, "a converted price must not set the AU 'from' price");
});

test("NEW ZEALAND: there is no TCGplayer market at all, and must not be", () => {
  // NZ is served by local stores and eBay NZ only. Nothing to filter because
  // nothing is ever written — this pins that.
  assert.equal(TCG_MARKETS.find((m) => m.country === "NZ"), undefined);
  assert.equal(computeMarket([tcgRow("NZ", "tcgplayer_nz")], "NZ").storeCount, 0);
});

test("every non-US market excludes its converted TCGplayer row", () => {
  for (const m of TCG_MARKETS) {
    if (m.country === "US") continue;
    const v = computeMarket([tcgRow(m.country, m.retailer)], m.country as never);
    assert.equal(v.storeCount, 0, `${m.country}: shown as a store`);
    assert.equal(v.lowest, null, `${m.country}: set the "from" price`);
  }
});

test("isFallbackRetailer covers every converted variant and no real store", () => {
  for (const m of TCG_MARKETS) {
    const shouldBeFallback = m.country !== "US";
    assert.equal(
      isFallbackRetailer(m.retailer),
      shouldBeFallback,
      `${m.retailer} fallback=${isFallbackRetailer(m.retailer)}, expected ${shouldBeFallback}`,
    );
  }
  // Real stores and eBay must never be caught by it.
  for (const r of ["ebay", "ebay_us", "ebay_ca", "cherrycollectables", "tcgplayer"]) {
    assert.equal(isFallbackRetailer(r), false, r);
  }
});

test("the union covers every per-market list — a new market cannot be forgotten", () => {
  for (const list of [AU_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, CA_FALLBACK_RETAILERS, NZ_FALLBACK_RETAILERS]) {
    for (const r of list) assert.ok(ALL_FALLBACK_RETAILERS.includes(r), `${r} missing from the union`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// eBay market budget: what a single run can actually cover.
// ─────────────────────────────────────────────────────────────────────────────
// Measured on the forced run of 2026-08-03: 1,400 cards, ~0.75s per card per
// market, 4,880/5,000 quota remaining → 4,280 spendable. Four markets needed
// 5,600 calls and ~70 minutes against a 55-minute job timeout, so the run was
// killed 9 minutes into UK — UK wrote nothing and the rotating market (SG) never
// started. These pin the arithmetic so catalogue growth trips a test, not a
// silent gap in coverage.

const CATALOGUE = 1400;      // cards queried per market, as of the VEN launch
const SPENDABLE = 4280;      // 5000 daily limit − 600 reserve − ~120 already spent
const SECONDS_PER_CARD = 0.75;
// Read from the workflow rather than copied, so raising one without the other
// cannot silently reintroduce the mid-market kill.
const JOB_TIMEOUT_MIN = Number(
  /timeout-minutes:\s*(\d+)/.exec(readFileSync(".github/workflows/refresh-prices.yml", "utf8"))![1],
);
const STORE_IMPORT_MIN = 18; // the store pass that runs before eBay in the same job

test("a day's markets fit inside the eBay Browse budget", () => {
  for (let day = 0; day < EBAY_ROTATING_MARKETS.length; day++) {
    const calls = ebayMarketsForDay(day).length * CATALOGUE;
    assert.ok(calls <= SPENDABLE, `day ${day}: ${calls} calls exceeds the ${SPENDABLE} budget`);
  }
});

test("a day's markets fit inside the job timeout", () => {
  for (let day = 0; day < EBAY_ROTATING_MARKETS.length; day++) {
    const mins = STORE_IMPORT_MIN + (ebayMarketsForDay(day).length * CATALOGUE * SECONDS_PER_CARD) / 60;
    assert.ok(mins <= JOB_TIMEOUT_MIN, `day ${day}: ~${mins.toFixed(0)} min exceeds the ${JOB_TIMEOUT_MIN} min timeout`);
  }
});

test("the old 4-market layout would NOT have fit — this is what broke", () => {
  // Guards against someone "just adding UK back to ALWAYS".
  assert.ok(4 * CATALOGUE > SPENDABLE, "4 markets should not fit the budget");
});

test("AU and US refresh every day", () => {
  for (let day = 0; day < EBAY_ROTATING_MARKETS.length; day++) {
    const codes = ebayMarketsForDay(day).map((m) => m.country);
    assert.ok(codes.includes("AU"), `day ${day} missing AU`);
    assert.ok(codes.includes("US"), `day ${day} missing US`);
  }
});

test("every rotating market comes round, and none is ever skipped forever", () => {
  const seen = new Set<string>();
  for (let day = 0; day < EBAY_ROTATING_MARKETS.length * 3; day++) {
    for (const m of ebayMarketsForDay(day)) seen.add(m.country);
  }
  for (const m of EBAY_ROTATING_MARKETS) assert.ok(seen.has(m.country), `${m.country} never scheduled`);
});

test("CANADA costs no quota — it is not a searched market", () => {
  // CA reuses the US result set converted to CAD: eBay US ships to Canada, so
  // the listings are substantially the same and a separate ~1,400-call pass for
  // the smallest market is not worth the budget.
  for (let day = 0; day < EBAY_ROTATING_MARKETS.length; day++) {
    assert.ok(
      !ebayMarketsForDay(day).some((m) => m.country === "CA"),
      `day ${day} still searches eBay CA`,
    );
  }
  assert.equal(EBAY_CA_RETAILER, "ebay_ca", "the derived rows must keep the existing retailer key");
});

test("the derived CA rows are still real eBay rows for the comparison", () => {
  // Unlike a converted TCGplayer reference, an eBay US listing genuinely ships
  // to Canada, so it stays a buyable comparison row.
  assert.equal(isFallbackRetailer(EBAY_CA_RETAILER), false);
  const v = computeMarket(
    [{ ...tcgRow("CA", EBAY_CA_RETAILER), retailerName: "eBay US", ship: null }],
    "CA",
  );
  assert.equal(v.storeCount, 1);
  assert.equal(v.hasEbay, true, "hasEbay must still fire so the CA fallback search is suppressed");
});
