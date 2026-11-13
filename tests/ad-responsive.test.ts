import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Affiliate banners must never be wider than the viewport that shows them.
// ─────────────────────────────────────────────────────────────────────────────
// A fixed 728px leaderboard was rendered from Tailwind's `sm` (640px), so on
// every page carrying one — the homepage, /decks, all ~1,400 card pages — the
// DOCUMENT scrolled sideways between 640px and ~760px. Measured in a real
// browser: document scrollWidth 684 in a 640px viewport, 714 in a 700px one.
// A second instance survived that fix at 1024px, where the card page's content
// column is narrower than the viewport, so the banner overflowed its column.
//
// "Horizontal scrolling on mobile" is a Google mobile-usability failure and an
// AdSense site-behaviour risk, and it is invisible in review: the page looks
// fine at desktop width and fine on a phone, and is broken only in the band
// between them. scripts/mobile-check.ts audited 375px only at the time, which
// is exactly why it never surfaced — it now also sweeps the 640-790px tablet
// band for the same reason (see its TABLET_WIDTHS note).
//
// Two independent guarantees, and this asserts both, because either alone has
// already proved insufficient:
//   1. BREAKPOINT — a >600px unit may only appear from `md` (768px) up.
//   2. MAX-WIDTH  — every banner and every wrapper is capped at its container,
//      so a narrow COLUMN at a wide VIEWPORT cannot overflow either.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const INLINE = "src/components/InlineAds.tsx";

// 2026-11-13 (owner): the fixed-size leaderboard, rect and billboard banners (EbayAd, TcgplayerAd) are gone. The one block that
// remains is fluid: a card capped at its column whose tiles scroll sideways inside it, so nothing can widen the document.
test("the leaderboard banner components are gone, so no fixed 728px or 970px unit can overflow", () => {
  for (const f of ["src/components/EbayAd.tsx", "src/components/TcgplayerAd.tsx", "src/components/FooterAds.tsx"]) {
    assert.ok(!existsSync(join(process.cwd(), f)), `${f} must stay deleted`);
  }
});

test("the one ad block is capped at its column and scrolls its tiles sideways inside it", () => {
  const src = read(INLINE);
  assert.match(src, /className=\{`card-surface min-w-0 p-4/, "the block itself may shrink below its content");
  assert.match(src, /overflow-x-auto/, "tiles scroll inside the block");
  assert.match(src, /shrink-0 snap-start/, "tiles keep their width instead of squeezing");
});

test("a tile fits the narrowest audited viewport, so a phone shows at least one whole tile", () => {
  const tile = Number(/const TILE_W = (\d+);/.exec(read(INLINE))?.[1]);
  assert.ok(tile > 0 && tile <= 375 - 32 - 32, `tile width ${tile}px must fit a 375px phone inside the block's padding`);
});

// ─────────────────────────────────────────────────────────────────────────────
// The hero rails used to be asserted here — three tests covering their z-index
// (they once shipped unclickable behind the hero's own text column), their
// breakpoint gating, and their per-rail affiliate disclosure.
//
// Removed 2026-08-16 along with the rails themselves: the slots either side of
// the hero are now deliberately empty (see CinematicHero), and the component
// they asserted against, src/components/home/HeroAdRail.tsx, no longer exists.
// tests/hero-rail-clickable.test.ts went the same way for the same reason.
//
// The lesson they encoded is NOT rail-specific and outlived them: a transparent
// element still hit-tests across its whole border box, so an absolutely
// positioned creative can render perfectly and earn nothing. If anything is ever
// placed in those slots again, re-derive that check against the new component
// rather than trusting layout maths — nothing else in this repo evaluates hit
// testing.
