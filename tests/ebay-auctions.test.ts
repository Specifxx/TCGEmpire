import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cardIdentityStages, listingMatchesCard, isGradedListing, type EbayCardIdentity } from "../src/lib/ebay";
import { formatTimeLeft } from "../src/components/EbayAuctionsLive";
import { AUCTION_CARDS_PER_MARKET, AUCTION_MIN_VALUE_CENTS, EBAY_ALWAYS_MARKETS, eBayWorthSearching } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// Live eBay auctions on chase cards.
//
// The failure modes here are all quiet ones — the page still renders, it just
// says something untrue:
//   1. A bid reaching the price table. `lowestPriceCents` feeds price history,
//      the market index, price alerts, the rise predictor, meta-deck costs, the
//      screener and the Product/Offer JSON-LD. A $12 bid on a $180 card in
//      RetailerPrice corrupts every one of them and publishes a false price.
//   2. A closed auction still on screen with a live affiliate link — worse than
//      showing nothing, because it claims to be live.
//   3. Identity drift. Auctions reuse the price search's card-matching rules; two
//      copies would diverge, and the auction copy silently (nobody audits a
//      widget as closely as the price table).
//   4. Quota. The auction pass shares a budget the price pass barely fits into.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const CARD: EbayCardIdentity = {
  name: "Akali, Rogue Assassin",
  setCode: "VEN",
  number: "189",
  total: "166",
  isSignature: true,
};
const BASE: EbayCardIdentity = {
  name: "Jinx, Loose Cannon",
  setCode: "VEN",
  number: "042",
  total: "166",
  isSignature: false,
};
const item = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  price: { value: "100.00", currency: "USD" },
  ...extra,
});

// ── 1. A bid must never become a price ───────────────────────────────────────

test("auctions are written to EbayAuction, never RetailerPrice", () => {
  const src = read("src/lib/price-import.ts");
  const pass = src.slice(src.indexOf("export async function refreshEbayAuctions"));
  const body = pass.slice(0, pass.indexOf("\n}\n"));
  assert.ok(body.includes("prisma.ebayAuction"), "the auction pass must write EbayAuction rows");
  assert.ok(
    !/prisma\.retailerPrice\.(create|update|upsert)/.test(body),
    "the auction pass must never write RetailerPrice — a current bid is not a price",
  );
  assert.ok(
    !/lowestPriceCents/.test(body),
    "the auction pass must not touch the card price columns the whole site reads",
  );
});

test("the auction schema is a separate table with its own end date", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model EbayAuction \{/, "EbayAuction model missing");
  const model = schema.slice(schema.indexOf("model EbayAuction {"));
  const body = model.slice(0, model.indexOf("\n}"));
  for (const field of ["currentBidCents", "bidCount", "endsAt", "isGraded", "itemId"]) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `EbayAuction.${field} missing`);
  }
  // Without an end date nothing can expire the row — the countdown, the sweep
  // and the read filter all key off it.
  assert.match(body, /endsAt\s+DateTime\b(?!\?)/, "endsAt must be non-nullable");
});

// ── 2. Nothing closed may ever be shown ──────────────────────────────────────

test("ended auctions are filtered at every layer that can serve them", () => {
  // Three independent layers, because a pass runs daily and auctions close
  // continuously — any single guard leaves a window.
  const importer = read("src/lib/price-import.ts");
  assert.match(
    importer,
    /ebayAuction\.deleteMany\(\{ where: \{ endsAt: \{ lte: new Date\(\) \} \} \}\)/,
    "the importer must sweep auctions that have closed",
  );

  const loader = read("src/components/EbayAuctions.tsx");
  assert.match(loader, /endsAt: \{ gt: new Date\(\) \}/, "the read must exclude closed auctions");

  const view = read("src/components/EbayAuctionsLive.tsx");
  assert.match(
    view,
    /new Date\(a\.endsAt\)\.getTime\(\) > now/,
    "the renderer must drop an auction that closes while the page is open",
  );
});

test("the countdown reads down to the minute and terminates", () => {
  assert.equal(formatTimeLeft(-1), "ended");
  assert.equal(formatTimeLeft(0), "ended");
  assert.equal(formatTimeLeft(12 * 60_000), "12m left");
  assert.equal(formatTimeLeft(59 * 60_000), "59m left");
  assert.equal(formatTimeLeft(60 * 60_000), "1h left");
  assert.equal(formatTimeLeft(47 * 3_600_000), "47h left");
  assert.equal(formatTimeLeft(72 * 3_600_000), "3d left");
});

test("the view re-ticks so a countdown cannot freeze", () => {
  const view = read("src/components/EbayAuctionsLive.tsx");
  assert.match(view, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 60_000\)/, "must re-render on a timer");
  assert.match(view, /clearInterval/, "the timer must be cleared on unmount");
  // Elapsed time computed during SSR is frozen into ISR-cached HTML and will
  // disagree with the first client render.
  assert.match(view, /if \(!mounted \|\| live\.length === 0\) return null;/, "must not render pre-mount");
});

// ── 3. Identity rules are shared with the price search ───────────────────────

test("the price search and the auction search share one identity definition", () => {
  const src = read("src/lib/ebay.ts");
  assert.match(
    src,
    /for \(const \{ stage, pred \} of cardIdentityStages\(card, \{ allowGraded: Boolean\(captureGraded\) \}\)\)/,
    "searchEbayLowest must use the shared stages",
  );
  assert.match(src, /cardIdentityStages\(card, \{ allowGraded: true \}\)/, "searchEbayAuctions must use them too");
});

test("identity rejects the same wrong listings under a bid as under a price", () => {
  assert.ok(!listingMatchesCard(item("Riftbound VEN bulk lot 50 cards"), BASE), "lots");
  assert.ok(!listingMatchesCard(item("Riftbound Vendetta booster box sealed"), BASE), "sealed product");
  assert.ok(!listingMatchesCard(item("Jinx Loose Cannon VEN 042/166 中文"), BASE), "foreign printing");
  assert.ok(!listingMatchesCard(item("Jinx Loose Cannon VEN 042/166", { itemLocation: { country: "CN" } }), BASE), "ships from CN");
  assert.ok(!listingMatchesCard(item("Jinx Loose Cannon VEN 099/166"), BASE), "wrong collector number");
  assert.ok(!listingMatchesCard(item("Jinx Loose Cannon VEN 042/166 Promo"), BASE), "promo vs base");
  assert.ok(!listingMatchesCard({ title: "Jinx Loose Cannon VEN 042/166" }, BASE), "no price");
});

test("graded is kept for auctions and still rejected for prices", () => {
  const slab = item("PSA 10 Akali Rogue Assassin VEN Signature Overnumbered");
  const priceStages = cardIdentityStages(CARD);
  const auctionStages = cardIdentityStages(CARD, { allowGraded: true });

  assert.ok(!priceStages.every((s) => s.pred(slab)), "a slab must not become a price row — it trades far above raw");
  assert.ok(auctionStages.every((s) => s.pred(slab)), "a slab must survive the auction filter — no store lists graded at all");
  assert.ok(isGradedListing(slab.title));
  assert.ok(!isGradedListing("Akali Rogue Assassin VEN Signature"));
});

test("allowGraded relaxes ONLY grading, not the lot/sealed/foreign guards", () => {
  const stages = cardIdentityStages(BASE, { allowGraded: true });
  const rejects = (t: string, extra?: Record<string, unknown>) => !stages.every((s) => s.pred(item(t, extra)));
  assert.ok(rejects("Riftbound VEN bulk lot 50 cards"), "lots still rejected");
  assert.ok(rejects("Riftbound Vendetta booster box sealed"), "sealed still rejected");
  assert.ok(rejects("Jinx Loose Cannon VEN 042/166 简体"), "foreign still rejected");
  assert.ok(rejects("Jinx Loose Cannon VEN 042/166 playmat"), "accessories still rejected");
});

// ── 4. Quota ─────────────────────────────────────────────────────────────────

test("the auction pass is bounded and cannot outgrow the price pass", () => {
  // Counted per DAY. The pass runs after BOTH the full and the chase import, so
  // one card here is AUCTION_CARDS_PER_MARKET × markets × 2 calls — the factor
  // that was missing when this was first sized against a single run.
  const RUNS_PER_DAY = 2;
  const auctionCalls = AUCTION_CARDS_PER_MARKET * EBAY_ALWAYS_MARKETS.length * RUNS_PER_DAY;
  // Singles per day: the searched catalogue across every market, plus the chase
  // printings again in the evening. See tests/affiliate-priority.test.ts for the
  // provenance of these figures.
  const SINGLES_PER_DAY = 280 * EBAY_ALWAYS_MARKETS.length + 179 * EBAY_ALWAYS_MARKETS.length;
  assert.ok(
    auctionCalls < SINGLES_PER_DAY,
    `auctions cost ${auctionCalls} calls/day — prices (${SINGLES_PER_DAY}) must remain the larger claim on the budget`,
  );
  assert.ok(AUCTION_MIN_VALUE_CENTS > 0, "a value floor must exist — a bid on a $2 card says nothing");
});

test("the auction cap stays inside the inventory that actually exists", () => {
  // The binding constraint is the eligible POOL, not quota: cards at or above
  // AUCTION_MIN_VALUE_CENTS in the market's own currency, measured on production
  // 2026-08-08 as AU 200 / US 204 / UK 156 / SG 174. Setting the cap past the
  // smallest pool spends calls querying a tier that has no more cards in it.
  const SMALLEST_POOL = 156; // UK
  assert.ok(
    AUCTION_CARDS_PER_MARKET <= SMALLEST_POOL,
    `cap of ${AUCTION_CARDS_PER_MARKET} exceeds the smallest chase tier (${SMALLEST_POOL} cards) — the excess finds nothing`,
  );
  assert.ok(AUCTION_CARDS_PER_MARKET >= 60, "the cap should not silently regress below its original value");
});

test("a day's auctions leave room for the evening chase pass", () => {
  // The quota is DAILY, so the auction pass following the 07:00 import competes
  // with the 19:00 chase pass for the same allowance. "Auctions run last and
  // yield" holds within a run and says nothing about across runs — this is the
  // guard for that gap.
  const n = EBAY_ALWAYS_MARKETS.length;
  const SPENDABLE = 4400;
  const auctions = AUCTION_CARDS_PER_MARKET * n * 2;
  const singles = Math.round((280 * n + 179 * n) * 1.25); // catalogue + chase, with retries
  const sealed = 104 * 2;
  assert.ok(
    auctions + singles + sealed <= SPENDABLE,
    `${auctions + singles + sealed} calls/day exceeds the ${SPENDABLE} budget — the evening chase pass would truncate`,
  );
});

test("auctions run after prices and yield the budget to them", () => {
  const src = read("src/lib/price-import.ts");
  const singlesAt = src.indexOf("await refreshEbayMarkets(");
  const auctionsAt = src.indexOf("await refreshEbayAuctions(");
  assert.ok(singlesAt > 0 && auctionsAt > 0, "could not locate both passes");
  assert.ok(auctionsAt > singlesAt, "the price pass must run first — prices win a budget tie");

  const pass = src.slice(src.indexOf("export async function refreshEbayAuctions"));
  assert.match(
    pass.slice(0, 400),
    /if \(!isEbayEnabled\(\) \|\| isEbayRateLimited\(\)\) return 0;/,
    "the auction pass must no-op when the budget is already spent",
  );
});

test("auctions use their own Browse call, not a relaxed price search", () => {
  const src = read("src/lib/ebay.ts");
  // Sharing the price call would be free but would let auction items — which
  // enter at a near-zero current bid under sort=price — crowd genuine
  // fixed-price listings out of a finite window on the priciest cards.
  assert.match(src, /filter: "buyingOptions:\{AUCTION\}"/, "auctions must filter to AUCTION");
  assert.match(src, /sort: "endingSoonest"/, "auctions must be ordered by deadline, not price");
  // Sliced to searchEbayLowest's own body — bounded by the next declaration
  // rather than a character count, so the assertion cannot start passing or
  // failing because a comment above it grew.
  const start = src.indexOf("export async function searchEbayLowest");
  const end = src.indexOf("export async function searchEbayAuctions");
  assert.ok(start > 0 && end > start, "could not bound searchEbayLowest");
  assert.match(
    src.slice(start, end),
    /filter: "buyingOptions:\{FIXED_PRICE\}"/,
    "the price search must still be fixed-price only",
  );
});

// ── Which cards get an eBay call at all ──────────────────────────────────────

test("base-rarity Commons and Uncommons are skipped in every market", () => {
  const base = { collectorNumber: "042/166", variant: null, isPromo: false };
  assert.equal(eBayWorthSearching({ ...base, rarity: "Common" }), false);
  assert.equal(eBayWorthSearching({ ...base, rarity: "Uncommon" }), false);
  assert.equal(eBayWorthSearching({ ...base, rarity: "Rare" }), true);
  assert.equal(eBayWorthSearching({ ...base, rarity: "Epic" }), true);
  assert.equal(eBayWorthSearching({ ...base, rarity: "Showcase" }), true);
});

test("a chase PRINT of a Common is still searched — the trap this filter must not fall into", () => {
  // import-vendetta stores an overnumbered/Signature print under the rarity of
  // the card it re-prints, and only alt-arts were ever reclassified (see
  // chasePrintRarity). Filtering the raw `rarity` column would therefore have
  // dropped exactly the chase prints most worth an eBay call — a Signature of a
  // Common is a chase card, not a bulk common.
  assert.equal(
    eBayWorthSearching({ rarity: "Common", collectorNumber: "189*/166", variant: null, isPromo: false }),
    true,
    "Signature print of a Common must still be searched",
  );
  assert.equal(
    eBayWorthSearching({ rarity: "Common", collectorNumber: "196/166", variant: null, isPromo: false }),
    true,
    "overnumbered print of a Common must still be searched",
  );
  assert.equal(
    eBayWorthSearching({ rarity: "Uncommon", collectorNumber: "021a/166", variant: "a", isPromo: false }),
    true,
    "alt-art print of an Uncommon must still be searched",
  );
  // Promos are ALWAYS searched, whatever the base card's rarity. chasePrintRarity
  // deliberately leaves a promo on its base rarity for the /browse filter, so a
  // promo of a Common resolves to "Common" — eBayWorthSearching special-cases
  // isPromo ahead of the rarity check rather than changing that convention. A
  // promo is a separate limited printing whose price is unrelated to the bulk
  // common it re-prints, and it is refreshed twice daily.
  assert.equal(
    eBayWorthSearching({ rarity: "Common", collectorNumber: "012/166", variant: null, isPromo: true }),
    true,
    "a promo of a Common must still be searched",
  );
  assert.equal(
    eBayWorthSearching({ rarity: "Uncommon", collectorNumber: "007/166", variant: null, isPromo: true }),
    true,
    "a promo of an Uncommon must still be searched",
  );
});

test("skipped cards keep an eBay buy path, just not a listing", () => {
  // The whole justification for skipping them is that they still get a search
  // link. Both surfaces gate purely on "no eBay row for this market", which is
  // now permanently true for these cards.
  const market = read("src/components/CardMarketSection.tsx");
  assert.match(market, /const ebay = m\.hasEbay \? null : ebaySearch\[country\] \?\? null;/);
  assert.match(market, /retailer="ebay_no_listing"/, "the card-page fallback must be tracked");

  const quick = read("src/components/QuickView.tsx");
  assert.match(quick, /prices !== null && ebayMkt && !hasEbay/);
  assert.match(quick, /retailer="ebay_no_listing"/, "the QuickView fallback must be tracked");
});

test("carousel rows for cards that leave the search set are swept", () => {
  // The per-market carousel delete is scoped to cards a market QUERIED, so a
  // card that stops being searched is never cleared by it again. Dropping ~45%
  // of the catalogue moves that many cards into exactly that state at once.
  const src = read("src/lib/price-import.ts");
  assert.match(
    src,
    /ebayAdListing\.deleteMany\(\{ where: \{ updatedAt: \{ lt: staleAdCutoff \} \} \}\)/,
    "stale carousel rows must be swept or skipped cards serve their last listings forever",
  );
});

// ── Placement ────────────────────────────────────────────────────────────────

test("the card page renders auctions outside the comparison table", () => {
  const page = read("src/app/card/[id]/page.tsx");
  // Auctions reach the card page through the tabbed eBay panel, which sits below
  // the comparison table rather than inside it.
  assert.match(page, /<EbayCardPanel cardId=\{card\.id\}/, "card page must render the eBay panel");
  const panel = read("src/components/EbayCardPanelLive.tsx");
  assert.match(panel, /<EbayAuctionsLive/, "the panel must include the auctions tab");
  const market = read("src/components/CardMarketSection.tsx");
  assert.ok(
    !market.includes("EbayAuction"),
    "the comparison table must not know auctions exist — that is what keeps a bid out of the ranking",
  );
});

test("every auction link is affiliate-tagged and click-tracked", () => {
  const view = read("src/components/EbayAuctionsLive.tsx");
  assert.match(view, /<OutboundLink/, "must use OutboundLink so the click is tracked");
  assert.match(view, /retailer="ebay_auction"/, "auction clicks need their own retailer key to be attributable");
  assert.match(view, /<AffiliateDisclosure partner="ebay"/, "an affiliate surface must carry its disclosure");
  const src = read("src/lib/ebay.ts");
  assert.match(src, /ebayAffiliateUrl\(it\.itemAffiliateWebUrl \?\? it\.itemWebUrl, "auction"\)/, "auction URLs must be tagged with a placement sub-id");
});
