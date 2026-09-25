import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRY_LIST } from "../src/lib/country";
import { usdCentsToCountry } from "../src/lib/fx";
import { parseRiseScope, assembleRisingCards, riseHistoryStart, growthSpanLabel, RISE_SCOPES, type RiseInputs, type RiseHistory } from "../src/lib/rise-predictor";

// ─────────────────────────────────────────────────────────────────────────────
// Rising Cards, fixed (2026-09-25 lineup change; DECISIONS.md). What these pin:
//   • every market in the switcher parses (SG/CA/EU silently fell back to
//     Global), and the default is the visitor's market;
//   • every price renders in its own row's currency (Global printed US$ as A$);
//   • the series is weekly + today's live price, and never compares across a
//     methodology break (lib/price-history.ts dropBreakWindow);
//   • a card without enough clean history is ranked on demand and supply, and
//     says so, instead of the whole tool going dark;
//   • history is read weekly and scope-independently; failures are never cached.
// The assembly is pure and driven here with synthetic inputs — no database.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = "src/app/tools/rising/page.tsx";
const ADMIN = "src/app/admin/rising/page.tsx";
const LIB = "src/lib/rise-predictor.ts";

const DAY = 86400_000;
const eday = (m: number, d: number) => Math.round(Date.UTC(2026, m - 1, d) / DAY);
type Card = RiseInputs["universe"][number];

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id, slug: id, name: `Card ${id}`, setCode: "OGN", collectorNumber: "001", variant: null, isPromo: false,
    rarity: "Rare", imageThumbUrl: null, searchCount: 100, viewCount: 10,
    lowestPriceCents: null, lowestPriceCentsUs: null, lowestPriceCentsUk: null,
    lowestPriceCentsSg: null, lowestPriceCentsCa: null, lowestPriceCentsEu: null,
    ...over,
  };
}
const inputs = (universe: Card[], over: Partial<RiseInputs> = {}): RiseInputs => ({ universe, supply: {}, velocity: {}, snapshotDays: 30, ...over });
const history = (series: RiseHistory["series"]): RiseHistory => ({ series });

// ── Scope parsing ────────────────────────────────────────────────────────────

test("the scope parser accepts every COUNTRY_LIST market, any case, plus Global", () => {
  for (const c of COUNTRY_LIST) {
    assert.equal(parseRiseScope(c.code, "GLOBAL"), c.code, `${c.code} must parse`);
    assert.equal(parseRiseScope(c.code.toLowerCase(), "GLOBAL"), c.code, `${c.code} lower-case must parse`);
  }
  assert.equal(parseRiseScope("global", "US"), "GLOBAL");
  assert.equal(parseRiseScope("GLOBAL", "US"), "GLOBAL");
  assert.deepEqual([...RISE_SCOPES].sort(), ["GLOBAL", ...COUNTRY_LIST.map((c) => c.code)].sort());
  for (const junk of [undefined, null, "", "NZ", "toString", "constructor", "gl0bal"]) {
    assert.equal(parseRiseScope(junk, "AU"), "AU", `${String(junk)} falls back`);
  }
});

test("the tool defaults to the visitor's market and the admin page parses every market too", () => {
  const src = code(PAGE);
  assert.match(src, /const country = getCountry\(\);/);
  assert.match(src, /parseRiseScope\(searchParams\.scope, country\)/, "the default is the visitor's own market, not Global");
  assert.doesNotMatch(src, /raw === "AU" \|\| raw === "US" \|\| raw === "UK"/, "the three-market parser must stay gone");
  assert.match(code(ADMIN), /parseRiseScope\(searchParams\.country, "GLOBAL"\)/);
  assert.doesNotMatch(code(ADMIN), /raw === "AU" \|\| raw === "US" \|\| raw === "UK"/);
});

// ── Currency ─────────────────────────────────────────────────────────────────

test("Global picks carry their own basis market's currency, and the page renders it", () => {
  const now = Date.UTC(2026, 9, 20);
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("us-only", { lowestPriceCentsUs: 1000, searchCount: 500 }), card("au", { lowestPriceCents: 1500 }), card("eu-only", { lowestPriceCentsEu: 900 })]),
    history({}),
    now,
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.deepEqual([by.get("us-only")!.currency, by.get("us-only")!.priceCents], ["USD", 1000]);
  assert.deepEqual([by.get("au")!.currency, by.get("au")!.priceCents], ["AUD", 1500]);
  assert.deepEqual([by.get("eu-only")!.currency, by.get("eu-only")!.priceCents], ["EUR", 900]);

  const src = code(PAGE);
  assert.match(src, /formatMoney\(p\.priceCents, p\.currency\)/, "each row formats with its own currency");
  assert.doesNotMatch(src, /isGlobal \? "AUD"/, "Global must not force one currency onto every row");
  assert.doesNotMatch(src, /<RisingRow [^>]*currency=/, "no page-wide currency is handed to the row");
});

test("a single market prices every row, the series and today's point in that market's currency", () => {
  const now = Date.UTC(2026, 9, 20);
  const c = card("x", { lowestPriceCents: 1800, lowestPriceCentsUs: 1100 });
  const a = assembleRisingCards("AU", inputs([c]), history({ x: [[eday(10, 7), 1000], [eday(10, 14), 1000]] }), now);
  const p = a.picks[0];
  assert.equal(p.currency, "AUD");
  assert.equal(p.priceCents, 1800, "the Price column is AU's own live listing");
  // The series is the GLOBAL low, converted: history 1000 USD, and today's
  // global low is min(AU 1800 AUD → USD, US 1100) = 1100 USD.
  assert.deepEqual(p.spark, [usdCentsToCountry(1000, "AU"), usdCentsToCountry(1000, "AU"), usdCentsToCountry(1100, "AU")]);
});

// ── The series: weekly + live, never across a break ─────────────────────────

test("today's live global low is the newest point, and pre-break prices still count (owner: keep the old signals)", () => {
  const now = Date.UTC(2026, 9, 20, 12);
  const c = card("x", { lowestPriceCentsUs: 990 });
  const series = {
    x: [[eday(9, 9), 1300], [eday(9, 16), 1300], [eday(9, 23), 1000], [eday(9, 30), 1000], [eday(10, 7), 1000], [eday(10, 14), 900]] as [number, number][],
  };
  const p = assembleRisingCards("GLOBAL", inputs([c]), history(series), now).picks[0];
  assert.deepEqual(p.spark, [1300, 1300, 1000, 1000, 1000, 900, 990], "the whole window, ending with today's price");
  assert.equal(p.vsLastWeekPct, 10, "today (990) vs the point nearest a week ago (900)");
  assert.equal(p.historyPoints, 7);
  assert.equal(p.priceSignals, true, "seven weekly points clears MIN_POINTS");
});

test("right after the switch, 'vs last week' still reads the weekly price nearest 7 days back", () => {
  const now = Date.UTC(2026, 8, 25, 12);
  const c = card("x", { lowestPriceCentsUs: 800 });
  const p = assembleRisingCards("GLOBAL", inputs([c]), history({ x: [[eday(9, 9), 1300], [eday(9, 16), 1300], [eday(9, 23), 1000]] }), now).picks[0];
  assert.deepEqual(p.spark, [1300, 1300, 1000, 800]);
  assert.equal(p.vsLastWeekPct, -38.5, "today (800) vs 09-16's 1300, the point nearest a week ago");
});

test("with enough clean weekly points the price signals switch on", () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const c = card("x", { lowestPriceCentsUs: 1000 });
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([c, card("y", { lowestPriceCentsUs: 500 })]),
    history({ x: [[eday(9, 30), 1400], [eday(10, 7), 1300], [eday(10, 14), 1200], [eday(10, 21), 1100]] }),
    now,
  );
  const p = a.picks.find((q) => q.id === "x")!;
  assert.equal(p.historyPoints, 5);
  assert.equal(p.priceSignals, true);
  assert.equal(p.posPct, 0, "today's 1000 is the low of its range");
  assert.match(p.reason, /^Near the low of its 4-week range/);
  assert.equal(a.qualifying, 1);
  assert.equal(a.withAnyHistory, 1, "only x has recorded history");
});

test("without clean history a card is ranked on demand and supply — neutral, not punished — and says so", () => {
  const now = Date.UTC(2026, 8, 25, 12);
  const universe = [
    card("popular", { lowestPriceCentsUs: 1000, searchCount: 5000 }),
    card("quiet", { lowestPriceCentsUs: 1000, searchCount: 20 }),
    card("mid", { lowestPriceCentsUs: 1000, searchCount: 400 }),
  ];
  const a = assembleRisingCards("US", inputs(universe, { supply: { popular: 2, quiet: 2, mid: 2 } }), history({}), now);
  assert.equal(a.picks.length, 3, "the tool does not go dark while price history rebuilds");
  assert.equal(a.qualifying, 0);
  assert.deepEqual(a.picks.map((p) => p.id), ["popular", "mid", "quiet"], "ranked by demand when nothing else differs");
  for (const p of a.picks) {
    assert.equal(p.priceSignals, false);
    assert.deepEqual([p.components.room, p.components.momentum, p.components.volatility], [0, 0, 0]);
    assert.equal(p.posPct, 0.5, "neutral, so nothing downstream reads it as 'near its low'");
    assert.equal(p.confidence, "Low");
    assert.match(p.reason, /^Not enough weekly prices yet to judge its range, ranked on demand and supply · /);
    assert.match(p.reason, /2 stores in stock in US$/);
  }
  assert.equal(a.failed, false);
});

test("the one-line reason names searches, growth and stock in plain words", () => {
  const now = Date.UTC(2026, 8, 25, 12);
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("x", { lowestPriceCentsUs: 1000 }), card("y", { lowestPriceCentsUs: 1000 })], {
      supply: { x: 0, y: 1 },
      velocity: {
        x: { searchPerDay: 3.5, viewPerDay: 1, searchGrowthPct: 42.4, spanDays: 21, points: 21 },
        y: { searchPerDay: 2, viewPerDay: 1, searchGrowthPct: 1, spanDays: 21, points: 21 },
      },
    }),
    history({}),
    now,
  );
  const by = new Map(a.picks.map((p) => [p.id, p.reason]));
  assert.match(by.get("x")!, /searches \+42% in 3 weeks · no store has it in stock$/);
  assert.match(by.get("y")!, /2 searches a day · 1 store in stock$/);
});

test("search growth is quoted over the span the snapshots really cover, and not at all over a few days", () => {
  // getDemandVelocity measures growth over whatever snapshots a card has (up
  // to 21 days). The reason used to say "in 3 weeks" for every card — including
  // one first snapshotted two days ago, whose small base makes any growth huge.
  const now = Date.UTC(2026, 8, 25, 12);
  const a = assembleRisingCards(
    "GLOBAL",
    inputs([card("nine", { lowestPriceCentsUs: 1000 }), card("two", { lowestPriceCentsUs: 1000 })], {
      supply: { nine: 1, two: 1 },
      velocity: {
        nine: { searchPerDay: 4, viewPerDay: 1, searchGrowthPct: 30, spanDays: 9, points: 9 },
        two: { searchPerDay: 50, viewPerDay: 1, searchGrowthPct: 400, spanDays: 2, points: 3 },
      },
    }),
    history({}),
    now,
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.match(by.get("nine")!.reason, /searches \+30% in 9 days · /);
  assert.equal(by.get("nine")!.searchGrowthDays, 9);
  assert.doesNotMatch(by.get("two")!.reason, /%/, "two days of snapshots is too short to quote a growth percentage");
  assert.match(by.get("two")!.reason, /50 searches a day/);
  assert.equal(by.get("two")!.searchGrowthPct, null);
  assert.equal(by.get("two")!.searchPerDay, 50, "the rate itself still counts");
  assert.deepEqual([growthSpanLabel(21), growthSpanLabel(7), growthSpanLabel(9), growthSpanLabel(14, true), growthSpanLabel(10, true)], ["3 weeks", "1 week", "9 days", "2 wk", "10 d"]);
  assert.doesNotMatch(read(PAGE), /% \/ 3 wk/, "the Searches cell no longer assumes three weeks");
  assert.match(read(PAGE), /growthSpanLabel\(p\.searchGrowthDays, true\)/);
});

test("a card with no loaded history is never described as 'rebuilding' — and the load is a superset of every universe", () => {
  // The first cut loaded history for the 600 most-searched cards only; a
  // thinner market's top 400 reaches further down the search order, and those
  // cards were told "Price history rebuilding" when their history simply had
  // not been read. The load now has no card list at all (see the egress test
  // below); the reason says only what is true in every case.
  const now = Date.UTC(2026, 10, 18, 12);
  const deep: [number, number][] = [[eday(9, 30), 1200], [eday(10, 7), 1150], [eday(10, 14), 1100], [eday(10, 21), 1100], [eday(10, 28), 1050], [eday(11, 4), 1000]];
  const a = assembleRisingCards(
    "SG",
    inputs([card("deep", { lowestPriceCentsSg: 1400 }), card("absent", { lowestPriceCentsSg: 1400 })], { supply: { deep: 1, absent: 1 } }),
    history({ deep }),
    now,
  );
  const by = new Map(a.picks.map((p) => [p.id, p]));
  assert.equal(by.get("deep")!.priceSignals, true);
  const absent = by.get("absent")!;
  assert.equal(absent.priceSignals, false);
  assert.equal(absent.historyPoints, 0);
  assert.doesNotMatch(absent.reason, /rebuild/i, "nothing says history exists that was not read");
  assert.match(absent.reason, /^Not enough weekly prices yet to judge its range, ranked on demand and supply/);
  assert.doesNotMatch(code(LIB), /Price history rebuilding/);
});

test("the weekly history load is the plain 120-day window, across the 09-23 break (owner: keep the old signals)", () => {
  const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
  for (const now of [D(2026, 10, 20), D(2026, 9, 25), D(2027, 6, 1), D(2026, 9, 10)]) {
    assert.equal(riseHistoryStart(now).getTime(), now - 120 * DAY);
  }
  assert.doesNotMatch(code(LIB), /dropBreakWindow\(/, "Rising Cards must not drop pre-break points while the owner keeps the old signals");
});

test("an empty universe is an empty analysis, not a failure", () => {
  const a = assembleRisingCards("SG", inputs([]), history({}), Date.now());
  assert.deepEqual(a.picks, []);
  assert.equal(a.failed, false);
  assert.equal(a.scope, "SG");
});

// ── The page ─────────────────────────────────────────────────────────────────

test("the page states plain signals, weekly cadence and no track-record claims", () => {
  const src = read(PAGE);
  assert.match(src, />vs last week</);
  assert.match(src, />16 wk</);
  assert.doesNotMatch(src, />7d<|>30d</, "the old labels overstated the cadence");
  assert.doesNotMatch(src, /function ZBar|<ZBar/, "the unlabelled z-score bars are gone");
  assert.match(src, /\{p\.reason\}/, "every row carries its one-line reason");
  assert.match(src, /Demand and stock update daily; price history updates weekly\./);
  // Comments may record why; nothing a visitor or crawler sees may say it.
  assert.doesNotMatch(code(PAGE), /backtest|validated/i, "no track record is published, so no 'backtested'/'validated' claim");
  assert.doesNotMatch(code(PAGE), /investing|price predictions?/i, "no investing or prediction keywords");
  assert.match(src, /not financial advice/i);
});

test("the gate sells Plus, and the structured data no longer calls the list free", () => {
  const src = code(PAGE);
  assert.match(src, /<PremiumButton tier="plus" surface="gate:rising" \/>/);
  assert.doesNotMatch(src, /Premium shows every/, "Plus unlocks the list; the copy says Plus");
  assert.doesNotMatch(src, /price: "0"|"@type": "Offer"/, "no WebApplication offer at price 0");
  assert.match(src, /no ads on any page|removes ads/i, "a surface that describes Plus says it is ad-free");
  // …and so does the gate line itself, not only the FAQ (QA, 2026-09-25).
  const gate = src.slice(src.indexOf("more ranked picks"), src.indexOf('surface="gate:rising"'));
  assert.match(gate, /no ads/i, "the Rising gate line says Plus is ad-free");
});

test("every Plus gate line and free nudge says Plus is ad-free", async () => {
  const nudge = await import("../src/lib/premium-nudge");
  assert.match(nudge.PLUS_GATE_LINE, /no ads/i, "Deal Finder's gate and teaser line");
  const n = { watched: { deals: 0, dealsFree: 0, rising: 3, risingFree: 1 }, owned: { deals: 0, dealsFree: 0, rising: 0, risingFree: 0 }, example: null };
  assert.match(nudge.nudgeCopy(n, "watched")!.line, /Plus shows every pick, with no ads\./, "the Rising nudge");
  const df = code("src/app/tools/deal-finder/page.tsx");
  const faq = df.slice(df.indexOf('q: "Do I need to pay to use it?"'));
  assert.match(faq.slice(0, 600), /ads off every page/, "Deal Finder's pricing FAQ");
});

test("a failed load reads 'temporarily unavailable', never 'no price history yet'", () => {
  const src = code(PAGE);
  const failedAt = src.indexOf("analysis.failed ?");
  assert.ok(failedAt > 0, "the empty state branches on analysis.failed first");
  assert.ok(failedAt < src.indexOf("analysis.withAnyHistory > 0"), "…before any history-based message");
  assert.match(src, /temporarily unavailable/);
  assert.doesNotMatch(src, /No price history yet/);
});

// ── Egress and failure shape ─────────────────────────────────────────────────

test("history is read by one week-keyed, scope-independent loader; the daily loader never touches it", () => {
  const src = read(LIB);
  const historyLoader = /export function getRiseHistory\(\)[\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.match(historyLoader, /\["rc-rise-history-v2", sydneyWeekKey\(\)\]/, "keyed on the week only — no scope in the key");
  assert.match(historyLoader, /tags: \[HISTORY_TAG\]/, "not purged by an ordinary import");
  const inputsLoader = /export function getRiseInputs\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.match(inputsLoader, /\["rc-rise-inputs", scope, sydneyDayKey\(\)\]/);
  assert.match(inputsLoader, /tags: \[CONTENT_TAG\]/);
  assert.match(inputsLoader, /revalidate: 172800/);

  const reads = [...src.matchAll(/dbHistory\.\w+\.\w+\(/g)];
  assert.equal(reads.length, 1, "exactly one history read in the file");
  const historyFn = /async function computeRiseHistory\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.match(historyFn, /dbHistory\.priceHistory\.findMany/, "…and it lives in the weekly loader");
  assert.match(historyFn, /collapseToWeekly\(/, "legacy daily rows are collapsed to weekly before caching");
  // A SUPERSET OF EVERY SCOPE'S UNIVERSE BY CONSTRUCTION: no card list at all
  // (the first cut read the 600 most-searched cards, which a thinner market's
  // top 400 outruns). Bounded instead by the window — the current pricing
  // basis, at most 120 days — times the catalogue, with a newest-first row cap
  // as a circuit breaker.
  assert.match(historyFn, /where: \{ country: GLOBAL_HISTORY_COUNTRY, day: \{ gte: riseHistoryStart\(Date\.now\(\)\) \} \}/);
  assert.doesNotMatch(historyFn.replace(/\/\/[^\n]*/g, ""), /cardId: \{ in|prisma\.card\.|HISTORY_SCAN/, "no card list: nothing a universe card can fall outside of");
  assert.match(historyFn, /orderBy: \{ day: "desc" \},\s*take: HISTORY_ROW_CAP/, "a cap, if it ever bites, trims the oldest weeks");
});

test("the assembly is uncached and calls both loaders directly — never nested", () => {
  const src = read(LIB);
  const entry = /export function getCachedRisingCards\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.ok(entry, "expected getCachedRisingCards");
  assert.doesNotMatch(entry, /unstable_cache|cachedOrDirect/, "the assembly is not a cache callback, so its loaders' caches are honoured");
  assert.match(entry, /Promise\.all\(\[getRiseHistory\(\), getRiseInputs\(scope\)\]\)/);
  assert.match(entry, /failedUntil\.set\(scope, Date\.now\(\) \+ FAILURE_MEMO_MS\)/, "an outage is retried at most every few minutes per instance");
  assert.doesNotMatch(code(LIB), /unstable_cache\(/, "rise-predictor caches only through cachedOrDirect");
});
