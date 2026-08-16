import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
// between them. scripts/mobile-check.ts audits 375px only, which is exactly why
// it never surfaced.
//
// Two independent guarantees, and this asserts both, because either alone has
// already proved insufficient:
//   1. BREAKPOINT — a >600px unit may only appear from `md` (768px) up.
//   2. MAX-WIDTH  — every banner and every wrapper is capped at its container,
//      so a narrow COLUMN at a wide VIEWPORT cannot overflow either.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const AD_COMPONENTS = ["src/components/EbayAd.tsx", "src/components/TcgplayerAd.tsx"];

// Tailwind's breakpoints, and the container padding the layout applies.
const SM = 640;
const MD = 768;
const CONTAINER_PADDING = 32; // px-4 either side at the narrowest

test("no banner wider than the sm breakpoint is allowed to render at sm", () => {
  for (const path of AD_COMPONENTS) {
    const src = read(path);
    // Every declared creative size, parsed from the component's own DIMS/ADS map.
    const dims = [...src.matchAll(/(\w+):\s*\{[^}]*?w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({
      name: m[1],
      w: Number(m[2]),
      h: Number(m[3]),
    }));
    assert.ok(dims.length >= 4, `${path}: expected to parse the creative sizes, found ${dims.length}`);

    const wide = dims.filter((d) => d.w > SM - CONTAINER_PADDING);
    assert.ok(wide.length > 0, `${path}: expected at least one creative too wide for sm`);

    // The component must gate the wide creatives behind md, never sm.
    assert.match(src, /const wide = size !== "rect";/, `${path}: must classify wide sizes`);
    assert.match(
      src,
      /deskShow = wide \? "hidden max-w-full md:inline-block" : "hidden max-w-full sm:inline-block"/,
      `${path}: a wide creative must be gated at md, a narrow one may use sm`,
    );
    assert.match(src, /mobShow = wide \? "max-w-full md:hidden" : "max-w-full sm:hidden"/, `${path}: the mobile unit must cover the gap`);

    // …and the billboard's step-down must also be md, not sm.
    assert.ok(
      !/sm:inline-block lg:hidden/.test(src),
      `${path}: the billboard steps down to a 728px unit — that cannot appear at sm`,
    );
    assert.match(src, /md:inline-block lg:hidden/, `${path}: the billboard must step down at md`);
  }
});

test("every creative that renders from md actually fits at md", () => {
  for (const path of AD_COMPONENTS) {
    const src = read(path);
    const dims = [...src.matchAll(/(\w+):\s*\{[^}]*?w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({
      name: m[1],
      w: Number(m[2]),
    }));
    // The billboard is lg-only; everything else must fit inside md.
    for (const d of dims.filter((x) => x.name !== "billboard")) {
      assert.ok(
        d.w <= MD - CONTAINER_PADDING,
        `${path}: "${d.name}" is ${d.w}px, wider than the ${MD - CONTAINER_PADDING}px available at md`,
      );
    }
  }
});

test("the mobile creatives fit the narrowest audited viewport", () => {
  // 375px is scripts/mobile-check.ts's viewport and the iPhone SE width.
  for (const path of AD_COMPONENTS) {
    const src = read(path);
    const dims = [...src.matchAll(/(\w+):\s*\{[^}]*?w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({
      name: m[1],
      w: Number(m[2]),
    }));
    for (const d of dims.filter((x) => x.name.startsWith("mobile"))) {
      assert.ok(d.w <= 375 - CONTAINER_PADDING, `${path}: "${d.name}" is ${d.w}px, too wide for a 375px phone`);
    }
  }
});

test("banners and their wrappers are capped at their container", () => {
  // The breakpoint rule alone is not enough: at 1024px the card page's content
  // column is ~700px, so a legitimately-shown 728px leaderboard still overflowed.
  // The cap has to be on the banner AND on the inline-block wrappers, because a
  // wrapper with no cap grows to its content and "100%" then resolves against
  // the already-grown parent — which is precisely how the first fix missed.
  for (const path of AD_COMPONENTS) {
    const src = read(path);
    assert.match(src, /maxWidth: "100%"/, `${path}: the banner itself must be capped`);
    assert.match(src, /flex max-w-full flex-col items-center/, `${path}: the container must be capped`);
    const wrappers = [...src.matchAll(/<span className=(?:"([^"]*(?:inline-block|:hidden)[^"]*)"|\{(\w+)\})/g)];
    assert.ok(wrappers.length >= 2, `${path}: expected banner wrapper spans`);
    for (const m of wrappers) {
      if (!m[1]) continue; // computed class — asserted by name above
      assert.ok(
        m[1].includes("max-w-full"),
        `${path}: wrapper "${m[1]}" must carry max-w-full or it grows past its column`,
      );
    }
  }
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
