import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Strips block comments (which also covers JSX `{/* … */}`) and WHOLE-LINE `//`
// comments only. A trailing-`//` strip would also eat the `//` in an `https://`
// string literal and mis-pair the quotes the className scan below relies on.
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
// Every className, whether a plain string or a template literal (TodaysTopDeals
// builds its grid's class from a GRID_COLS lookup inside backticks).
const classNamesOf = (src: string) =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);

// ─────────────────────────────────────────────────────────────────────────────
// A grid whose column template only starts at a breakpoint was zooming the
// whole site out on 320–360px phones (UI audit, 2026-09-23).
//
// `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` has NO column template below
// 640px. The browser then gives the grid one implicit `auto` track, and an auto
// track can never be narrower than its items' min-content width. These grids
// hold `truncate` (white-space: nowrap) names beside `shrink-0` prices, chips
// and badges, so each item's min-content is the WHOLE UNWRAPPED ROW — and the
// `truncate` / `min-w-0` inside it never gets a chance to take effect, because
// the track has already grown to fit the text it was meant to clip.
//
// Measured (layout-viewport width on a phone-sized mobile context):
//   /        372px at 320 and 344, 373px at 360 — the Today's Top Deals track
//            alone was 355.6px, 3px short of showing in the 375px audit pass
//   /sets    334px at 320
//   /blog    322px at 320 (the "Browse by topic" grid; /guides shares it)
//   /movers  693px at every phone width (PriceWatch, P07's rows)
//
// Chrome for Android, given content wider than the device, WIDENS THE LAYOUT
// VIEWPORT (window.innerWidth came back 372, not 320) and scales the page down
// to fit — then remembers that zoom per site, so every other page renders
// shrunken too. Same mechanism as RegionToggle's un-wrappable market row: see
// DECISIONS.md 2026-09-22, "One un-wrappable row was zooming the whole site out
// on phones", and tests/region-toggle-fit.test.ts.
//
// Why a SOURCE pin rather than trusting the overflow audit: `html` carries
// `overflow-x: clip`, so an element-overflow scan never sees the offending
// grid — only `window.innerWidth` growing gives it away — and whether a grid
// overflows at all depends on today's live card and article name lengths. A
// quiet day passes any runtime check; the missing template is always wrong.
//
// The fix is a base `grid-cols-1` on the grid element itself. Tailwind compiles
// it to `repeat(1, minmax(0, 1fr))`; the 0 minimum lets the single track shrink
// to the container, so the inner truncation finally works. The existing
// sm:/md:/lg: templates are emitted later in the stylesheet and still override
// it from their breakpoint up, so tablet and desktop layouts are unchanged.
//
// Extending: add a row per grid. The anchor must be a substring unique to that
// grid's className within its file — EVERY className containing it is checked.
// ─────────────────────────────────────────────────────────────────────────────

const GRIDS: { file: string; anchor: string; what: string }[] = [
  { file: "src/components/TodaysTopDeals.tsx", anchor: "items-stretch gap-4", what: "homepage Today's Top Deals (372px at 320)" },
  { file: "src/app/sets/page.tsx", anchor: "gap-3 sm:grid-cols-2 lg:grid-cols-3", what: "/sets released sets (334px at 320)" },
  { file: "src/components/FilterableArticles.tsx", anchor: "gap-2 sm:grid-cols-2 lg:grid-cols-3", what: "/blog and /guides 'Browse by topic' (322px at 320)" },
  { file: "src/components/PriceWatch.tsx", anchor: "gap-4 xl:grid-cols-3", what: "/movers panels (693px at every phone width)" },
  { file: "src/components/RouteLoading.tsx", anchor: "gap-4 xl:grid-cols-3", what: "/movers loading skeleton (mirrors PriceWatch)" },
  { file: "src/components/RouteLoading.tsx", anchor: "gap-3 sm:grid-cols-2 lg:grid-cols-3", what: "/sets loading skeleton (mirrors /sets)" },
  { file: "src/app/market/page.tsx", anchor: "gap-4 sm:grid-cols-2", what: "/market movers pair (341px at 320)" },
  { file: "src/components/TradeCalculator.tsx", anchor: "gap-4 md:grid-cols-2", what: "/trade both-sides grid (603px at 390 with two cards added)" },
];

for (const { file, anchor, what } of GRIDS) {
  test(`${what}: the grid has a shrinkable base column template below its first breakpoint`, () => {
    const hits = classNamesOf(codeOnly(read(file))).filter((c) => c.includes(anchor));
    assert.ok(
      hits.length > 0,
      `no className in ${file} contains "${anchor}" — the grid was restyled or moved; update this row's anchor to the grid's new classes`,
    );
    for (const cls of hits) {
      const tokens = cls.split(/\s+/);
      assert.ok(tokens.includes("grid"), `"${cls}" in ${file} is not a grid — the anchor "${anchor}" matched the wrong element`);
      assert.ok(
        tokens.includes("grid-cols-1"),
        `"${cls}" in ${file} has no base column template: below its first breakpoint the grid gets one implicit auto ` +
          `track as wide as its widest unwrapped row, and Chrome for Android widens the layout viewport and zooms the ` +
          `whole site out. Add \`grid-cols-1\` (repeat(1, minmax(0, 1fr))).`,
      );
    }
  });
}
