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

test("Market Pulse is trimmed to 3 risers + 3 fallers (was 4+4=8)", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(code, /COUNT_PER_SIDE\s*=\s*3/, "expected the per-side count constant to be 3");
});

test("Market Pulse auto-scrolls right-to-left via a CSS marquee, slowly, and respects prefers-reduced-motion", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(code, /animate-marquee/, "must use the marquee animation utility");
  assert.match(code, /motion-reduce:animate-none/, "must freeze for prefers-reduced-motion");
  assert.match(code, /group-hover:\[animation-play-state:paused\]/, "hovering must pause the scroll so a card is actually clickable/readable");

  const twConfig = readCode("tailwind.config.ts");
  const marqueeAnim = twConfig.match(/marquee:\s*"marquee\s+(\d+)s/);
  assert.ok(marqueeAnim, "expected a marquee animation duration declared in tailwind.config.ts");
  const seconds = Number(marqueeAnim![1]);
  assert.ok(seconds >= 25, `marquee duration (${seconds}s) must read as slow, not a fast ticker`);
});

test("the marquee's duplicated track half is inert to assistive tech and keyboard tabbing", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(code, /aria-hidden=\{duplicate \|\| undefined\}/, "the visual-only duplicate half must be aria-hidden");
  assert.match(code, /tabIndex=\{duplicate \? -1 : undefined\}/, "the visual-only duplicate half must not be keyboard-focusable");
});
