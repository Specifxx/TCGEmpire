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

test("--sidenav-w: 0 below lg, the 4rem icon rail from 1024px, the 17rem list from 1280px ONLY once explicitly expanded", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /--sidenav-w:\s*0px;/, "must default to 0 so every consumer no-ops below lg");
  assert.match(
    css,
    /@media \(min-width:\s*1024px\)\s*\{\s*:root\s*\{\s*--sidenav-w:\s*4rem;/,
    "1024–1279px is always the icon rail"
  );
  // The full list is gated on a POSITIVE match for the SAME attribute the
  // boot script stamps and SideNav toggles — never a bare :root, and never a
  // :not([...="collapsed"]) either, since that would make the icon rail's
  // absence (script blocked, CSP) silently fall back to the OLD
  // expanded-by-default rather than the current collapsed-by-default.
  assert.match(
    css,
    /@media \(min-width:\s*1280px\)\s*\{\s*:root\[data-sidenav="expanded"\]\s*\{\s*--sidenav-w:\s*17rem;/,
    "1280px+ only expands when data-sidenav=expanded — collapsed is the fallback, not the exception"
  );
  assert.doesNotMatch(css, /:not\(\[data-sidenav="collapsed"\]\)/, "must not revert to the negative-match form");
  // …and the two content blocks switch on exactly that attribute + breakpoint.
  assert.match(css, /\.sidenav-expanded\s*\{\s*display:\s*none;/);
  assert.match(css, /:root\[data-sidenav="expanded"\] \.sidenav-expanded\s*\{\s*display:\s*block;/);
  assert.match(css, /:root\[data-sidenav="expanded"\] \.sidenav-collapsed\s*\{\s*display:\s*none;/);
});

test("SideNav renders the same NAV_GROUPS index the ⌘K launcher searches, hidden below lg", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /"use client"/);
  assert.match(src, /import \{ NAV_GROUPS \} from "\.\/nav-groups"/);
  assert.match(src, /NAV_GROUPS\.map/);
  // Tailwind's lg breakpoint (1024px) — the width at which --sidenav-w first
  // becomes non-zero in globals.css. The two must agree, or the panel either
  // overlaps un-padded content or leaves a gap.
  assert.match(src, /aria-label="Site navigation"\s*\n\s*className="fixed left-0 [^"]*hidden [^"]*lg:flex/);
  // Both modes are always rendered; CSS picks one (see the globals.css test).
  assert.match(src, /className="sidenav-expanded /);
  assert.match(src, /className="sidenav-collapsed /);
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

// ── One mode default: the resolver, the boot script, and the layout wiring ──
// 2026-09-11: the per-route default (icon rail on pages with their own column
// or a playfield, full rail on hubs) was replaced by a single site-wide
// default — the icon rail everywhere, expanding only once the visitor asks.
import vm from "node:vm";
import { SIDENAV_BOOT_SCRIPT, readSidenavCookie, resolveSidenavMode } from "../src/lib/sidenav-shared";
import { NAV_GROUPS } from "../src/components/nav-groups";

test("the rail defaults to collapsed everywhere; the visitor's saved choice always wins; garbage falls through to collapsed", () => {
  assert.equal(resolveSidenavMode(undefined), "collapsed", "no cookie at all — the true default");
  assert.equal(resolveSidenavMode(null), "collapsed");
  assert.equal(resolveSidenavMode("expanded"), "expanded", "an explicit choice to expand must stick");
  assert.equal(resolveSidenavMode("collapsed"), "collapsed");
  assert.equal(resolveSidenavMode("sideways"), "collapsed", "an unrecognised value must not accidentally expand the rail");
  assert.equal(readSidenavCookie("country=US; sidenav=collapsed; x=1"), "collapsed");
  assert.equal(readSidenavCookie("sidenav=expanded"), "expanded");
  assert.equal(readSidenavCookie("notsidenav=collapsed"), null);
});

test("the inline boot script agrees with the TypeScript resolver for every cookie, and defaults to collapsed with no cookie at all", () => {
  // Run the exact string the layout inlines, in a sandbox with a fake DOM.
  const run = (cookie: string) => {
    let stamped: string | null = null;
    const ctx = vm.createContext({
      document: { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } },
    });
    vm.runInContext(SIDENAV_BOOT_SCRIPT, ctx);
    return stamped;
  };
  const cookies = ["", "sidenav=collapsed", "sidenav=expanded", "a=1; sidenav=expanded; b=2", "sidenav=bogus"];
  for (const c of cookies) {
    assert.equal(run(c), resolveSidenavMode(readSidenavCookie(c)), `cookie "${c}"`);
  }
  assert.equal(run(""), "collapsed", "the boot script's own fallback, with nothing to read, must be collapsed");
  // It must survive a hostile environment rather than throw before paint.
  assert.doesNotThrow(() => vm.runInContext(SIDENAV_BOOT_SCRIPT, vm.createContext({})));
  // No per-route logic left to generate the script from — it no longer reads
  // location at all.
  assert.doesNotMatch(SIDENAV_BOOT_SCRIPT, /location/);
});

test("the layout inlines the boot script in <head> and suppresses the resulting <html> hydration warning", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ SIDENAV_BOOT_SCRIPT \} from "@\/lib\/sidenav-shared"/);
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  assert.match(head, /<script dangerouslySetInnerHTML=\{\{ __html: SIDENAV_BOOT_SCRIPT \}\} \/>/, "the script must run before <body> paints");
  const html = layout.slice(layout.indexOf("<html"), layout.indexOf(">", layout.indexOf("<html")));
  assert.match(html, /suppressHydrationWarning/);
  // The caching rule still holds: nothing here reads cookies()/headers().
  assert.doesNotMatch(layout, /from "next\/headers"/);
});

test("every NAV_GROUPS entry has an icon — the collapsed rail shows nothing else for it", () => {
  for (const g of NAV_GROUPS) assert.ok(g.icon && g.icon.length > 0, `${g.title} needs an icon`);
  assert.equal(new Set(NAV_GROUPS.map((g) => g.icon)).size, NAV_GROUPS.length, "icons must be distinct — they are the only signal at 4rem");
});

test("SideNav toggles + persists the choice and re-syncs on navigation", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /setAttribute\("data-sidenav", mode\)/);
  assert.match(src, /document\.cookie = `\$\{SIDENAV_COOKIE\}=\$\{next\}; path=\/; max-age=\$\{SIDENAV_COOKIE_MAX_AGE\}; SameSite=Lax`/);
  assert.match(src, /resolveSidenavMode\(readSidenavCookie\(document\.cookie\)\)/);
  // The keyboard shortcut must never fire while the visitor is typing.
  assert.match(src, /isTypingTarget\(e\.target\)/);
  // Flyouts are keyboard-reachable: focus opens, Escape closes, state exposed.
  assert.match(src, /onFocus=\{\(\) => setOpenGroup\(group\.title\)\}/);
  assert.match(src, /aria-expanded=\{isOpen\}/);
});
