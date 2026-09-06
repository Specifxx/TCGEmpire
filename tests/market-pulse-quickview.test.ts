import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Line comments stripped before block comments — see the note in
// business-diagnostic-fixes.test.ts's readCode for why the order matters.
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Market Pulse cards open the QuickView popup, matching CardTile everywhere
// else on the site — not a full page navigation.
// ─────────────────────────────────────────────────────────────────────────────
// getPriceMovers() already hydrates each Mover.card with cardTileSelect(country)
// (see lib/price-history.ts), i.e. a full CardTileData — the same shape
// useQuickView().open() takes everywhere else it's called. There was no data
// gap; the click handler just navigated instead of opening the popup.

test("PulseCard opens QuickView on click instead of always navigating", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(code, /useQuickView/, "must import and use the shared QuickView hook");
  assert.match(code, /open\(c\)/, "a plain click must open the popup for this card");
  assert.match(code, /e\.preventDefault\(\)/, "navigation must be prevented when the popup opens");
});

test("PulseCard still keeps a real href (SEO, sharing, middle/ctrl-click)", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(code, /href=\{cardHref\(c\)\}/, "the underlying <Link> must keep a real card URL");
});

test("PulseCard ignores modified clicks and drag-synthesized clicks, matching CardTile's guard", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  assert.match(
    code,
    /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0/,
    "a modified click (new-tab intent) must fall through to normal navigation, not the popup"
  );
  assert.match(
    code,
    /downRef/,
    "a scroll/drag gesture on touch must not be mistaken for a tap that opens the popup"
  );
});

test("the market_pulse_click analytics event still fires regardless of click type", () => {
  const code = readCode("src/components/home/MarketPulse.tsx");
  const at = code.indexOf("function onClick(e: React.MouseEvent)");
  assert.ok(at >= 0, "PulseCard's onClick handler moved — re-derive this test");
  const body = code.slice(at, at + 400);
  const trackAt = body.indexOf("track(");
  const guardAt = body.search(/e\.metaKey/);
  assert.ok(trackAt >= 0 && guardAt >= 0, "expected both the analytics call and the modifier-key guard");
  assert.ok(trackAt < guardAt, "the click must be tracked even for a modified/new-tab click, not only when the popup opens");
});
