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
// The hero rails: a third affiliate creative with hardcoded pixel geometry.
// ─────────────────────────────────────────────────────────────────────────────
// HeroAdRail is not an EbayAd/TcgplayerAd variant — it is a first-party portrait
// creative in a fixed 240px absolutely-positioned slot — so none of the rules
// above reach it. It shipped with `zIndex: 5`, inherited from the decorative
// chase-card showcase it replaced, which put it UNDERNEATH the hero's own
// `container-app relative z-10` text column. That column is `max-w-[1400px]`,
// centred, has no background and spans the shell's full height, and a
// transparent HTML element still hit-tests across its whole border box — so it
// swallowed every click on both rails from 1400px (100% covered) up to ~1944px.
// The banners rendered perfectly and earned exactly nothing: no navigation, no
// buy_click, no EPN click. Nothing else in this repo can see that — not tsc,
// not eslint, not the guard, not the audit.
const HERO_RAIL = "src/components/home/HeroAdRail.tsx";
const HERO = "src/components/home/CinematicHero.tsx";

test("the hero rails paint above the hero text column, or they are unclickable", () => {
  const rail = read(HERO_RAIL);
  const hero = read(HERO);

  const railZ = rail.match(/zIndex:\s*(\d+)/);
  assert.ok(railZ, `${HERO_RAIL}: expected an explicit numeric zIndex on the rail wrapper`);

  // The stacking rival, read from the hero itself rather than hardcoded, so this
  // keeps holding if the column's z-index is ever changed.
  const colZ = hero.match(/container-app[^"]*?\bz-(\d+)\b/);
  assert.ok(colZ, `${HERO}: expected the foreground container-app column to carry a z-index`);

  assert.ok(
    Number(railZ[1]) > Number(colZ[1]),
    `${HERO_RAIL}: rail z-index ${railZ[1]} is not above the hero column's z-${colZ[1]} — ` +
      `the transparent column covers the rails' whole box at every width they render at ` +
      `(1400px–1944px) and hit-testing returns the column, so every click is swallowed`,
  );

  // The other half of the same invariant: the wrapper opts out of hit testing,
  // so the inner box has to opt back in.
  assert.match(
    rail,
    /pointer-events-none absolute/,
    `${HERO_RAIL}: the positioning wrapper must stay pointer-events-none`,
  );
  assert.match(
    rail,
    /pointer-events-auto w-\[240px\]/,
    `${HERO_RAIL}: the panel box must re-enable pointer events, or the rails are unclickable`,
  );
});

test("the hero rails never render on a phone or tablet", () => {
  const rail = read(HERO_RAIL);
  // Written as a literal on purpose — Tailwind's JIT only emits classes it can
  // see, so an interpolated breakpoint would never be generated and the rails
  // would render at EVERY width, phones included.
  assert.match(
    rail,
    /"pointer-events-none absolute bottom-6 hidden min-\[1400px\]:block"/,
    `${HERO_RAIL}: the rails must be hidden by default and shown only from a literal min-[1400px]`,
  );
  // BOTTOM-anchored, not centred, and that is a measured requirement rather
  // than a layout preference. The hero shell is 595px tall and the H1's FIRST
  // (longer) line ends 82px down, so a rail centred on the shell cannot exceed
  // ~363px before its vertical band overlaps that line — at 1400px a 360px rail
  // clears by 145px and a 400px one by 10px. The image-led panel is 446px tall.
  // Hanging it from the floor puts the band in the 489px below the headline,
  // where every neighbour is max-w-2xl rather than the H1's 874px. Re-centring
  // it would silently reintroduce the collision at every width under ~1500px.
  assert.ok(
    !/top-1\/2[^"]*min-\[1400px\]/.test(rail),
    `${HERO_RAIL}: the rail must not be re-centred — at 446px tall a centred band overlaps the H1's first line below ~1500px`,
  );
  // 240px wide at a 32px inset is the measured geometry the 1400px clearance
  // table depends on; change either and the table stops describing the page.
  assert.match(rail, /w-\[240px\]/, `${HERO_RAIL}: the rail must stay 240px wide`);
  assert.match(rail, /isLeft \? "left-8" : "right-8"/, `${HERO_RAIL}: the rail must stay 32px in from each edge`);
});

test("the hero rails carry their own affiliate disclosure", () => {
  const rail = read(HERO_RAIL);
  // EPN Participation Requirements I.G — an affiliate banner must never render
  // without a visible disclosure. The two rails are ~1100px apart, so one shared
  // line cannot sit "clear and prominent" next to both; each carries its own.
  // The rail renders a REAL listing when one exists and falls back to the
  // text-only house creative when it does not, so the disclosure has to follow
  // whichever of the two actually rendered — naming eBay beside a TCGplayer
  // link (or the reverse) is a disclosure that discloses the wrong merchant.
  assert.match(
    rail,
    /<AffiliateDisclosure partner=\{listing \? listing\.partner : unit\.partner\}/,
    `${HERO_RAIL}: each rail must render a disclosure for the partner it actually links to`,
  );
  // And it must not be gated behind a hover/expand interaction.
  assert.ok(
    !/hidden[^"]*group-hover:block[^"]*"\s*>\s*<AffiliateDisclosure/.test(rail),
    `${HERO_RAIL}: the disclosure must render on first paint, never hover-gated`,
  );
});
