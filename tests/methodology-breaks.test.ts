import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { METHODOLOGY_BREAKS, dropBreakWindow, globalLowUsd, recentMethodologyBreak, GLOBAL_LOW_MARKETS } from "../src/lib/price-history";
import { METHODOLOGY_BREAKS as FROM_INDEX } from "../src/lib/market-index";
import { convertCents } from "../src/lib/fx";

// ─────────────────────────────────────────────────────────────────────────────
// History integrity across a METHODOLOGY BREAK (2026-09-25).
//
// On 2026-09-23 the US TCGplayer row switched from market price to the cheapest
// English listing, a median 25% lower. PriceHistory records each card's low
// across markets, so that re-basing sits in the weekly series. Only the Index
// handled it (chain-linked, flat across the window); /movers, Rising Cards, the
// homepage 7-day column, the /market constituents and the records board all
// printed it as a market-wide crash. METHODOLOGY_BREAKS now lives in
// lib/price-history.ts beside dropBreakWindow, and every reader that compares
// two points of PriceHistory goes through it.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DAY = 86400_000;
const d = (m: number, day: number) => Date.UTC(2026, m - 1, day);
const pts = (...days: number[]) => days.map((t, i) => ({ t, v: 1000 + i }));

test("METHODOLOGY_BREAKS moved to price-history.ts; market-index re-exports the same list", () => {
  assert.equal(FROM_INDEX, METHODOLOGY_BREAKS, "one list, not two copies");
  const b = METHODOLOGY_BREAKS.find((x) => x.from === d(9, 23));
  assert.ok(b, "the 2026-09-23 TCGplayer break is registered");
  assert.equal(b!.to, d(10, 1), "the Index still flattens every step ending 23 Sep – 30 Sep");
  assert.equal(b!.settled, d(9, 24), "only a point dated the switch day itself can be either basis");
  assert.doesNotMatch(code(read("src/lib/market-index.ts")), /export const METHODOLOGY_BREAKS/, "defined once, in price-history.ts");
});

test("dropBreakWindow leaves a series that never reached the break untouched", () => {
  const s = pts(d(8, 26), d(9, 2), d(9, 9), d(9, 16));
  assert.deepEqual(dropBreakWindow(s), s);
  assert.deepEqual(dropBreakWindow([]), []);
});

test("dropBreakWindow restarts a crossing series at its first point certainly on the new basis", () => {
  const s = pts(d(9, 9), d(9, 16), d(9, 23), d(9, 30), d(10, 7));
  assert.deepEqual(dropBreakWindow(s).map((p) => p.t), [d(9, 30), d(10, 7)], "the ambiguous switch-day point goes with the old ones");
  // Points already after the window are kept as they are.
  const late = pts(d(9, 16), d(10, 7), d(10, 14));
  assert.deepEqual(dropBreakWindow(late).map((p) => p.t), [d(10, 7), d(10, 14)]);
});

test("a series whose newest point is from the switch day compares nothing", () => {
  const s = pts(d(9, 9), d(9, 16), d(9, 23));
  assert.deepEqual(dropBreakWindow(s).map((p) => p.t), [d(9, 23)], "one point: no move, no range, no change");
});

test("a live point appended during the window is all that is left until a new-basis snapshot exists", () => {
  const live = d(9, 25) + 12 * 3600_000;
  const s = [...pts(d(9, 16), d(9, 23)), { t: live, v: 800 }];
  assert.deepEqual(dropBreakWindow(s), [{ t: live, v: 800 }]);
});

test("dropBreakWindow keeps order, keeps extra fields, and defaults `settled` to `to`", () => {
  const rows = [
    { t: 1 * DAY, v: 5, cardId: "a" },
    { t: 10 * DAY, v: 6, cardId: "a" },
    { t: 12 * DAY, v: 7, cardId: "a" },
    { t: 30 * DAY, v: 8, cardId: "a" },
  ];
  const kept = dropBreakWindow(rows, [{ from: 10 * DAY, to: 20 * DAY }]);
  assert.deepEqual(kept, [rows[3]], "without `settled`, nothing inside [from, to) is trusted");
  const noLater = dropBreakWindow(rows.slice(0, 3), [{ from: 10 * DAY, to: 20 * DAY }]);
  assert.deepEqual(noLater, [rows[2]], "…and only the newest in-window point survives when nothing is later");
});

test("the break is explained to visitors only while it matters", () => {
  assert.ok(recentMethodologyBreak(d(9, 25)), "during the window");
  assert.ok(recentMethodologyBreak(d(10, 10)), "while weekly comparisons rebuild");
  assert.equal(recentMethodologyBreak(d(9, 20)), null, "not before it");
  assert.equal(recentMethodologyBreak(d(11, 20)), null, "not once the lists have rebuilt");
});

// ── The live GLOBAL point ────────────────────────────────────────────────────

test("globalLowUsd is the cheapest of AU/US/UK/SG in USD, the snapshot's own rule", () => {
  assert.equal(globalLowUsd({ lowestPriceCents: null }), null);
  assert.equal(globalLowUsd({ lowestPriceCents: null, lowestPriceCentsUs: 1000 }), 1000);
  const au = convertCents(1200, "AUD", "USD");
  assert.equal(globalLowUsd({ lowestPriceCents: 1200, lowestPriceCentsUs: 1000 }), Math.min(au, 1000));
  assert.equal(globalLowUsd({ lowestPriceCents: null, lowestPriceCentsUk: 700, lowestPriceCentsSg: 3000 }), Math.min(convertCents(700, "GBP", "USD"), convertCents(3000, "SGD", "USD")));
  // CA and EU are not part of the GLOBAL series, so they never set its live point.
  const withCaEu = { lowestPriceCents: null, lowestPriceCentsUs: 1000, lowestPriceCentsCa: 10, lowestPriceCentsEu: 10 } as Parameters<typeof globalLowUsd>[0];
  assert.equal(globalLowUsd(withCaEu), 1000);
});

test("price-import.ts snapshots the same four markets globalLowUsd reads", () => {
  // The importer keeps its own loop (editing it starts a full import through
  // refresh-prices.yml's push trigger), so the two are pinned together here.
  const src = read("src/lib/price-import.ts");
  const loop = /const usdCandidates: number\[\] = \[\];[\s\S]*?\] as \[Country, number \| null\]\[\]\)/.exec(src)?.[0] ?? "";
  const markets = [...loop.matchAll(/\["([A-Z]{2})", /g)].map((m) => m[1]);
  assert.deepEqual(markets, [...GLOBAL_LOW_MARKETS]);
});

// ── Every reader ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

// Files that read PriceHistory but never compare two of its points across time,
// or that another owner is changing. Each needs a reason; a new reader that
// compares points must import dropBreakWindow instead of joining this list.
const EXEMPT: Record<string, string> = {
  "src/lib/price-import.ts": "the writer; it reads only the newest snapshot day to gate the weekly write",
  "src/lib/sitemap-sections.ts": "reads the newest snapshot day for <lastmod>, nothing else",
  "src/lib/card-price-state.ts": "counts a card's distinct history days to decide indexability",
  "src/lib/public-api.ts":
    "publishes RECORDED prices (latest, ~1/7/30 days back, high, low) for API consumers, not a change; dropping points there would delete facts",
  "src/lib/premium.ts":
    "the portfolio series — owned by the free-tools/portfolio workstream (F) in the 2026-09-25 lineup change; remove this entry when it applies dropBreakWindow",
  "src/lib/screener.ts": "the Value Finder's loader, deleted with the Value Finder in the same change (only while the file still exists)",
};

test("every file that reads PriceHistory imports dropBreakWindow, or is exempt with a reason", () => {
  const readsHistory = /dbHistory\.priceHistory\b|FROM "PriceHistory"/;
  const offenders: string[] = [];
  const readers: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const rel = relative(ROOT, file);
    const src = code(readFileSync(file, "utf8"));
    if (!readsHistory.test(src)) continue;
    readers.push(rel);
    if (rel === "src/lib/price-history.ts") continue; // defines it
    if (EXEMPT[rel]) continue;
    if (!/import\s*\{[^}]*\bdropBreakWindow\b[^}]*\}\s*from\s*"(\.\/price-history|@\/lib\/price-history)"/.test(src)) {
      offenders.push(`${rel} reads PriceHistory but does not import dropBreakWindow`);
    }
  }
  assert.ok(readers.length >= 6, `fixture check: expected the known readers, found ${readers.join(", ")}`);
  assert.deepEqual(offenders, [], offenders.join("\n"));
  for (const [file, why] of Object.entries(EXEMPT)) assert.ok(why.length > 20, `${file} needs a real reason`);
});

test("each comparing reader actually applies the drop where it compares", () => {
  const fnBody = (file: string, name: string) => {
    const src = code(read(file));
    const at = src.search(new RegExp(`function ${name}\\b`));
    assert.ok(at >= 0, `${file}: expected ${name}`);
    return src.slice(at, at + 4000);
  };
  const sites: [string, string][] = [
    ["src/lib/price-history.ts", "computePriceMovers"],
    ["src/lib/price-history.ts", "computeRecentlyUpdated"],
    ["src/lib/market-index.ts", "computeRegionIndex"],
    ["src/lib/market-records.ts", "computeAllTimeRecords"],
    ["src/lib/rise-predictor.ts", "assembleRisingCards"],
    ["src/lib/price-table.ts", "computePriceTable"],
  ];
  for (const [file, fn] of sites) assert.match(fnBody(file, fn), /dropBreakWindow\(/, `${file} ${fn} must drop pre-break points`);
  // The Index's own level keeps the chain-link treatment.
  assert.match(code(read("src/lib/market-index.ts")), /chainLinkSeries\(days, byCard, cards\.map\(\(c\) => c\.id\), weights, METHODOLOGY_BREAKS\)/);
});

test("the exemption list names only files that exist, or the one being deleted", () => {
  for (const file of Object.keys(EXEMPT)) {
    if (file === "src/lib/screener.ts") continue;
    assert.ok(existsSync(join(ROOT, file)), `${file} is exempt but no longer exists — drop the entry`);
  }
});
