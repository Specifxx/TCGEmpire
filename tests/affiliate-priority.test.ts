import { test } from "node:test";
import assert from "node:assert/strict";
import { orderCardsForEbay } from "../src/lib/price-import";
import { pricePrioritySetCodes, PRICE_PRIORITY_WINDOW_DAYS, SETS } from "../src/lib/constants";
import { affiliateUrl, affiliateSubId, ebayAffiliateUrl, EBAY_CAMPAIGN_ID } from "../src/lib/affiliate";

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
