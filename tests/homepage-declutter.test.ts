import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Homepage declutter pass — direct user feedback: too many numbers, broken
// card images in Today's Top Deals, clicking a deal should preview it instead
// of navigating away, Undervalued isn't worth the space, and Market Pulse's
// 8-card grid should be a smaller, slowly-animating marquee.
// ─────────────────────────────────────────────────────────────────────────────

test("Today's Top Deals no longer fetches or renders an Undervalued column", () => {
  const dealsCode = readCode("src/lib/top-deals.ts");
  assert.doesNotMatch(dealsCode, /getUndervalued\(/, "top-deals.ts must not call getUndervalued() — Value Finder calls it directly now");
  assert.doesNotMatch(dealsCode, /dealType:\s*"undervalued"/, "no branch may still produce an undervalued deal");
  assert.doesNotMatch(dealsCode, /undervalued:\s*Deal\[\]/, "TopDeals must not declare an undervalued field");

  const uiCode = readCode("src/components/TodaysTopDeals.tsx");
  assert.doesNotMatch(uiCode, /key:\s*"undervalued"/, "the COLUMNS list must not include an undervalued entry");
});

test("Value Finder (the dedicated tool page) still works — getUndervalued wasn't deleted, just decoupled from the homepage feed", () => {
  const screenerCode = readCode("src/lib/screener.ts");
  assert.match(screenerCode, /export async function getUndervalued/, "getUndervalued must still exist for /tools/value-finder");
  const valueFinderCode = readCode("src/app/tools/value-finder/page.tsx");
  assert.match(valueFinderCode, /getUndervalued\(/, "the Value Finder page must still call it directly");
});

test("the deal badge is a plain percentage — no 'was $X' reference price cluttering the row", () => {
  const code = readCode("src/components/TodaysTopDeals.tsx");
  assert.doesNotMatch(code, /was \$\{formatMoney/, 'no "was $X" text anywhere in the component');
});

test("Deal carries a QuickView-ready card object for the two card-based deal types", () => {
  const code = readCode("src/lib/top-deals.ts");
  assert.match(code, /card:\s*CardTileData\s*\|\s*null/, "Deal must carry an optional full card-tile payload");
  // savings-vs-market and price-drops both hydrate `card` from data that's
  // already a full CardTileData (cardTileSelect); cheapest-sealed isn't a
  // card and must stay null.
  const savingsAt = code.indexOf('dealType: "savings-vs-market"');
  const dropsAt = code.indexOf('dealType: "price-drops"');
  const sealedAt = code.indexOf('dealType: "cheapest-sealed"');
  assert.match(code.slice(savingsAt, savingsAt + 500), /card:\s*it\.card/);
  assert.match(code.slice(dropsAt, dropsAt + 500), /card:\s*m\.card/);
  assert.match(code.slice(sealedAt, sealedAt + 600), /card:\s*null/);
});

test("clicking a card deal opens QuickView instead of always navigating, matching CardTile/MarketPulse", () => {
  const code = readCode("src/components/TodaysTopDeals.tsx");
  assert.match(code, /useQuickView/, "must import and use the shared QuickView hook");
  assert.match(code, /open\(deal\.card\)/, "a plain click on a card deal must open the popup");
  assert.match(code, /e\.preventDefault\(\)/, "navigation must be prevented when the popup opens");
  assert.match(
    code,
    /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0/,
    "a modified click (new-tab intent) must fall through to normal navigation"
  );
  assert.match(code, /downRef/, "a scroll/drag gesture on touch must not be mistaken for a tap that opens the popup");
  assert.match(code, /if \(!deal\.card\) return;/, "a deal with no QuickView payload (e.g. a fallback row) must fall through to a normal navigation, not silently no-op");
});

test("deal images render as a plain <img>, not next/image — any CDN host works, matching the bug this fixes", () => {
  const code = readCode("src/components/TodaysTopDeals.tsx");
  assert.doesNotMatch(code, /from "next\/image"/, "must not import next/image — its host allow-list is exactly what broke Vendetta/legacy-hosted deal images");
  assert.match(code, /<img\b/, "must render the thumbnail with a plain img tag");
});

// ─────────────────────────────────────────────────────────────────────────────
// The three Market Pulse tests that used to live here (3+3 trim, the slow
// marquee + prefers-reduced-motion, the inert duplicated track half) were
// removed on 2026-09-17: the owner had Market Pulse taken off the homepage, and
// with no other page rendering it the component was deleted rather than left as
// unrendered code guarded by tests. tests/market-pulse-quickview.test.ts went
// with it for the same reason. Git history has both if it ever comes back.
//
// What this file still guards — Today's Top Deals' declutter (no Undervalued
// column, no "was $X" badge, QuickView on click, plain <img> thumbnails) — is
// untouched by that removal and all still renders.
// ─────────────────────────────────────────────────────────────────────────────

test("Market Pulse is gone from the homepage, and left nothing dangling behind it", () => {
  const home = readCode("src/components/home/HomeSections.tsx");
  assert.ok(!/<MarketPulse/.test(home), "the homepage must not render Market Pulse");
  assert.ok(!/toPulseMovers/.test(home), "its server/client trim helper must not be imported either");
  // The helper existed only for this component; it went with it, so nothing in
  // src/ may still reference it.
  assert.ok(
    !/export function toPulseMovers/.test(readCode("src/lib/price-history.ts")),
    "toPulseMovers had exactly one caller and must not linger as a helper with none",
  );
});

test("Recently viewed is the first thing on the homepage, not the last", () => {
  // Moved from the bottom of HomeSections to the top (2026-09-19, owner
  // request). Returning visitors were the one group who had to scroll past
  // every section on the page to reach the single row addressed to them.
  const code = readCode("src/components/home/HomeSections.tsx");
  const recent = code.indexOf("<RecentlyViewedRail");
  assert.ok(recent > 0, "the homepage must still render the rail");
  // Every other section comes after it.
  for (const tag of ["<EbayPicks", "<PopularCardsCarousel", "<TodaysTopDeals", "<PartnersStrip"]) {
    const at = code.indexOf(tag);
    assert.ok(at > 0, `expected ${tag} on the homepage`);
    assert.ok(recent < at, `Recently viewed must render above ${tag}`);
  }
  // …and it appears exactly once. The old bottom copy has to be gone, not
  // duplicated — two rails would render the same eight chips twice.
  assert.equal(code.split("<RecentlyViewedRail").length - 1, 1, "exactly one rail on the homepage");
});

test("putting Recently viewed first does not change the page a new visitor or a crawler sees", () => {
  // The whole reason the top slot is free for it: the rail reads localStorage
  // through useSyncExternalStore, so the server snapshot is empty and it
  // returns null on a first-ever visit. eBay Picks is still the top slot in
  // the prerendered HTML — see tests/game-before-money.test.ts, which pins
  // that decision.
  const rail = read("src/components/home/RecentlyViewedRail.tsx");
  assert.match(rail, /useRecentCards\(\)/, "the rail must read from the client-only store");
  assert.match(rail, /if \(recent\.length === 0\) return null;/, "an empty history must render nothing at all");

  const store = read("src/lib/recently-viewed.ts");
  assert.match(
    store,
    /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/,
    "a server snapshot is what keeps the prerendered homepage rail-free",
  );
});
