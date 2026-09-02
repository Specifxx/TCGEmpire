import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LIB = "src/lib/sealed-rise-predictor.ts";
const PAGE = "src/app/tools/rising-sealed/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Rising Sealed (2026-09-02) — the sealed-side sibling of Rising Cards
// (rise-predictor.ts). Reuses that module's own backtest() and ai-insight.ts's
// computeSignals() directly rather than reimplementing lookahead-free
// backtesting a second time.
//
// HONEST LIMITS, structurally enforced: there is no search/view-tracking
// signal for sealed products (a deliberate choice, not an oversight — see
// sealed-index.ts's own file header for the same reasoning), so unlike cards'
// RiseComponents (which carries a `velocity` field that is legitimately zero
// until DemandSnapshot rows accrue), SealedRiseComponents has NO demand or
// velocity field at all. These tests pin that absence structurally, not just
// in prose — a zeroed-out fake field would be worse than an honestly missing one.
// ─────────────────────────────────────────────────────────────────────────────

test("reuses backtest() and computeSignals() rather than reimplementing lookahead-free backtesting", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /import\s*\{\s*backtest,\s*type RiseBacktest\s*\}\s*from\s*"\.\/rise-predictor"/);
  assert.match(code, /import\s*\{\s*computeSignals,\s*type Signals\s*\}\s*from\s*"\.\/ai-insight"/);
  assert.doesNotMatch(code, /function backtest/, "must not redefine the backtest algorithm");
  assert.doesNotMatch(code, /function computeSignals/, "must not redefine the signals helper");
});

test("rise-predictor.ts's backtest is exported specifically because it never touches demand", () => {
  // The whole reason it's safe to share: rise-predictor.ts's own comment on
  // backtest() already says it validates price-timing ALONE. Pin the export
  // and the comment so a future edit can't quietly reintroduce a demand
  // dependency into a function two very differently-scoped callers now share.
  const src = codeOnly(read("src/lib/rise-predictor.ts"));
  assert.match(src, /export function backtest\(seriesById: Map<string, PricePoint\[\]>\): RiseBacktest \| null/);
});

test("SealedRiseComponents has no demand or velocity field — not even a zeroed-out placeholder", () => {
  const code = codeOnly(read(LIB));
  const iface = code.slice(code.indexOf("export interface SealedRiseComponents"), code.indexOf("\n}", code.indexOf("export interface SealedRiseComponents")));
  assert.doesNotMatch(iface, /demand|velocity/i, "sealed products have no demand/view-tracking signal to expose, honestly or otherwise");
  assert.match(iface, /room: number/);
  assert.match(iface, /scarcity: number/);
  assert.match(iface, /momentum: number/);
  assert.match(iface, /volatility: number/);
});

test("scarcity is a real live in-stock listing count, not a demand proxy", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /storeCount/, "must read the group's real live in-stock listing count");
  assert.doesNotMatch(code, /searchCount|viewCount|searchPerDay|DemandSnapshot|getDemandVelocity/i, "no demand-tracking source exists for sealed products");
});

test("universe is the whole shipped (non-preorder) catalogue, no SCAN/DISPLAY cap — the catalogue is already small", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /getSealedGroups\(market\)/, "must use the shipped-only listing, matching sealed-index.ts's own constituent rule");
  assert.doesNotMatch(code, /getAllSealedGroups|getPreorderGroups/);
  assert.doesNotMatch(code, /\bSCAN\b|\bDISPLAY\b/, "no scan/display cap — every qualifying product is shown, ranked");
});

test("single-market scope only — no GLOBAL, no historySource()/CA-EU derivation", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /export async function getRisingSealed\(market: Country = DEFAULT_COUNTRY\)/);
  assert.doesNotMatch(code, /GLOBAL/, "matches sealed-index.ts's own removal of a cross-region composite");
  assert.doesNotMatch(code, /historySource/, "every market's sealed history is tracked natively — no derivation layer needed");
  assert.match(
    code,
    /dbHistory\.sealedPriceHistory\.findMany\(\{\s*where:\s*\{\s*country:\s*market,\s*groupKey:\s*\{\s*in:\s*groups\.map/,
    "must read this market's own history directly",
  );
});

test("never throws — a data anomaly degrades to an empty analysis, matching getRisingCards", () => {
  const code = codeOnly(read(LIB));
  assert.match(code, /export async function getRisingSealed[\s\S]*?try \{[\s\S]*?catch \(err\) \{[\s\S]*?return emptyAnalysis\(market\);/);
});

// ─────────────────────────────────────────────────────────────────────────────
// The page.
// ─────────────────────────────────────────────────────────────────────────────

test("the page is dynamic, market-switchable (no GLOBAL pill), and Premium-gated like Rising Cards", () => {
  const src = read(PAGE);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /<MarketSwitcher[\s\S]{0,150}basePath="\/tools\/rising-sealed"/, "must reuse MarketSwitcher, not a bespoke GLOBAL+country pill (there is no GLOBAL scope here)");
  assert.match(src, /isPremium\(user\)/);
  assert.match(src, /ADSENSE_REVIEW_MODE/, "must honour the same review-mode gate bypass as /tools/rising");
  assert.match(src, /blur-\[5px\]/, "the free teaser must blur the locked rows, matching the paywall pattern scripts/adsense-audit.ts scans for");
  assert.match(src, /Unlock the full/);
});

test("the FAQ explicitly discloses the narrower signal set relative to Rising Cards", () => {
  const src = read(PAGE);
  const faqs = src.slice(src.indexOf("RISING_FAQS"), src.indexOf("function Spark"));
  assert.match(faqs, /no demand or demand-velocity component/i, "must say plainly what is missing, not just what is included");
  assert.match(faqs, /Rising Cards/, "must name the sibling tool being contrasted against");
});

test("rows link to /sealed?q=, not a card-specific href — no per-product page exists", () => {
  const src = codeOnly(read(PAGE));
  assert.doesNotMatch(src, /cardHref|cardImageAlt/);
  assert.match(src, /sealedImageAlt\(/);
  assert.match(src, /href=\{`\/sealed\?q=\$\{encodeURIComponent\(p\.name\)\}`\}/);
});

test("the page is discoverable: sitemap, tools hub, nav, premium page and dashboard all point at it", () => {
  const checks: [string, RegExp][] = [
    ["src/lib/sitemap-sections.ts", /\/tools\/rising-sealed/],
    ["src/app/tools/page.tsx", /href:\s*"\/tools\/rising-sealed"/],
    ["src/components/nav-groups.ts", /href:\s*"\/tools\/rising-sealed"/],
    ["src/app/premium/page.tsx", /href:\s*"\/tools\/rising-sealed"/],
    ["src/app/dashboard/page.tsx", /href:\s*"\/tools\/rising-sealed"/],
  ];
  for (const [path, pattern] of checks) {
    assert.match(read(path), pattern, `${path} must link to /tools/rising-sealed`);
  }
});
