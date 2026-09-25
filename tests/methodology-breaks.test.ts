import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { METHODOLOGY_BREAKS, dropBreakWindow, globalLowUsd, recentMethodologyBreak, currentBasisStart, GLOBAL_LOW_MARKETS } from "../src/lib/price-history";
import { METHODOLOGY_BREAKS as FROM_INDEX } from "../src/lib/market-index";
import { METHODOLOGY_BREAKS as FROM_MODULE } from "../src/lib/methodology-breaks";
import { pickCurrentBoards, type RecordRow } from "../src/lib/market-records";
import { convertCents } from "../src/lib/fx";

// ─────────────────────────────────────────────────────────────────────────────
// History integrity across a METHODOLOGY BREAK (2026-09-25).
//
// On 2026-09-23 the US TCGplayer row switched from market price to the cheapest
// English listing, a median 25% lower. PriceHistory records each card's low
// across markets, so that re-basing sits in the weekly series. Only the Index
// handled it (chain-linked, flat across the window); /movers, Rising Cards, the
// homepage 7-day column, the /market constituents and the records board all
// printed it as a market-wide crash. METHODOLOGY_BREAKS now lives beside
// dropBreakWindow in lib/methodology-breaks.ts — no imports, so a reader that a
// client bundle can reach may use it — re-exported by lib/price-history.ts
// (where server readers import it) and by market-index.ts. Every reader that
// compares two points of PriceHistory goes through it: the files that query the
// table, AND the ones that get a card's series from getPriceHistory() and
// compare its points (the card-page narrative did not, until the review).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DAY = 86400_000;
const d = (m: number, day: number) => Date.UTC(2026, m - 1, day);
const pts = (...days: number[]) => days.map((t, i) => ({ t, v: 1000 + i }));

test("METHODOLOGY_BREAKS is one list: defined in methodology-breaks.ts, re-exported by price-history and market-index", () => {
  assert.equal(FROM_INDEX, METHODOLOGY_BREAKS, "one list, not two copies");
  assert.equal(FROM_MODULE, METHODOLOGY_BREAKS, "price-history re-exports the module's list");
  const mod = read("src/lib/methodology-breaks.ts");
  assert.doesNotMatch(code(mod), /^\s*import\b/m, "no imports: a client-reachable reader must be able to use it without Prisma");
  assert.match(mod, /export const METHODOLOGY_BREAKS/);
  assert.doesNotMatch(code(read("src/lib/price-history.ts")), /export const METHODOLOGY_BREAKS/, "re-exported, not redefined");
  const b = METHODOLOGY_BREAKS.find((x) => x.from === d(9, 23));
  assert.ok(b, "the 2026-09-23 TCGplayer break is registered");
  assert.equal(b!.to, d(10, 1), "the Index still flattens every step ending 23 Sep – 30 Sep");
  assert.equal(b!.settled, d(9, 24), "only a point dated the switch day itself can be either basis");
  assert.doesNotMatch(code(read("src/lib/market-index.ts")), /export const METHODOLOGY_BREAKS/, "defined once, in methodology-breaks.ts");
});

test("currentBasisStart is the settled day of the latest break that has opened", () => {
  assert.equal(currentBasisStart(d(9, 20)), null, "before any break, there is no basis start");
  assert.equal(currentBasisStart(d(9, 23)), d(9, 24), "from the day a break opens, its settled day");
  assert.equal(currentBasisStart(d(12, 1)), d(9, 24), "and it never ages out — dropBreakWindow always restarts there");
  const breaks = [
    { from: 10 * DAY, to: 20 * DAY, settled: 11 * DAY },
    { from: 50 * DAY, to: 60 * DAY },
  ];
  assert.equal(currentBasisStart(30 * DAY, breaks), 11 * DAY);
  assert.equal(currentBasisStart(55 * DAY, breaks), 60 * DAY, "`settled` defaults to `to`");
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

// dropBreakWindow from where server readers get it (price-history) or from the
// dependency-free module itself (methodology-breaks), by any relative path.
const IMPORTS_DROP =
  /import\s*\{[^}]*\bdropBreakWindow\b[^}]*\}\s*from\s*"(?:\.{1,2}\/(?:\.\.\/)*|@\/lib\/)(?:price-history|methodology-breaks)"/;

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
  "src/lib/rise-predictor.ts":
    "Rising Cards keeps the pre-break signals by the owner's call (2026-09-25, 'for now we can still use the old signals'): dropping them left no card with five weekly points",
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
    if (!IMPORTS_DROP.test(src)) {
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

// ── Indirect readers: getPriceHistory() callers ──────────────────────────────
// A file that never names the table can still compare its points: the card
// page fetches a card's series through getPriceHistory() and hands it to the
// narrative, whose trajectory() compared 7/30/90-day points and the tracked
// high/low straight across the 09-23 re-basing — "down 25% over the last week
// … the cheapest we have recorded it" on every /card page. So every caller of
// getPriceHistory is classified here: what it does with the points, and where
// the drop happens if it compares them. A new caller fails until it is listed
// (or imports dropBreakWindow itself).
const INDIRECT: Record<string, string> = {
  "src/app/card/[id]/page.tsx":
    "hands the series to the narrative (card-narrative.ts trajectory() drops, pinned below) and draws nothing comparative itself",
  "src/app/api/card/[id]/insight/route.ts": "hands the series to getInsight (lib/ai-insight.ts), which drops before computeSignals — pinned below",
  "src/components/PriceHistoryChart.tsx":
    "draws every recorded point as a chart; the step is visible in the line itself, and PriceChart's ▲/▼ arrow drops the break window (rawCardHistory, pinned below)",
  "src/app/api/card/[id]/history/route.ts":
    "serves a card's recorded points to the client charts (QuickView, LocalizedPriceHistory), whose PriceChart arrow drops the break window (pinned below)",
  "src/app/api/v1/card/[id]/history.json/route.ts": "publishes recorded points to API consumers; dropping any would delete facts",
};

test("every getPriceHistory caller imports dropBreakWindow, or is classified with a reason", () => {
  const callsIt = /import\s*\{[^}]*\bgetPriceHistory\b[^}]*\}\s*from/;
  const callers: string[] = [];
  const unclassified: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const rel = relative(ROOT, file);
    if (rel === "src/lib/price-history.ts") continue;
    const src = code(readFileSync(file, "utf8"));
    if (!callsIt.test(src)) continue;
    callers.push(rel);
    if (INDIRECT[rel] || IMPORTS_DROP.test(src)) continue;
    unclassified.push(`${rel} gets a card's history from getPriceHistory: import dropBreakWindow where it compares points, or list it in INDIRECT with a reason`);
  }
  assert.ok(callers.includes("src/app/card/[id]/page.tsx"), `fixture check: expected the card page among ${callers.join(", ")}`);
  assert.deepEqual(unclassified, [], unclassified.join("\n"));
  for (const [file, why] of Object.entries(INDIRECT)) {
    assert.ok(why.length > 20, `${file} needs a real reason`);
    assert.ok(existsSync(join(ROOT, file)), `${file} is listed as an indirect reader but no longer exists — drop the entry`);
  }
});

test("the consumers the indirect readers hand points to really drop them", () => {
  const narrative = code(read("src/lib/content/card-narrative.ts"));
  const traj = narrative.slice(narrative.search(/function trajectory\b/), narrative.search(/function trajectory\b/) + 1500);
  assert.match(traj, /const pts = dropBreakWindow\(c\.history\.points\)/, "the card-page trajectory compares only current-basis points");
  // …imported from the dependency-free module: card-narrative is reachable from
  // a client bundle (lib/box-ev.ts → BoxEvCalculator), so price-history — and
  // Prisma with it — must not be.
  assert.match(narrative, /import \{ dropBreakWindow \} from "@\/lib\/methodology-breaks";/);
  assert.doesNotMatch(narrative, /from "@\/lib\/price-history"|from "\.\.\/price-history"/);
  const insight = code(read("src/lib/ai-insight.ts"));
  assert.match(insight, /computeSignals\(dropBreakWindow\(points\)\)/, "getInsight drops before it scores");
});

// ── Records since the basis ──────────────────────────────────────────────────

const row = (over: Partial<RecordRow>): RecordRow => ({
  card: { id: "c" } as RecordRow["card"],
  peakCents: 1000,
  troughCents: 1000,
  nowCents: 1000,
  peakDay: null,
  troughDay: null,
  offPeakPct: 0,
  days: 3,
  ...over,
});

test("a card that has not moved is not 'at its low'; one that came down to it is", () => {
  const flat = row({ card: { id: "flat" } as RecordRow["card"] });
  const fell = row({ card: { id: "fell" } as RecordRow["card"], peakCents: 1300, troughCents: 1000, nowCents: 1005, offPeakPct: 22.7 });
  const tiny = row({ card: { id: "tiny" } as RecordRow["card"], peakCents: 1030, troughCents: 1000, nowCents: 1000, offPeakPct: 2.9 });
  const { atLow, offPeak } = pickCurrentBoards([flat, fell, tiny], 10);
  assert.deepEqual(atLow.map((r) => r.card.id), ["fell"], "peak = trough = now is not a low, and a 3% wobble is not a range");
  assert.deepEqual(offPeak.map((r) => r.card.id), ["fell"]);
});

test("the records page names the basis date above the boards that compare with it", () => {
  const lib = code(read("src/lib/market-records.ts"));
  assert.match(lib, /currentSince: basisStart != null \? isoDay\(new Date\(basisStart\)\) : null/);
  assert.match(lib, /if \(basisStart != null && seg\[0\]\.t < basisStart\) continue;/, "a series that never reached the basis is not a record since it");
  const page = read("src/app/market/records/page.tsx");
  assert.match(page, /const since = prettyDay\(records\.currentSince\);/);
  assert.match(page, /heading=\{since \? `Furthest below their high since \$\{since\}` : "Furthest below their all-time high"\}/);
  assert.match(page, /heading=\{since \? `At their lowest since \$\{since\}` : "At their all-time low"\}/);
});

test("the card chart's ▲/▼ arrow never measures across a break; the Index and portfolio arrows are untouched", () => {
  // Review, 2026-09-25: the arrow compared the first and last raw points, so a
  // range spanning 23 Sep showed the US sourcing change as a ~25% drop while
  // /movers, the verdict and the Index all held it flat.
  const chart = code(read("src/components/PriceChart.tsx"));
  assert.match(chart, /import \{ dropBreakWindow \} from "@\/lib\/methodology-breaks";/, "the dependency-free module, safe in a client bundle");
  assert.match(chart, /const trend = rawCardHistory \? dropBreakWindow\(data\) : data;/);
  assert.match(chart, /const delta = tLast - tFirst;/);
  for (const f of ["src/components/LocalizedPriceHistory.tsx", "src/components/QuickView.tsx"]) {
    assert.match(read(f), /<PriceChart[^>]*\brawCardHistory\b/, `${f} draws a raw card series`);
  }
  // Chain-linked series already hold a break flat; cutting them would hide real moves.
  for (const f of ["src/components/IndexChart.tsx", "src/app/portfolio/page.tsx"]) {
    assert.doesNotMatch(read(f), /rawCardHistory/, `${f} is chain-linked, not raw`);
  }
});
