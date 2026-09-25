import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// /movers, 2026-09-25: honest about its cadence and its price, the whole
// computed list, and a free "Most searched this week" strip (#most-searched —
// where the retired Premium Demand Finder's URL now redirects).
//
// The strip reads lib/demand.ts's self-cached getTopDemand. The egress rules
// that matter (src/lib/db.ts): call it at the page's top level, never from
// inside another unstable_cache (rule 6), and never let its TTL undercut the
// page's `revalidate` (rule 5).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = "src/app/movers/page.tsx";
const STRIP = "src/components/MostSearchedStrip.tsx";
const DEMAND = "src/lib/demand.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("the strip is the #most-searched target, and the id carries the header offset", () => {
  const strip = code(read(STRIP));
  assert.match(strip, /<section id="most-searched" className="scroll-mt-header">/);
  assert.match(strip, /Most searched this week/);
  assert.match(code(read(PAGE)), /<MostSearchedStrip rows=\{mostSearched\} coveredDays=\{demand\.coveredDays\} \/>/);
});

test("the strip's loader is called at the page's top level, never inside another cache", () => {
  const page = code(read(PAGE));
  assert.match(page, /await Promise\.all\(\[getPriceMovers\(country, 50\), getTopDemand\(7, MOST_SEARCHED_ROWS\)\]\)/);
  assert.match(page, /const MOST_SEARCHED_ROWS = 10;/, "a top-10 strip");
  assert.doesNotMatch(page, /unstable_cache|cachedOrDirect|from "next\/cache"/, "the page wraps nothing in a cache of its own");
  // And nothing anywhere wraps getTopDemand.
  const wrap = /(?:unstable_cache|cachedOrDirect)\(\s*(?:async\s*)?\(\)\s*=>\s*(?:await\s+)?getTopDemand\(/;
  for (const file of walk(join(ROOT, "src"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), wrap, `${relative(ROOT, file)} wraps self-cached getTopDemand`);
  }
  // Its own cached callback reaches no self-cached loader either.
  const demand = code(read(DEMAND));
  const body = demand.slice(demand.indexOf("async function computeTopDemand"), demand.indexOf("function getTopDemandCached"));
  for (const loader of ["getPriceMovers", "getCachedRisingCards", "getPopularCards", "getTopDeals", "getMarketIndex"]) {
    assert.ok(!body.includes(`${loader}(`), `computeTopDemand must not call ${loader}`);
  }
});

test("the page keeps its revalidate, and the strip's cache cannot undercut it", () => {
  const page = read(PAGE);
  assert.match(page, /export const revalidate = 86400;/, "never lower a page's revalidate");
  const ttl = Number(/\["rc-demand-v2"[\s\S]{0,80}revalidate:\s*(\d+)/.exec(read(DEMAND))?.[1]);
  assert.ok(ttl >= 86400, `getTopDemand's TTL (${ttl}) must not be shorter than the page's 86400`);
});

test("the demand ranking is narrow and computed once for every market", () => {
  const demand = code(read(DEMAND));
  assert.doesNotMatch(demand, /cardTileSelect/, "no per-market tile select (its _count subquery was never rendered)");
  const select = /export const DEMAND_CARD_SELECT = \{[\s\S]*?\} satisfies Prisma\.CardSelect;/.exec(demand)?.[0] ?? "";
  assert.ok(select, "expected DEMAND_CARD_SELECT");
  assert.doesNotMatch(select, /_count|retailerPrices/, "no relation counts in the narrow select");
  assert.match(demand, /\["rc-demand-v2", String\(days\), sydneyDayKey\(\)\]/, "the key carries no market");
  // "Most searched" never lists a card nobody searched for.
  assert.match(demand, /win\.rows\.filter\(\(r\) => r\.searches > 0\)/);
});

// The DATA cache never stores a failure. The page render that caught one is
// an ISR render like any other, so the strip stays hidden until the next
// /movers regeneration (the import's revalidatePath, ~12 h, or the 24 h TTL) —
// accepted rather than shortening the page's TTL or throwing (a throw after a
// tag purge has no stale page to fall back on and would 500). The anchor the
// /tools/demand redirect lands on is always there.
test("a failed demand read is never cached in the data cache, and the page keeps its anchor", () => {
  const demand = code(read(DEMAND));
  const compute = demand.slice(demand.indexOf("async function computeTopDemand"), demand.indexOf("function getTopDemandCached"));
  assert.match(compute, /catch \(err\) \{[\s\S]{0,160}throw err;/, "the cached callback rethrows");
  const outer = demand.slice(demand.indexOf("export async function getTopDemand"));
  assert.match(outer, /catch \{[\s\S]{0,200}bySearch: \[\], windowUsable: false[^}]*failed: true/, "…and the caller degrades outside the cache");
  const strip = code(read("src/components/MostSearchedStrip.tsx"));
  const empty = strip.slice(strip.indexOf("if (!rows.length)"), strip.indexOf("const days"));
  assert.match(empty, /id="most-searched"/, "the #most-searched anchor renders with no rows too");
  // The page renders the strip only from a real 7-day window.
  assert.match(code(read(PAGE)), /const mostSearched = demand\.windowUsable \?/);
});

test("nothing that links to /movers calls it daily or today's", () => {
  // Review, 2026-09-25: /movers was relabelled weekly (its data always was),
  // but a house ad, the games, 404, /alerts and a dozen articles still sold
  // "the daily movers" and "today's biggest price moves".
  const walk = (d: string): string[] =>
    readdirSync(join(process.cwd(), d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const stale = /\bdaily (price )?movers\b|today(?:'|&apos;|’)s (biggest )?(price )?mov(?:ers|es)\b/i;
  for (const f of walk("src")) assert.doesNotMatch(code(read(f)), stale, `${f} calls /movers daily`);
  const adSlot = read("src/components/AdSlot.tsx");
  const moversAd = adSlot.slice(adSlot.indexOf("const HOUSE_ADS"), adSlot.indexOf('href: "/movers"'));
  assert.doesNotMatch(moversAd, /updated daily/i, "the /movers house ad says weekly");
});

test("/movers says weekly, and says what its price is", () => {
  const page = code(read(PAGE));
  assert.doesNotMatch(page, /\bdaily\b/i, "PriceHistory is weekly; nothing on /movers (FAQ JSON-LD included) may say daily");
  assert.match(page, /const PRICE_BASIS = "the cheapest tracked price across AU\/US\/UK\/SG, converted";/);
  assert.ok((page.match(/\{PRICE_BASIS\}|\$\{PRICE_BASIS\}/g) ?? []).length >= 3, "the hero, the answer box and the FAQ all describe the price the same way");
  assert.doesNotMatch(page, /lowest in-stock price across every store tracked for/, "the old claim that it was the viewer's own market's stores");
});
