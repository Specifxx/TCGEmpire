import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LIB = "src/lib/market-records.ts";
const PAGE = "src/app/market/records/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// All-time price records (/market/records).
//
// This is the one history read whose QUESTION is unbounded — "the highest price
// ever, for every card" — while every other read in price-history.ts is scoped
// to a window on purpose (see its WINDOW_DAYS note, cut from 35 to 21 days
// specifically to reduce history-DB egress). Answering it the same way movers
// does would pull the entire PriceHistory table on every recompute, which is
// exactly the unbounded read that has exhausted this project's Neon transfer
// allowance across seven consecutive database projects.
//
// The two tests below are the whole reason the file is shaped the way it is.
// ─────────────────────────────────────────────────────────────────────────────

test("ranking is a server-side aggregate, never a full-table pull", () => {
  const src = codeOnly(read(LIB));
  // groupBy makes Postgres do the scan and return ~one row per CARD. The wire
  // cost is then bounded by the catalogue (~1,400 tiny rows) instead of by how
  // deep the history goes.
  assert.match(src, /dbHistory\.priceHistory\.groupBy\(/, "the ranking pass must aggregate server-side");
  assert.match(src, /_max:\s*\{[^}]*lowestPriceCents/, "must take the max in the database");
  assert.match(src, /_min:\s*\{[^}]*lowestPriceCents/, "must take the min in the database");
});

test("the detail query is bounded by the page size, not the catalogue", () => {
  const src = codeOnly(read(LIB));
  const finds = src.match(/dbHistory\.priceHistory\.findMany\(/g) ?? [];
  assert.equal(finds.length, 1, "expected exactly one detail read");
  const fn = src.slice(src.indexOf("dbHistory.priceHistory.findMany("));
  const body = fn.slice(0, fn.indexOf("});"));
  // Scoped to the SHORTLIST. Without `cardId: { in: ids }` this is the
  // whole-table read the groupBy above exists to avoid.
  assert.match(body, /cardId:\s*\{\s*in:\s*ids\s*\}/, "the detail read must be scoped to the shortlisted cards");
  // And the shortlist itself must be capped before it gets here.
  assert.match(src, /const over = limit \* 3/, "the shortlist must be a fixed multiple of the page size");
});

test("records are day-cached, like every other history-derived read", () => {
  const src = codeOnly(read(LIB));
  assert.match(src, /cachedOrDirect\(/, "must use the shared cache helper");
  assert.match(src, /sydneyWeekKey\(\)/, "the cache key must include the Sydney week");
  // HISTORY_TAG, not CONTENT_TAG, and deliberately so: PriceHistory is written
  // weekly, so letting a twice-daily price import purge this would force six
  // whole-market re-scans a day to rebuild an identical answer. That tag split
  // is the point of the change — see revalidate-content.ts.
  assert.match(src, /tags:\s*\[HISTORY_TAG\]/, "history reads must not be purged by an ordinary price import");
});

// ─────────────────────────────────────────────────────────────────────────────
// Correctness of the claim itself. "All-time high" reads as a durable fact in a
// way "this week's biggest riser" does not, so the bar for publishing one is
// higher — a stale or thin record is worse here than an empty page.
// ─────────────────────────────────────────────────────────────────────────────

test("a stale snapshot refuses to publish records at all", () => {
  const src = codeOnly(read(LIB));
  // Same threshold and same policy as computePriceMovers: the snapshot write is
  // best-effort and has silently frozen for eleven days before now.
  assert.match(src, /STALE_HISTORY_MS/, "must reuse the shared staleness threshold");
  assert.match(
    src,
    /Date\.now\(\) - freshest\.getTime\(\) > STALE_HISTORY_MS\) return EMPTY/,
    "must bail out entirely rather than present a stale peak as current",
  );
  // The threshold is shared, not re-declared — two copies would drift.
  assert.match(read("src/lib/price-history.ts"), /export const STALE_HISTORY_MS/, "the threshold must be exported, not duplicated");
});

test("a card needs real history before it can hold a record", () => {
  const src = codeOnly(read(LIB));
  assert.match(src, /const MIN_DAYS = \d+/, "expected a minimum-history floor");
  assert.match(src, /_count\._all < MIN_DAYS/, "the floor must actually gate the candidate list");
  // Without this, every new set fills the board the day it is added — a card
  // priced on three days has an all-time high by definition and it means
  // nothing.
  // MIN_DAYS counts SNAPSHOT ROWS, and the snapshot interval is a separate
  // constant that has already changed once (daily -> weekly, for history-database
  // cost). Asserting a raw row count therefore encodes the cadence by accident:
  // the old `min >= 7` silently meant "seven weeks" the moment writes went weekly.
  //
  // Assert the thing actually intended instead — how much ELAPSED history a
  // record needs behind it — by multiplying the floor by the real interval. This
  // now fails correctly in both directions: too few snapshots, or a cadence
  // change that makes the existing floor meaningless.
  const min = Number(/const MIN_DAYS = (\d+)/.exec(src)![1]);
  // Canonical home is price-history.ts (2026-09-02) — shared with
  // sealed-import.ts's own weekly writer, so price-import.ts imports it
  // rather than defining it locally. See price-history.ts's own comment for
  // why: price-import.ts already imports FROM sealed-import.ts, so defining
  // this constant in either writer instead of the neutral price-history.ts
  // would have closed a real import cycle.
  const historySrc = read("src/lib/price-history.ts");
  const intervalMatch = /export const HISTORY_MIN_INTERVAL_DAYS = (\d+)/.exec(historySrc);
  assert.ok(intervalMatch, "expected HISTORY_MIN_INTERVAL_DAYS in price-history.ts");
  const interval = Number(intervalMatch![1]);
  const coverageDays = min * interval;
  assert.ok(
    coverageDays >= 14,
    `MIN_DAYS of ${min} at one snapshot per ${interval} day(s) is only ${coverageDays} days of history — too thin to call anything "all-time"`,
  );
});

test("an absurd drop is treated as our own bad data, not a record", () => {
  const src = codeOnly(read(LIB));
  assert.match(src, /MAX_OFF_PEAK_PCT/, "expected an outlier guard on the off-peak board");
  assert.match(src, /offPeakPct <= MAX_OFF_PEAK_PCT/, "the guard must filter the list it protects");
});

// ─────────────────────────────────────────────────────────────────────────────
// The page.
// ─────────────────────────────────────────────────────────────────────────────

test("the cross-market board carries the shipping caveat", () => {
  const src = read(PAGE);
  // A gap is not a saving until the card is in your hands. Postage, customs and
  // whether an overseas store ships at all are unmodelled and routinely exceed
  // the gap — the Premium screener says so and the free board must too, or the
  // free one is the misleading version.
  assert.match(src, /customs/i, "the gap board must disclose unmodelled cross-border costs");
  assert.match(src, /Informational/i, "must not read as a buy recommendation");
});

test("the free board teases the Premium screener rather than replacing it", () => {
  const src = read(PAGE);
  assert.match(src, /const GAPS_SHOWN = 10/, "the free board must be a fixed top-N");
  assert.match(src, /\/tools\/deal-finder/, "must link to the full screener");
});

test("the public gap board ranks by money, not percentage", () => {
  // REGRESSION, caught on the live page. getCrossRegionGaps ranks by PERCENTAGE,
  // which systematically promotes the cheapest cards: the first board shipped
  // led with a common at S$0.50 vs US$3.99 ("−90.7%") while a Showcase Signature
  // with a real US$44 gap sat at #8. Every headline row was a two-dollar saving
  // on a card nobody ships internationally.
  const src = codeOnly(read(PAGE));
  assert.match(src, /const GAP_MIN_SAVING_CENTS = \d+/, "expected an absolute-saving floor");
  assert.match(
    src,
    /\.filter\(\(r\) => r\.savingCents >= GAP_MIN_SAVING_CENTS\)/,
    "the floor must actually filter the board",
  );
  assert.match(
    src,
    /\.sort\(\(a, b\) => b\.savingCents - a\.savingCents\)/,
    "must rank by absolute saving, not gapPct",
  );
  // Re-ranking needs a candidate pool bigger than the board, or the rows that
  // deserve the top spots are never fetched to begin with.
  assert.match(src, /getCrossRegionGaps\(country, 1, GAPS_CANDIDATES\)/, "must over-fetch before re-ranking");
  const cand = Number(/const GAPS_CANDIDATES = (\d+)/.exec(src)![1]);
  const shown = Number(/const GAPS_SHOWN = (\d+)/.exec(src)![1]);
  assert.ok(cand > shown * 5, `candidate pool of ${cand} is too small to re-rank a top-${shown} meaningfully`);
});

test("re-ranking happens on the page, never in the shared screener", () => {
  // getCrossRegionGaps is shared with the Premium Deal Finder, where percentage
  // ranking is the right default and a dollar floor would silently hide rows a
  // paying user explicitly asked to see.
  const lib = codeOnly(read("src/lib/arbitrage.ts"));
  assert.ok(!/GAP_MIN_SAVING_CENTS/.test(lib), "the public board's floor must not leak into the shared function");
  // The ranking lives in computeCrossRegionRows, not getCrossRegionGaps — the
  // row build was split out (and moved into the shared day-cache) when the
  // cross-region tab turned out to be re-pulling the whole catalogue per request.
  const fn = lib.slice(lib.indexOf("function computeCrossRegionRows"));
  assert.match(fn.slice(0, fn.indexOf("\n}")), /rows\.sort\(\(a, b\) => b\.pct - a\.pct\)/, "the shared screener keeps percentage ranking");
});

test("the row leads with the figure the board is sorted by", () => {
  const src = read(PAGE);
  // A number that is not what the list is ranked by must not be the biggest
  // thing in the row — that is what made the percentage-ranked board read as
  // though a 50-cent common were the headline opportunity.
  const board = src.slice(src.indexOf("function GapsBoard"), src.indexOf("export default async function"));
  const lead = board.slice(board.indexOf("text-sm font-extrabold text-brand-400"));
  assert.match(lead.slice(0, 200), /formatMoney\(savingCents/, "the saving belongs in the lead position");
});

test("the records page is discoverable", () => {
  // A page nothing links to is a page nobody visits — and this one exists to be
  // found by search, so both the sitemap and the Index page must point at it.
  assert.match(read("src/lib/sitemap-sections.ts"), /\/market\/records/, "must be in the sitemap");
  assert.match(read("src/app/market/page.tsx"), /href="\/market\/records"/, "the Index page must link to it");
});

test("the market switcher offers no Global option here", () => {
  // A record is a price in ONE market's own currency; an all-time high of A$180
  // and one of US$120 do not combine into a number worth printing. This used to
  // be MarketSwitcher's includeGlobal={false} prop, opting THIS page out of an
  // option every other page defaulted to. The GLOBAL composite was removed
  // entirely 2026-09-02 (see market-index.ts) — MarketSwitcher never offers it
  // to any page now, so there's nothing left for this page to opt out of.
  const src = codeOnly(read(PAGE));
  assert.doesNotMatch(src, /includeGlobal/, "the prop no longer exists on MarketSwitcher — must not be reintroduced here");
  assert.match(src, /<MarketSwitcher[\s\S]{0,150}basePath="\/market\/records"/, "must still use the shared switcher, unchanged otherwise");
});
