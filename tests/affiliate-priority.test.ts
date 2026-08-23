import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  orderCardsForEbay, ebayMarketsForDay, EBAY_ROTATING_MARKETS, EBAY_ALWAYS_MARKETS,
} from "../src/lib/price-import";
import {
  pricePrioritySetCodes, PRICE_PRIORITY_WINDOW_DAYS, SETS, isFallbackRetailer, EBAY_CA_RETAILER,
  ALL_FALLBACK_RETAILERS, AU_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS,
  SG_FALLBACK_RETAILERS, CA_FALLBACK_RETAILERS,
} from "../src/lib/constants";
import { affiliateUrl, affiliateSubId, ebayAffiliateUrl, ebaySearchUrl, ebayLabel, EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";
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

test("sets released before we started dating them are never prioritised", () => {
  // OGN/OGS/SFD/UNL predate the priority mechanic and carry no date at all.
  for (const s of SETS.filter((x) => !["VEN", "RAD"].includes(x.code))) {
    assert.equal(s.releasedOn, undefined, `${s.code} unexpectedly has a release date`);
  }
  assert.deepEqual(pricePrioritySetCodes(day("2026-08-03")), ["VEN"]);
});

// ── An ANNOUNCED set must not claim the quota before it ships ────────────────
// Radiance has a real, published street date sitting in the future. The window
// test is closed at both ends precisely so that date grants nothing until it
// arrives — otherwise a set with zero rows in the database would have outranked
// the set people are actually buying, for months.
test("Radiance gets no priority before its release date, and gets it after", () => {
  const RAD = SETS.find((s) => s.code === "RAD")!;
  assert.equal(RAD.releasedOn, "2026-10-23");
  assert.equal(RAD.comingSoon, true);

  // Announced but unreleased — Vendetta still owns the window here.
  assert.deepEqual(pricePrioritySetCodes(day("2026-08-04")), ["VEN"]);
  assert.deepEqual(pricePrioritySetCodes(plusDays("2026-10-23", -1)), []);

  // Release day and through the window.
  assert.deepEqual(pricePrioritySetCodes(day("2026-10-23")), ["RAD"]);
  assert.deepEqual(pricePrioritySetCodes(plusDays("2026-10-23", PRICE_PRIORITY_WINDOW_DAYS - 1)), ["RAD"]);

  // …and it expires on its own, exactly like Vendetta's did.
  assert.deepEqual(pricePrioritySetCodes(plusDays("2026-10-23", PRICE_PRIORITY_WINDOW_DAYS + 1)), []);
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
  // The market prefix is unchanged; the link SHAPE is now appended. See below.
  assert.equal(u.searchParams.get("customid"), "rc-uk-product");
});

// ─────────────────────────────────────────────────────────────────────────────
// The sub-id records whether the buyer landed on a PRODUCT or a SEARCH page.
// ─────────────────────────────────────────────────────────────────────────────
// An item link drops the buyer on the exact card, one click from checkout; a
// search link drops them on a result list they have to work through. Those
// should not convert alike — but while both reported the same customid there was
// no way to prove it, which is precisely the question raised when US conversion
// (0.78%) was compared with AU (3%). The shape is derived from the URL rather
// than passed in by callers because eight separate places build eBay links, and
// a flag each of them had to remember would be wrong somewhere within a month.
test("an item link and a search link report DIFFERENT customids", () => {
  const item = new URL(ebayAffiliateUrl("https://www.ebay.com/itm/123456789", "ebay_us"));
  const search = new URL(ebayAffiliateUrl("https://www.ebay.com/sch/i.html?_nkw=Riftbound", "ebay_us"));

  // NOTE the underscore: affiliateSubId's allow-list keeps `_`, so the retailer
  // key passes through as `ebay_us`, not `ebay-us`.
  assert.equal(item.searchParams.get("customid"), "rc-us-ebay_us-product");
  assert.equal(search.searchParams.get("customid"), "rc-us-ebay_us-search");
  assert.notEqual(item.searchParams.get("customid"), search.searchParams.get("customid"));
});

test("every market tags the shape, and the market prefix survives", () => {
  for (const [url, want] of [
    ["https://www.ebay.com.au/itm/1", "rc-au-product"],
    ["https://www.ebay.com/itm/1", "rc-us-product"],
    ["https://www.ebay.co.uk/sch/i.html?_nkw=x", "rc-uk-search"],
    ["https://www.ebay.com.sg/sch/i.html?_nkw=x", "rc-sg-search"],
    ["https://www.ebay.ca/itm/1", "rc-ca-product"],
  ] as const) {
    assert.equal(new URL(ebayAffiliateUrl(url)).searchParams.get("customid"), want, url);
  }
});

test("a URL that is neither /itm/ nor /sch/ is left unlabelled rather than guessed", () => {
  // e.g. a seller storefront or a category page — calling it "product" would
  // corrupt the very comparison this exists to make.
  const u = new URL(ebayAffiliateUrl("https://www.ebay.com/str/someseller"));
  assert.equal(u.searchParams.get("customid"), "rc-us");
});

// ─────────────────────────────────────────────────────────────────────────────
// Singapore has no EPN program (confirmed against EPN's own help docs,
// 2026-08-14) — every ebay.com.sg URL reroutes onto the verified US rotation
// instead of being tagged with an invented siteid=216 rotation that nothing
// backs. customid keeps reporting it as SG so EPN's by-custom-id report can
// still show what that traffic is worth.
// ─────────────────────────────────────────────────────────────────────────────

test("ebaySearchUrl(SG) builds an ebay.com link on the verified US rotation, tagged rc-sg", () => {
  const u = new URL(ebaySearchUrl("SG", "Riftbound"));
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.searchParams.get("siteid"), "0");
  // The US rotation id — see EBAY_MARKETS["ebay.com"] — not a Singapore-specific
  // one, because there isn't one.
  assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.match(u.searchParams.get("customid")!, /^rc-sg\b/);
});

test("a real ebay.com.sg LISTING url (from the Browse API's EBAY_SG marketplace search, not one we built) reroutes the same way", () => {
  // mapEbayItem() in lib/ebay.ts calls ebayAffiliateUrl on whatever host eBay's
  // own API response carries — this must not depend on the caller knowing the
  // URL is SG-shaped, since ebay.ts never threads a "country" through to here.
  // No explicit source: the "product" shape below is auto-derived from the
  // /itm/ path (see ebayAffiliateUrl), not something a caller passes in.
  const u = new URL(ebayAffiliateUrl("https://www.ebay.com.sg/itm/137597929650"));
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.pathname, "/itm/137597929650", "item id must survive the reroute unchanged");
  assert.equal(u.searchParams.get("siteid"), "0");
  assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
  assert.equal(u.searchParams.get("customid"), "rc-sg-product");
});

test("SG's eBay label no longer claims a Singapore-specific site", () => {
  // The link lands on ebay.com now (see above), so a "Singapore" label would
  // describe a destination the click never visits. Matches US, the site it
  // actually shares.
  assert.equal(ebayLabel("SG"), ebayLabel("US"));
  assert.doesNotMatch(ebayLabel("SG"), /singapore/i);
});

test("UK and CA keep their own distinct, non-US rotations (only SG reroutes)", () => {
  const us = new URL(ebayAffiliateUrl("https://www.ebay.com/itm/1"));
  const uk = new URL(ebayAffiliateUrl("https://www.ebay.co.uk/itm/1"));
  const ca = new URL(ebayAffiliateUrl("https://www.ebay.ca/itm/1"));
  assert.equal(uk.hostname, "www.ebay.co.uk");
  assert.equal(ca.hostname, "www.ebay.ca");
  assert.notEqual(uk.searchParams.get("siteid"), us.searchParams.get("siteid"));
  assert.notEqual(uk.searchParams.get("mkrid"), us.searchParams.get("mkrid"));
  assert.notEqual(ca.searchParams.get("siteid"), us.searchParams.get("siteid"));
  assert.notEqual(ca.searchParams.get("mkrid"), us.searchParams.get("mkrid"));
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
// as a store would let it undercut the real AU stores the site exists to
// compare, on a price that excludes international postage and duty.

test("AUSTRALIA: TCGplayer is never a comparison row or a counted store", () => {
  const rows = [tcgRow("AU", "tcgplayer_au")];
  const v = computeMarket(rows, "AU");
  assert.equal(v.prices.length, 0);
  assert.equal(v.storeCount, 0);
  assert.equal(v.lowest, null, "a converted price must not set the AU 'from' price");
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
  for (const list of [AU_FALLBACK_RETAILERS, UK_FALLBACK_RETAILERS, SG_FALLBACK_RETAILERS, CA_FALLBACK_RETAILERS]) {
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

const FULL_CATALOGUE = 1429; // every card — measured 2026-08-20, up from 1400 at the VEN launch measurement
// Cards that actually get a Browse call, after eBayWorthSearching drops
// Common/Uncommon base prints and anything under the value floor. Measured
// from a forced production run on 2026-08-20 AT THE $10 FLOOR (the same day
// it dropped from $20, freed by Germany's removal from EBAY_ROTATING_MARKETS
// — see EBAY_ALWAYS_MARKETS in price-import.ts): the log line read
// "347 of 1429 cards searched — 1082 skipped (1016 under $10 TCGplayer US,
// rest Common/Uncommon base prints); 115 kept with no TCGplayer price". Up
// from 280 at the old $20 floor — real growth, but far short of the ~187-card
// ceiling the pre-measurement estimate floated; TCG price distributions are
// more front-loaded near the floor than that estimate assumed.
//
// STALE AGAIN: the floor dropped a second time the same day, $10→$5, funded
// by removing the auction pass (see the "auctions" note on dailyCalls below).
// The real $5-floor count is not yet measured — read it off the next run's
// "eBay catalogue: X of Y cards searched" log line and update this constant
// then. Left at the $10 measurement as a safe (understated) floor in the
// meantime, same reasoning as the $20→$10 gap before it.
const CATALOGUE = 347;
// NOT re-measured alongside CATALOGUE above — the 2026-08-20 forced run was
// the FULL/catalogue pass (ebay_force bypasses the staleness gate and always
// runs the full pass), not the twice-daily CHASE-ONLY pass that reports this
// number on its own log line. Left at its last real measurement (still under
// the $20 floor); update it from that pass's own log line next time it fires
// due, or force it specifically to check sooner.
const CHASE_PRINTINGS = 179; // promo+signature+overnumbered at or above the floor
// US 53 + AU 33 + UK 11 + SG 7, before the loose-pack cut — measured before the
// 2026-08-20 CA addition and the once-a-day gate; both are directional changes
// (CA adds a fifth market's worth of groups, the gate halves the daily total)
// that have not yet been re-measured against a live run.
const SEALED_PER_RUN = 104;
const SPENDABLE = 4400;      // 5000 daily limit − 600 reserve
const SECONDS_PER_CARD = 0.75;
// A card whose strict query returns nothing costs a SECOND Browse call for the
// no-"Riftbound" retry. Applies to singles only (the sealed search makes exactly
// one call), and is the single largest source of error in this model.
const RETRY_RATE = 0.25;
// Read from the workflow rather than copied, so raising one without the other
// cannot silently reintroduce the mid-market kill.
const JOB_TIMEOUT_MIN = Number(
  /timeout-minutes:\s*(\d+)/.exec(readFileSync(".github/workflows/refresh-prices.yml", "utf8"))![1],
);
const STORE_IMPORT_MIN = 18; // the store pass that runs before eBay in the same job

// Days to exercise. Keyed off the ALWAYS list, never off EBAY_ROTATING_MARKETS:
// that list is now empty, and `day < EBAY_ROTATING_MARKETS.length` would run
// every loop below ZERO times and pass vacuously — the tests would still be
// green while asserting nothing at all.
const CYCLE_DAYS = Math.max(EBAY_ALWAYS_MARKETS.length, EBAY_ROTATING_MARKETS.length, 1) * 2;

/**
 * Browse calls for one whole DAY, not one pass.
 *
 * Modelling the catalogue alone is what made the old numbers wrong: the chase
 * pass is handed EBAY_ALWAYS_MARKETS directly, separate from the catalogue
 * pass's own market list. A market added to ALWAYS therefore multiplies both
 * passes, not one.
 *
 * The chase-AUCTION pass was a third term here (always × 120 × 2 ≈ 960
 * calls/day) until 2026-08-20, when the auctions feature — refreshEbayAuctions
 * and the EbayAuction model — was removed outright. `sealed` is SEALED_PER_RUN
 * × 1, not × 2, for the same reason it used to need the ×2: sealed's eBay pass
 * gained its own 20h staleness gate the same day (see "sealed" below) and no
 * longer runs unconditionally on both the 07:00 and 19:00 imports.
 */
function dailyCalls(day: number): number {
  const markets = ebayMarketsForDay(day).length;
  const always = EBAY_ALWAYS_MARKETS.length;
  const singles = markets * CATALOGUE + always * CHASE_PRINTINGS;
  const sealed = SEALED_PER_RUN;
  return Math.round(singles * (1 + RETRY_RATE)) + sealed;
}

test("a whole day of eBay passes fits inside the Browse budget", () => {
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const calls = dailyCalls(day);
    assert.ok(calls <= SPENDABLE, `day ${day}: ${calls} calls exceeds the ${SPENDABLE} budget`);
  }
});

test("auctions are gone and sealed's eBay pass is gated to once a day", () => {
  // Pins the two 2026-08-20 removals dailyCalls above depends on: no auction
  // pass left to undercount, and sealed's eBay search now self-gates instead of
  // running unconditionally on both daily imports (the old failure mode this
  // test used to guard: a budget that looks comfortable turns out overspent in
  // production because a twice-daily pass was modelled as once).
  const priceImport = readFileSync("src/lib/price-import.ts", "utf8");
  // Code patterns only, not prose — this file's own history comments legitimately
  // name the removed function/model when explaining why the quota model changed.
  assert.ok(
    !/(?:async )?function refreshEbayAuctions|prisma\.ebayAuction\b/.test(priceImport),
    "the refreshEbayAuctions function and its prisma.ebayAuction calls must be fully removed from price-import.ts",
  );
  const sealed = readFileSync("src/lib/sealed-import.ts", "utf8");
  assert.match(
    sealed,
    /lastSeen/,
    "sealed's eBay pass must read a staleness signal — dailyCalls models it as running once a day, not twice",
  );
});

test("a day's markets fit inside the job timeout", () => {
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const markets = ebayMarketsForDay(day).length;
    // The morning job is the long one: stores, then the full catalogue across
    // every market.
    const cards = markets * CATALOGUE;
    const mins = STORE_IMPORT_MIN + (cards * SECONDS_PER_CARD) / 60;
    assert.ok(mins <= JOB_TIMEOUT_MIN, `day ${day}: ~${mins.toFixed(0)} min exceeds the ${JOB_TIMEOUT_MIN} min timeout`);
  }
});

test("four daily markets fit ONLY because of the value floor", () => {
  // UK and SG were demoted to a rotation on 2026-08-03 because 4 × the full
  // catalogue did not fit, and promoted back on 2026-08-08 because the value
  // floor ($20, then $10, now $5, all on 2026-08-20 — see CATALOGUE above) shrank the
  // searched set. Both halves are asserted: if the floor is ever removed or
  // bypassed, four daily markets stop fitting and this fails rather than
  // silently truncating a market's entire pass again.
  assert.ok(
    4 * FULL_CATALOGUE > SPENDABLE,
    "4 markets × the FULL catalogue should still not fit — that constraint has not gone away",
  );
  assert.ok(
    4 * CATALOGUE <= SPENDABLE,
    "4 markets × the SEARCHED catalogue must fit, or UK/SG cannot be daily markets",
  );
});

test("every market refreshes every day — none is on a rotation", () => {
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const codes = ebayMarketsForDay(day).map((m) => m.country);
    for (const m of EBAY_ALWAYS_MARKETS) {
      assert.ok(codes.includes(m.country), `day ${day} missing ${m.country}`);
    }
  }
});

test("no always-market has permanent first claim on the budget", () => {
  // Search ORDER decides who starves. refreshEbayMarkets walks the array and
  // breaks the moment the budget latches, and a truncated market's whole pass is
  // discarded — so the market that is consistently LAST is the one that
  // consistently gets nothing. With ~4,200 calls against ~4,280 spendable, plus a
  // second Browse call for every card whose strict query returns zero,
  // overspending is routine rather than exceptional.
  //
  // A fixed [AU, US] order meant AU was never once dropped and US always was.
  // Every always-market must therefore lead on some day.
  //
  // This is why the ordering ROTATES rather than alternating with reverse():
  // reverse() yields only two orderings, so with four markets the middle two
  // could never lead and starvation would simply move to a new pair.
  const leaders = new Set<string>();
  for (let day = 0; day < CYCLE_DAYS; day++) leaders.add(ebayMarketsForDay(day)[0].country);
  for (const m of EBAY_ALWAYS_MARKETS) {
    assert.ok(leaders.has(m.country), `${m.country} never searches first — it can be starved indefinitely`);
  }
});

test("every always-market takes the position most exposed to starvation within the always block", () => {
  // The mirror of the test above and the one that actually matters: leading is
  // only worth something if the riskiest trailing slot is shared too.
  //
  // EBAY_ROTATING_MARKETS is empty, so every scheduled market IS an always-market
  // and this reduces to "who sits last in the whole day's list" — but it is
  // written generically (excluding a trailing rotating slot, when one exists) so
  // it keeps meaning something if a market is ever demoted to a rotation again:
  // the one dropped if the always pass alone runs out of budget before even
  // reaching the rotating market's slot.
  const trailers = new Set<string>();
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const codes = ebayMarketsForDay(day).map((m) => m.country);
    const alwaysCodes = EBAY_ROTATING_MARKETS.length > 0 ? codes.slice(0, -1) : codes;
    trailers.add(alwaysCodes[alwaysCodes.length - 1]);
  }
  for (const m of EBAY_ALWAYS_MARKETS) {
    assert.ok(trailers.has(m.country), `${m.country} never sits last within the always block`);
  }
});

test("the always-markets always precede any rotating one", () => {
  // A rotating market is the intended sacrifice when quota runs short: it is at
  // most ~48h stale by design, whereas an always-market missing its slot is a
  // coverage gap in a market we promise daily prices for.
  //
  // EBAY_ROTATING_MARKETS is empty, so the branch below is the only one that
  // fires today — kept (rather than deleted) so this test stays correct the
  // moment a market is ever demoted to the rotation again.
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const codes = ebayMarketsForDay(day).map((m) => m.country);
    if (EBAY_ROTATING_MARKETS.length === 0) {
      for (const c of codes) {
        assert.ok(
          EBAY_ALWAYS_MARKETS.some((m) => m.country === c),
          `day ${day}: ${c} is scheduled but is not an always-market`,
        );
      }
      continue;
    }
    const rotatingAt = codes.findIndex((c) => EBAY_ROTATING_MARKETS.some((m) => m.country === c));
    assert.equal(rotatingAt, codes.length - 1, `day ${day}: rotating market must be last, got ${codes.join("→")}`);
  }
});

test("a day's market set is the same whichever order it is in", () => {
  // Rotating priority must not change WHICH markets run — only their order.
  // The rotation dropping or duplicating a market is the exact failure a naive
  // slice-based rotation produces on a negative or out-of-range index.
  const expected = EBAY_ALWAYS_MARKETS.length + (EBAY_ROTATING_MARKETS.length > 0 ? 1 : 0);
  for (let day = 0; day < CYCLE_DAYS; day++) {
    const codes = ebayMarketsForDay(day).map((m) => m.country).sort();
    assert.equal(new Set(codes).size, codes.length, `day ${day}: duplicate market in ${codes.join(",")}`);
    assert.equal(codes.length, expected, `day ${day}: wrong market count — ${codes.join(",")}`);
  }
  // Negative indices must not silently shorten the list (see the modulo guard).
  for (const day of [-1, -3, -7]) {
    assert.equal(ebayMarketsForDay(day).length, expected, `day ${day}: negative index changed the market count`);
  }
});

test("production uses the same market list the budget tests assert on", () => {
  // refreshEbayMarkets used to assemble `[...ALWAYS, todays]` inline, so the pure
  // function these tests pin was not the one that actually ran — the two could
  // drift, and an ordering fix could land only in the tested copy.
  const src = readFileSync("src/lib/price-import.ts", "utf8");
  assert.match(
    src,
    /markets = ebayMarketsForDay\(dayIndex\)/,
    "the eBay pass must build its market list from ebayMarketsForDay",
  );
});

test("eBay staleness is judged per market, not across all markets at once", () => {
  // A global "did any eBay market refresh recently?" gate let a successful AU
  // write mark the whole pass fresh, so a US market dropped by the budget could
  // not be repaired by the next run — it stayed stale until AU itself aged out.
  const src = readFileSync("src/lib/price-import.ts", "utf8");
  assert.match(src, /groupBy\(\{\s*by: \["retailer"\]/, "staleness must be grouped by retailer");
  assert.ok(
    !/findFirst\(\{\s*where: \{ retailer: \{ startsWith: "ebay" \} \},\s*orderBy: \{ lastSeen: "desc" \}/.test(src),
    "the global newest-eBay-row staleness check is back — it hides a starved market",
  );
});

test("every market we search comes round, and none is ever skipped forever", () => {
  const seen = new Set<string>();
  for (let day = 0; day < CYCLE_DAYS; day++) {
    for (const m of ebayMarketsForDay(day)) seen.add(m.country);
  }
  // Both lists, so this keeps working whether a market is daily or rotating.
  for (const m of [...EBAY_ALWAYS_MARKETS, ...EBAY_ROTATING_MARKETS]) {
    assert.ok(seen.has(m.country), `${m.country} never scheduled`);
  }
  // The four markets the site actually sells into. UK and SG were on a rotation
  // between 2026-08-03 and 2026-08-08 and were each ~48h stale by design; they
  // are daily again, and a silent demotion would show up here.
  for (const c of ["AU", "US", "UK", "SG"]) {
    assert.ok(seen.has(c), `${c} is not searched at all`);
  }
});

test("CANADA costs no quota — it is not a searched market", () => {
  // CA reuses the US result set converted to CAD: eBay US ships to Canada, so
  // the listings are substantially the same and a separate ~1,400-call pass for
  // the smallest market is not worth the budget.
  for (let day = 0; day < CYCLE_DAYS; day++) {
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
