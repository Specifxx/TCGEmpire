import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// SideNav — the persistent desktop rail (≥1280px, Tailwind's `xl`), always
// visible from first paint on every page, homepage included. Reported
// directly: the header's own nav is scroll-gated/translucent at the top of
// the page, and the site's actual breadth of features (Deal Finder, Best
// Basket, Riftle, etc.) was hidden a click away behind ⌘K/the hamburger —
// nothing signaled "this site has a lot to offer" on first landing.
//
// `position: fixed`, not a flex/grid participant — verified visually (see the
// screenshots taken during implementation) at 1440px, exactly at 1280px,
// exactly below it at 1279px, and on mobile: the breakpoint is exact and the
// hero's full-bleed background/foreground stay correctly centered in the
// space to the right of the panel with no gap or overflow, because
// CinematicHero's breakout math was updated to compensate for the same
// --sidenav-w custom property SideNav reserves space with everywhere else.
// ─────────────────────────────────────────────────────────────────────────────

test("--sidenav-w is 0 by default and only switches on at Tailwind's xl breakpoint (1280px)", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /--sidenav-w:\s*0px;/, "must default to 0 so every consumer no-ops below xl");
  const media = /@media \(min-width:\s*1280px\)\s*\{\s*:root\s*\{\s*--sidenav-w:\s*([^;]+);/.exec(css);
  assert.ok(media, "expected an @media (min-width: 1280px) override for --sidenav-w");
});

test("SideNav renders the same NAV_GROUPS index the ⌘K launcher searches, hidden below xl", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /"use client"/);
  assert.match(src, /import \{ NAV_GROUPS \} from "\.\/nav-groups"/);
  assert.match(src, /NAV_GROUPS\.map/);
  // Tailwind's xl breakpoint (1280px) — must match globals.css's media query
  // exactly, or the panel either overlaps un-padded content or leaves a gap.
  assert.match(src, /hidden .*xl:flex/);
  // Fixed, not a layout participant — see the file's own doc comment for why
  // (CinematicHero's full-bleed breakout depends on <main> staying centred on
  // the true viewport; a flex/grid sidebar would break that).
  assert.match(src, /fixed left-0/);
  assert.match(src, /w-\[var\(--sidenav-w\)\]/);
});

test("SideNav branches on external links, same contract every other NAV_GROUPS renderer follows", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /link\.external \?/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
});

test("SideNav highlights the active route without matching every page via a bare '/' prefix", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /link\.href !== "\/"/, "must special-case the homepage href — startsWith(\"/\") would match everything");
});

test("nav-groups.ts lists SideNav as a required branch-on-external renderer", () => {
  const src = read("src/components/nav-groups.ts");
  assert.match(src, /FooterNav, *\n?\s*\* CinematicNavMenu, CommandLauncher, SideNav\)/s);
});

test("layout.tsx mounts SideNav and reserves its width for main, the footer ad zone, and the footer", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ SideNav \} from "@\/components\/SideNav"/);
  assert.match(layout, /<Navbar \/>\s*\n\s*<SideNav \/>/, "SideNav must mount right after Navbar");

  // Every pl-[var(--sidenav-w)] must live on its OWN element, never combined
  // with a px-* utility on the same tag — Tailwind resolves two padding-left
  // declarations of equal specificity by GENERATED CSS order, not by
  // className string order, so combining them is order-dependent and fragile.
  const plMatches = [...layout.matchAll(/^.*pl-\[var\(--sidenav-w\)\].*$/gm)];
  assert.ok(plMatches.length >= 3, "expected at least 3 reservations (main wrapper, ad zone, footer)");
  for (const [line] of plMatches) {
    assert.doesNotMatch(line, /\bpx-/, `pl-[var(--sidenav-w)] must not share a line/element with a px-* utility: ${line}`);
  }
});

test("FooterAds reserves the same width — SideNav is fixed and spans the full page height", () => {
  const layout = read("src/app/layout.tsx");
  const idx = layout.indexOf("<FooterAds");
  const before = layout.slice(Math.max(0, idx - 200), idx);
  assert.match(before, /pl-\[var\(--sidenav-w\)\]/, "the wrapper immediately around <FooterAds /> must reserve SideNav's width");
});

test("CinematicHero's full-bleed breakout compensates for --sidenav-w, not a bare -translate-x-1/2", () => {
  const src = read("src/components/home/CinematicHero.tsx");
  const classLine = /<ParallaxRoot id="rc-hero" className="([^"]*)"/.exec(src)?.[1] ?? "";
  assert.ok(classLine, "expected to find ParallaxRoot's className");
  // Scoped to the actual className (not the whole file — the doc comment right
  // above it explains the fix by NAMING the old, now-removed pattern, which
  // would otherwise make this assertion fail against its own documentation).
  assert.doesNotMatch(classLine, /-translate-x-1\/2/, "the old, sidebar-unaware breakout must be gone");
  assert.match(classLine, /translate-x-\[calc\(-50%-var\(--sidenav-w\)\/2\)\]/);
  // The foreground content column (H1/search/trending chips) needs its OWN
  // reservation — it re-centres on the full viewport via container-app's
  // mx-auto same as the breakout background, so without this it would render
  // partly behind the fixed panel, not just visually below it.
  const foregroundIdx = src.indexOf("Foreground content");
  const nearby = src.slice(foregroundIdx, foregroundIdx + 400);
  assert.match(nearby, /pl-\[var\(--sidenav-w\)\]/);
});
