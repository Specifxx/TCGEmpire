import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AUCTION_MARKETS,
  AUCTION_PAGE_CAP,
  AUCTION_ROW_CAP,
  AUCTION_WINDOW_HOURS,
  AUCTION_MIN_USD_CENTS,
} from "../src/lib/ebay-auctions";
import { EBAY_MAX_LIMIT, EBAY_MARKETPLACE, AUCTION_JUNK } from "../src/lib/ebay";
import { COUNTRY_LIST } from "../src/lib/country";
import { usdCentsToCountry } from "../src/lib/fx";

// ─────────────────────────────────────────────────────────────────────────────
// /auctions — the live eBay auction board (2026-09-16).
//
// THE THING THESE TESTS EXIST TO PROTECT: an auction feature was deleted from
// this codebase on 2026-08-20 because it cost ~960 eBay Browse calls a day
// (~120 chase printings × 2 markets, per card), and its removal is what funded
// dropping the singles value floor from $10 to $5. The replacement is only
// defensible because it asks a different question — "what is live in this
// market", one call for up to 200 lots — so the per-card shape must never creep
// back in, and the sweep's cost must stay a modelled number rather than an
// assumption. tests/affiliate-priority.test.ts owns the budget arithmetic; this
// file owns the shape.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LIB = "src/lib/ebay-auctions.ts";
const PAGE = "src/app/auctions/page.tsx";
const BOARD = "src/components/AuctionsBoard.tsx";
const WORKFLOW = ".github/workflows/refresh-auctions.yml";

// ── The search itself ────────────────────────────────────────────────────────

test("the sweep is market-wide, never per-card — the shape that made the old pass unaffordable", () => {
  const code = codeOnly(read(LIB));
  // No card identity anywhere in the sweep: no catalogue read, no card loop, no
  // per-card query builder. If any of these appear, the cost model in
  // affiliate-priority.test.ts (markets × pages, flat in catalogue size) is
  // wrong and the feature is back to being priced per printing.
  assert.doesNotMatch(code, /prisma\.card\b/, "the sweep must not read the card catalogue");
  assert.doesNotMatch(code, /searchEbayLowest|buildQuery|eBayWorthSearching/, "no per-card search path");
  assert.doesNotMatch(code, /collectorNumber|setCode/, "nothing here is scoped to a card");
});

test("it asks eBay for auctions, soonest-ending, at Browse's maximum page size", () => {
  const code = codeOnly(read("src/lib/ebay.ts"));
  const fn = code.slice(code.indexOf("export async function searchEbayAuctions"));
  // Verified against eBay's Browse API OpenAPI spec (Baseline v1.20.4) — auctions
  // are NOT returned by default, so a missing/renamed filter here silently
  // returns fixed-price listings and the whole board becomes wrong-but-plausible.
  assert.match(fn, /filters = \["buyingOptions:\{AUCTION\}"\]/, "auctions are not returned without this filter");
  assert.match(fn, /sort:\s*"endingSoonest"/, "the board's default order comes from eBay, not a client sort");
  assert.match(fn, /limit:\s*String\(limit\)/);
  assert.equal(EBAY_MAX_LIMIT, 200, "Browse's documented limit ceiling — raising this past 200 is an API error");
});

test("the window and price floor are pushed to eBay in its documented filter syntax", () => {
  const code = codeOnly(read("src/lib/ebay.ts"));
  const fn = code.slice(code.indexOf("export async function searchEbayAuctions"));
  // Syntax from eBay's Buy API field-filters reference. Each is wrong in a
  // different silent way: a malformed itemEndDate range returns EVERYTHING, and
  // a price filter without priceCurrency is rejected outright ("this filter must
  // be used with the priceCurrency filter").
  assert.match(fn, /itemEndDate:\[\$\{ebayInstant\(now\)\}\.\.\$\{ebayInstant\(/, "two-dot range, both bounds");
  assert.match(fn, /price:\[\$\{\(opts\.minPriceCents \/ 100\)\.toFixed\(2\)\}\]/, "whole units, not cents");
  assert.match(fn, /priceCurrency:\$\{opts\.currency\}/, "price is invalid without its currency");
  // filter values are comma-separated within the one `filter` parameter
  assert.match(fn, /filter: filters\.join\(","\)/);
});

test("the end-date timestamp matches eBay's documented shape, with no milliseconds", () => {
  const code = codeOnly(read("src/lib/ebay.ts"));
  assert.match(code, /function ebayInstant[\s\S]*?toISOString\(\)\.slice\(0, 19\)/);
  // Prove the shape rather than trusting the slice: 2026-09-16T04:21:00Z.
  const sample = `${new Date(Date.UTC(2026, 8, 16, 4, 21, 0)).toISOString().slice(0, 19)}Z`;
  assert.equal(sample, "2026-09-16T04:21:00Z");
  assert.doesNotMatch(sample, /\.\d{3}Z$/, "the reference's examples carry no milliseconds");
});

test("the closing window is re-checked locally, because its failure mode is 'returns everything'", () => {
  const code = codeOnly(read("src/lib/ebay.ts"));
  const fn = code.slice(code.indexOf("export async function searchEbayAuctions"));
  assert.match(fn, /if \(horizon != null && endsAt\.getTime\(\) > horizon\) continue/);
  // Deliberately NOT re-checked for price: that would mean re-deriving the
  // currency locally, and getting that wrong is worse than the bug it guards.
  assert.doesNotMatch(fn, /currentBidCents < opts\.minPriceCents|bid < opts\.minPriceCents/);
});

test("the auction-only response fields are read under their real eBay names", () => {
  const fn = codeOnly(read("src/lib/ebay.ts")).slice(
    codeOnly(read("src/lib/ebay.ts")).indexOf("export async function searchEbayAuctions"),
  );
  // These four are documented as "returned for auction items" only. A typo in
  // any of them yields a row that looks fine and is empty where it matters.
  for (const field of ["currentBidPrice", "bidCount", "itemEndDate", "buyingOptions"]) {
    assert.match(fn, new RegExp(`\\b${field}\\b`), `must read it.${field}`);
  }
});

test("every call is metered against the shared eBay budget", () => {
  const fn = codeOnly(read("src/lib/ebay.ts")).slice(
    codeOnly(read("src/lib/ebay.ts")).indexOf("export async function searchEbayAuctions"),
  );
  // spend() is what stops the board from eating the price importer's quota; a
  // 429 must also latch rateLimited so the sweep stops rather than hammering on.
  assert.match(fn, /if \(!spend\(\)\)/, "no call may be made without spending from the budget");
  assert.match(fn, /res\.status === 429[\s\S]{0,80}rateLimited = true/, "a 429 must latch the rate-limit flag");
});

test("a lot with no usable clock or no bid amount is dropped, not defaulted", () => {
  const fn = codeOnly(read("src/lib/ebay.ts")).slice(
    codeOnly(read("src/lib/ebay.ts")).indexOf("export async function searchEbayAuctions"),
  );
  // A countdown IS the product here. A row with a fabricated or missing end time
  // would render as a live auction that is not one.
  assert.match(fn, /if \(!endsAt \|\| Number\.isNaN\(endsAt\.getTime\(\)\) \|\| endsAt\.getTime\(\) <= now\) continue/);
  assert.match(fn, /if \(bid == null\) continue/);
});

test("lots and sealed product are NOT filtered out — that exclusion belongs to the price table", () => {
  // Asserted against real titles, not against the pattern's source: a source
  // grep cannot tell "booster box" (wanted) from "deck box" (an empty
  // accessory), because one contains the other.
  //
  // NOT_A_SINGLE exists to stop a bundle being quoted as one card's PRICE. On an
  // auction board a sealed box or a bulk lot is exactly what someone came to
  // find, so reusing that list here would hide the best lots on the page.
  const wanted = [
    "Riftbound Origins Booster Box Sealed",
    "Riftbound OGN Bulk Lot 200 Cards",
    "Riftbound Vendetta Bundle Sealed New",
    "Riftbound Akali Rogue Assassin Signature 189/166",
    "Riftbound Jinx PSA 10 Gem Mint",
  ];
  for (const title of wanted) {
    assert.ok(!AUCTION_JUNK.test(title), `"${title}" is a legitimate auction, not junk`);
  }
  const junk = [
    "Riftbound Proxy Custom Made Akali Alt Art",
    "Riftbound Orica Jinx Full Art",
    "Riftbound Keychain Ahri Novelty",
    "Riftbound Playmat Official",
    "Riftbound Deck Box Empty",
    "Riftbound Card Sleeves 60ct",
  ];
  for (const title of junk) {
    assert.ok(AUCTION_JUNK.test(title), `"${title}" must be excluded`);
  }
});

// ── Cost ─────────────────────────────────────────────────────────────────────

test("the sweep's worst-case cost is a small, flat share of the daily Browse quota", () => {
  const perSweep = AUCTION_MARKETS.length * AUCTION_PAGE_CAP;
  const cron = /- cron: "0 \*\/(\d+) \* \* \*"/.exec(read(WORKFLOW));
  assert.ok(cron, "the workflow must keep an every-N-hours cron");
  const perDay = perSweep * (24 / Number(cron[1]));
  // 5,000/day limit, 600 reserve, ~2,850 already spent by the price and sealed
  // importers. 250 is a deliberately tight ceiling: the deleted per-card pass
  // cost ~960/day, and anything approaching that is the same mistake again.
  assert.ok(
    perDay <= 250,
    `the auction sweep would cost ~${perDay} Browse calls/day — the per-card pass deleted on 2026-08-20 cost ~960, so this must stay far below it`,
  );
});

test("one page per market — a filtered board cannot fill a second one", () => {
  // The only real quota saving the 2026-09-16 filters bought. eBay bills per
  // CALL, not per result, so asking for fewer lots is not itself cheaper; what
  // the window and floor make safe is the halved page cap, because 200
  // qualifying lots in one marketplace cannot happen.
  assert.equal(AUCTION_PAGE_CAP, 1, "raising this needs a much looser filter and a re-run of the cost model");
});

test("the board is filtered to closing-today, high-value lots, and both bars are tunable without a deploy", () => {
  assert.equal(AUCTION_WINDOW_HOURS, 24, "the owner's window: lots closing today");
  assert.equal(AUCTION_MIN_USD_CENTS, 50_000, "the owner's floor: US$500 current bid");
  const code = read(LIB);
  // Same escape hatch as EBAY_MIN_VALUE_CENTS in price-import.ts: these are
  // thresholds someone will want to move off a real lot count, not a guess.
  assert.match(code, /process\.env\.EBAY_AUCTION_WINDOW_HOURS/);
  assert.match(code, /process\.env\.EBAY_AUCTION_MIN_USD_CENTS/);
});

test("the USD floor is converted per market, so it is one real threshold and not five", () => {
  const code = codeOnly(read(LIB));
  // eBay evaluates its price filter in the currency you name, and every
  // marketplace quotes its own — passing a bare USD number would silently mean
  // ~£500 in the UK (a third higher) and ~A$500 in Australia (a third lower).
  assert.match(code, /const currency = currencyOf\(market\)/);
  assert.match(code, /usdCentsToCountry\(AUCTION_MIN_USD_CENTS, market\)/);
  assert.match(code, /minPriceCents,\s*\n\s*currency,/, "both must reach the search together");
  // Sanity-check the conversion actually moves the bar in the right direction.
  const gbp = usdCentsToCountry(AUCTION_MIN_USD_CENTS, "UK");
  const aud = usdCentsToCountry(AUCTION_MIN_USD_CENTS, "AU");
  assert.ok(gbp < AUCTION_MIN_USD_CENTS, `£ bar should be below the USD figure, got ${gbp}`);
  assert.ok(aud > AUCTION_MIN_USD_CENTS, `A$ bar should be above the USD figure, got ${aud}`);
});

test("the page query bounds the window too, so the page's promise is true of the data", () => {
  const code = codeOnly(read(LIB));
  assert.match(
    code,
    /endsAt: \{ gt: new Date\(\), lte: new Date\(Date\.now\(\) \+ AUCTION_WINDOW_HOURS \* 3600_000\) \}/,
    "loosening the window then tightening it must not leave long-dated rows on a board that says they can't be there",
  );
});

test("an empty board explains the filter instead of implying eBay has no auctions", () => {
  const src = read(BOARD);
  // A narrow board that renders "no auctions" reads as broken. It must name both
  // bars, and the page must hand it the numbers rather than hardcoding them.
  assert.match(src, /Nothing above US\$\{minUsd\} closing in the next \{windowHours\} hours/);
  assert.match(read(PAGE), /windowHours=\{AUCTION_WINDOW_HOURS\} minUsd=\{minUsd\}/);
});

test("the page states the current-bid consequence of a price floor", () => {
  // The honest limit of filtering on price: a chase card opening at $1 is
  // invisible here until bidding carries it past the floor. Saying so is the
  // difference between a board that is narrow and one that is misleading.
  const page = read(PAGE);
  assert.match(page, /current bid<\/em>/, "must say the bar is the current bid, not the expected hammer price");
  assert.match(page, /already hot/i);
});

test("pagination stops early instead of paying for pages that cannot exist", () => {
  const code = codeOnly(read(LIB));
  assert.match(
    code,
    /if \(items\.length < EBAY_MAX_LIMIT\) break/,
    "a short page is the last page — asking again spends a call to learn nothing",
  );
  assert.match(code, /if \(isEbayRateLimited\(\)\) break/, "must abandon the market when the budget latches");
});

test("every priced market is swept, so switching market never lands on a dead page", () => {
  assert.deepEqual(
    [...AUCTION_MARKETS].sort(),
    COUNTRY_LIST.map((c) => c.code).sort(),
    "the board offers a MarketSwitcher over every market, so every market must be swept",
  );
  for (const m of AUCTION_MARKETS) {
    assert.ok(EBAY_MARKETPLACE[m], `${m} must map to an eBay marketplace id`);
  }
});

// ── Persistence ──────────────────────────────────────────────────────────────

test("a failed sweep never deletes a market's rows", () => {
  const code = codeOnly(read(LIB));
  // "No answer" (no token, spent budget, 429, 5xx) must not be read as "this
  // market has no auctions" — that would empty the board on any eBay hiccup.
  assert.match(code, /if \(!ok\) return \{ market, found: 0, ok: false \}/);
  const deleteAt = code.indexOf("deleteMany");
  const bailAt = code.indexOf("if (!ok) return");
  assert.ok(bailAt > -1 && deleteAt > bailAt, "the delete must sit after the failed-sweep bail-out");
});

test("ended lots are deleted rather than aged out, so the table cannot grow without bound", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /deleteMany\(\{\s*where: \{ country: market, endsAt: \{ lt:/, "ended rows must be removed");
});

test("rows are upserted on (itemId, country) so a re-seen lot updates instead of duplicating", () => {
  assert.match(codeOnly(read(LIB)), /where: \{ itemId_country: \{ itemId: row\.itemId, country: market \} \}/);
  assert.match(read("prisma/schema.prisma"), /model EbayAuctionListing[\s\S]*?@@unique\(\[itemId, country\]\)/);
});

test("the auction table stores no cardId — reverse-matching a title to a card would be a guess", () => {
  const model = /model EbayAuctionListing \{[\s\S]*?\n\}/.exec(read("prisma/schema.prisma"))?.[0] ?? "";
  assert.ok(model, "expected the EbayAuctionListing model");
  assert.doesNotMatch(model, /cardId/, "a wrong card link is worse than no card link");
  // …but it does store the clock, unlike its fixed-price sibling.
  assert.match(model, /endsAt\s+DateTime/);
  assert.match(model, /bidCount\s+Int/);
});

// ── The page ─────────────────────────────────────────────────────────────────

test("the page's cache TTL is not lower than the page's own revalidate (egress rule 5)", () => {
  const page = read(PAGE);
  const pageTtl = Number(/export const revalidate = (\d+)/.exec(page)![1]);
  const loaderTtl = Number(/revalidate: (\d+), tags: \[CONTENT_TAG\]/.exec(read(LIB))![1]);
  // The rule that cost five database projects: an unstable_cache revalidate
  // applies to the whole route segment, so a shorter one here would drag every
  // query on this page to that cadence.
  assert.ok(
    loaderTtl >= pageTtl,
    `the auction loader caches for ${loaderTtl}s on a page that revalidates every ${pageTtl}s`,
  );
});

test("the per-request read is capped and narrowly selected", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /take: AUCTION_ROW_CAP/, "egress rule 3 — an unbounded row count on a live page");
  assert.ok(AUCTION_ROW_CAP <= 200, `${AUCTION_ROW_CAP} rows is too many to ship to a client component`);
  assert.match(code, /select: \{/, "must select only the fields the board renders");
  assert.match(code, /\.catch\(\(\) => \[\]\)/, "a missing table or DB blip must render the empty state, not a 500");
});

test("the countdown ticks client-side, and the first render matches the server's", () => {
  const src = read(BOARD);
  assert.match(src, /^"use client";/m);
  // now === null until mounted: a Date.now() during render differs between the
  // server and the browser and hydration-mismatches on every row.
  assert.match(src, /useState<number \| null>\(null\)/);
  assert.match(src, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);
  assert.match(src, /now == null \? rows :/, "the pre-clock render must be the server's own payload");
  assert.match(src, /function endLabelUtc/, "the pre-clock label must be timezone-deterministic");
});

test("the board is a tile grid matching the database's, not a row list", () => {
  // Owner's call 2026-09-16: "make the auctions a tiled format like the
  // database". The grid classes are asserted against /browse's OWN string
  // rather than a copy, so the two surfaces cannot drift into looking like
  // different sites — which was the entire point of the change.
  // The string itself changed on 2026-09-23 (lg:4 / xl:5 -> an auto-fill
  // 10.5rem grid) because the permanent rail had squeezed /browse to 94px tiles.
  const board = read(BOARD);
  const browseGrid = /grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-\[repeat\(auto-fill,minmax\(10\.5rem,1fr\)\)\]/;
  assert.match(read("src/app/browse/page.tsx"), browseGrid, "expected /browse's grid to still be the reference");
  assert.match(board, browseGrid, "the auction board must use the database's own grid");
  assert.match(board, /aspect-\[5\/7\]/, "tiles must share CardTile's aspect box so rows line up");
  assert.doesNotMatch(board, /<ul className="space-y-2">/, "the old vertical row list must be gone");
});

test("a seller's photo is never cropped — object-contain, unlike CardTile's own scans", () => {
  // The one deliberate difference from CardTile. Our card scans are uniform and
  // crop safely; an eBay photo is the seller's, and cropping it can cut off the
  // grading label or the corner wear someone is bidding against.
  const board = read(BOARD);
  assert.match(board, /object-contain/, "listing photos must letterbox rather than crop");
  assert.doesNotMatch(board, /object-cover/, "cropping a marketplace photo can hide what is being bid on");
});

test("filters cover bid activity, including the owner's 'more than 1 bid' case", () => {
  const board = read(BOARD);
  // "2+" is the one that matters and was asked for by name: a single bid is
  // often just the seller's opening price being met once, while two or more
  // means somebody is actually competing. The visible chips are terse so three
  // filter groups fit above the fold on a phone, so the ARIA label is what
  // carries the meaning — and it is pinned here in the owner's own words.
  assert.match(board, /aria: "More than 1 bid", min: 2/, "must offer a more-than-one-bid filter");
  assert.match(board, /aria: "At least 1 bid", min: 1/);
  assert.match(board, /min: HOT_BID_COUNT/, "the contested threshold must reuse the badge's own constant");
  assert.match(board, /r\.bidCount < minBids/, "the filter must actually apply the minimum");
  // Every terse chip must still be announced in full, and the group needs its
  // visible "Bids" prefix for anyone reading "2+" with no screen reader.
  assert.match(board, /ariaLabel=\{b\.aria\}/, "terse chips must carry a full accessible name");
  assert.match(board, />Bids<\/span>/, "the group needs a visible prefix to make '2+' legible");
  // Plus the two independent toggles.
  assert.match(board, /&lt; 1h left/);
  assert.match(board, /ariaLabel="Only lots closing within the hour"/);
  assert.match(board, /ariaLabel="Only lots that also have a Buy It Now price"/);
  assert.match(board, /binOnly && r\.buyItNowCents == null/);
  // A filtered-to-empty board must offer a way back out, or it reads as broken.
  assert.match(board, /Clear filters/);
});

test("the closing-soon filter cannot break hydration", () => {
  // Every other filter is time-independent, so it produces the same result on
  // the server and in the browser. This one is not: it must be inert until the
  // clock starts, or the first client render disagrees with the server's HTML.
  const board = read(BOARD);
  assert.match(
    board,
    /closingOnly && now != null &&/,
    "the time-based filter must be gated on the clock having started",
  );
});

test("bids are shown in the marketplace's own currency, never converted at import time", () => {
  assert.match(read(BOARD), /formatMoney\(row\.currentBidCents, row\.currency\)/);
  const lib = codeOnly(read(LIB));
  assert.doesNotMatch(lib, /convert|fxRate|exchangeRate/i, "a bid converted at import time is wrong by the time it is read");
});

test("outbound lots carry the eBay affiliate disclosure and their own retailer key", () => {
  const src = read(BOARD);
  // EPN has flagged surfaces carrying eBay links with no disclosure — the same
  // contract tests/ebay-picks.test.ts enforces for the card carousel.
  assert.match(src, /<AffiliateDisclosure partner="ebay"/);
  assert.match(src, /retailer="ebay_auction"/, "needs its own key to measure against the other eBay surfaces");
});

test("no Offer/AggregateOffer markup — a third-party bid changes by the minute", () => {
  // codeOnly, because the page's own comment legitimately explains why this
  // markup is absent and would otherwise match the check for it.
  const page = codeOnly(read(PAGE));
  assert.match(page, /"@type": "ItemList"/, "an ItemList of what is rendered is fine");
  assert.doesNotMatch(page, /AggregateOffer|"@type": "Offer"/, "we are not the seller and the price is not stable");
});

test("the page is discoverable: sitemap, nav groups and the desktop rail all point at it", () => {
  // The third check was Navbar.tsx until 2026-09-21. The header's own
  // /auctions link is gone: SideNav now runs the full page height from lg and
  // carries every NAV_GROUPS link, so a desktop copy in the header was a
  // duplicate of a link one column to its left. The GUARANTEE is unchanged —
  // a desktop visitor can still reach this page without opening anything —
  // so the check follows it to the surface that now makes it true.
  const checks: [string, RegExp][] = [
    ["src/lib/sitemap-sections.ts", /\$\{SITE_URL\}\/auctions`/],
    ["src/components/nav-groups.ts", /href: "\/auctions"/],
    ["src/components/SideNav.tsx", /NAV_GROUPS\.map/],
  ];
  for (const [path, pattern] of checks) {
    assert.match(read(path), pattern, `${path} must link to /auctions`);
  }
  // Its lastmod is the real sweep time, not a hand-maintained date that would
  // freeze while the board turned over every few hours.
  assert.match(read("src/lib/sitemap-sections.ts"), /auctionSweepDay/);
  assert.doesNotMatch(read("src/lib/static-page-dates.ts"), /"\/auctions"/);
});

test("the sweep has its own workflow and its own concurrency group", () => {
  const wf = read(WORKFLOW);
  // Separate from refresh-prices so a long price import can't delay the board
  // and a failed sweep can't fail the price run.
  assert.match(wf, /concurrency:\s*\n\s*group: refresh-auctions/);
  assert.match(wf, /npx tsx scripts\/import-ebay-auctions\.ts/);
  assert.match(wf, /prisma db push --skip-generate/, "EbayAuctionListing is new — the job must sync the schema");
  // The flag as a flag, not the word inside the error message that tells a human
  // where to run a destructive push by hand.
  assert.doesNotMatch(
    wf,
    /db push[^\n]*--accept-data-loss/,
    "additive only on a schedule — a destructive change must stop the run, not drop a column",
  );
});
