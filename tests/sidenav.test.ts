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
  const nearby = src.slice(foregroundIdx, foregroundIdx + 2000);
  assert.match(nearby, /pl-\[var\(--sidenav-w\)\]/);
  // REGRESSION PIN: shipped once WITHOUT `w-full` on this exact wrapper and
  // the hero rendered visibly off-center on any screen wide enough for
  // container-app to hit its own 1400px cap (confirmed with pixel
  // measurements: search box centered ~300px left of the correct
  // S/2 + viewportWidth/2). ROOT CAUSE: ParallaxRoot (this wrapper's parent)
  // is `flex items-center`, and the decorative background layer is
  // `position: absolute` (out of flow) — so this wrapper is the row's ONLY
  // normal-flow flex item. A flex item with no explicit width sizes to its
  // OWN CONTENT (shrink-to-fit) and sits at the row's flex-start, not the
  // full row width `container-app`'s own `mx-auto` needs to center within.
  assert.match(nearby, /className="w-full pl-\[var\(--sidenav-w\)\]"/);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-ONLY + COLLAPSIBLE (2026-09-10) — reported directly: the per-link
// emoji made the one nav surface that's on screen permanently read as
// AI-generated decoration, and rendering all ~9 groups flat and always-open
// meant scrolling past Games and Guides to reach Your Collection on every
// page. This is the one NAV_GROUPS renderer that drops the emoji (the
// dropdown/footer/launcher renderers are untouched — a link.emoji shown for a
// moment reads differently than one sitting on screen at all times) and the
// one that lets a visitor collapse a group and has it stay collapsed.
// ─────────────────────────────────────────────────────────────────────────────

test("SideNav renders no per-link emoji, unlike the launcher/mobile-nav renderers", () => {
  const src = read("src/components/SideNav.tsx");
  assert.doesNotMatch(src, /link\.emoji/, "SideNav must not read link.emoji — text only, by design");
  // Untouched by this change, so still emoji: the ⌘K launcher and the phone
  // Explore overlay, both surfaces that are open for a moment rather than
  // sitting on screen permanently. (FooterNav was already text-only before
  // this change — it never rendered link.emoji at all — so it isn't a
  // counter-example either way and isn't asserted on here.)
  for (const renderer of ["CommandLauncher.tsx", "CinematicNavMenu.tsx"]) {
    assert.match(read(`src/components/${renderer}`), /link\.emoji|l\.emoji/, `${renderer} should still render emoji — only SideNav drops them`);
  }
});

test("SideNav's groups are collapsible and remember a visitor's choice", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /"use client"/);
  // A real disclosure control per group, not a static heading.
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /onClick=\{\(\) => toggleGroup\(group\.title\)\}/);
  // Persisted, so a collapsed group stays collapsed across a reload — and
  // ONLY deviations are stored, so a group added to NAV_GROUPS tomorrow
  // starts open for every existing visitor rather than defaulting to
  // whatever an empty/missing key would imply.
  assert.match(src, /localStorage\.(get|set)Item\(STORAGE_KEY/);
  assert.match(src, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\[\.\.\.next\]\)\)/);
});

test("SideNav forces the active page's group open even if it was previously collapsed", () => {
  const src = read("src/components/SideNav.tsx");
  // Computed from the SAME isActiveLink check used to highlight the link, so
  // the two can't drift (one flagging a page active while the other leaves
  // its group collapsed would hide the very page a visitor is on).
  assert.match(src, /activeGroupTitle/);
  assert.match(src, /g\.links\.some\(\(l\) => isActiveLink\(pathname, l\)\)/);
  assert.match(src, /if \(!hydrated \|\| !activeGroupTitle \|\| !collapsed\.has\(activeGroupTitle\)\) return;/);
});

test("SideNav's collapse state starts empty (every group open) so SSR and first client paint agree", () => {
  // localStorage isn't available during SSR. Seeding `collapsed` from it
  // synchronously would make the server's render and the client's first
  // render disagree — a hydration mismatch. Real state loads in an effect,
  // strictly after mount, same shape as TradeCalculator's own localStorage
  // restore.
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  const effectsAfter = src.slice(src.indexOf("useState<Set<string>>"));
  assert.match(effectsAfter, /useEffect\(\(\) => \{[\s\S]*?localStorage\.getItem\(STORAGE_KEY\)/);
});
