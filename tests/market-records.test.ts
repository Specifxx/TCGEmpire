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
  assert.match(src, /sydneyDayKey\(\)/, "the cache key must include the Sydney day");
  assert.match(src, /tags:\s*\[CONTENT_TAG\]/, "an import's revalidateContent() must be able to refresh it");
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
  const min = Number(/const MIN_DAYS = (\d+)/.exec(src)![1]);
  assert.ok(min >= 7, `MIN_DAYS of ${min} is too low to make "all-time" mean anything`);
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

test("the records page is discoverable", () => {
  // A page nothing links to is a page nobody visits — and this one exists to be
  // found by search, so both the sitemap and the Index page must point at it.
  assert.match(read("src/lib/sitemap-sections.ts"), /\/market\/records/, "must be in the sitemap");
  assert.match(read("src/app/market/page.tsx"), /href="\/market\/records"/, "the Index page must link to it");
});

test("the market switcher offers no Global option here", () => {
  const src = read(PAGE);
  // A record is a price in ONE market's own currency; an all-time high of A$180
  // and one of US$120 do not combine into a number worth printing. Offering the
  // option and then coercing it to a default market is worse than not offering
  // it.
  assert.match(src, /includeGlobal=\{false\}/, "records cannot be aggregated across currencies");
});
