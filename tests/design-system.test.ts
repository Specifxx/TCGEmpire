import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DURATION, EASING, Z } from "../src/lib/motion-tokens";
import tailwindConfig from "../tailwind.config";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// P0 — motion tokens, ui/ primitives, dead-code removal. Grows through every
// later phase of the UI polish pass rather than spawning a new file per phase,
// so "does the design system still hold together" stays answerable in one run.
// ─────────────────────────────────────────────────────────────────────────────

test("tailwind's motion/z-index tokens equal src/lib/motion-tokens.ts", () => {
  const extend = tailwindConfig.theme?.extend as Record<string, unknown>;
  const duration = extend.transitionDuration as Record<string, string>;
  assert.equal(duration.fast, `${DURATION.fast}ms`);
  assert.equal(duration.base, `${DURATION.base}ms`);
  assert.equal(duration.slow, `${DURATION.slow}ms`);
  assert.equal(duration.page, `${DURATION.page}ms`);

  const timing = extend.transitionTimingFunction as Record<string, string>;
  assert.equal(timing.out, EASING.out);
  assert.equal(timing["in-out"], EASING.inOut);
  assert.equal(timing.DEFAULT, EASING.out, "overriding the DEFAULT curve is safe only because it was the whole point — see tailwind.config.ts's comment");

  const zIndex = extend.zIndex as Record<string, string>;
  for (const [name, value] of Object.entries(Z)) {
    assert.equal(zIndex[name], String(value), `zIndex.${name} must match Z.${name}`);
  }
});

test("src/lib/motion.ts exports the shared presence/reduced-motion primitives", () => {
  const code = readCode("src/lib/motion.ts");
  assert.match(code, /export function usePresence/);
  assert.match(code, /export function useReducedMotion/);
  assert.match(code, /export function prefersReducedMotion/);
});

test("the reduced-motion @media block is the LAST rule in globals.css", () => {
  const css = read("src/app/globals.css");
  const lastReducedMotion = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(lastReducedMotion > -1, "expected the reduced-motion block to exist");
  // Nothing meaningful (a new ruleset) may follow it — only whitespace/comments
  // are tolerated after its closing brace.
  const closeBrace = css.indexOf("\n}", lastReducedMotion);
  const tail = css.slice(closeBrace + 2).replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.equal(tail, "", "the reduced-motion block must stay the LAST rule in globals.css — anything animated must be declared before it");
});

test("ui/Dialog.tsx hidden states use motion-safe:, never a bare opacity-0", () => {
  const code = readCode("src/components/ui/Dialog.tsx");
  assert.doesNotMatch(code, /(?<!motion-safe:)(?<!sm:motion-safe:)\bopacity-0\b/, "every hidden-state opacity-0 must be motion-safe: (or a responsive motion-safe: variant)");
  assert.match(code, /motion-safe:opacity-0/);
});

test("dead CSS classes removed in the P0 pass are gone from globals.css", () => {
  const css = read("src/app/globals.css");
  for (const cls of [".hero-dots", ".brand-shimmer", ".cta-shine", ".parallax-art", ".parallax-aurora", ".hero-vignette", ".proxy-grid", ".proxy-card"]) {
    assert.ok(!css.includes(`${cls} {`) && !css.includes(`${cls} `.trimEnd() + "\n"), `${cls} should have been deleted, not just orphaned`);
  }
  // .lift the CLASS (not the English word, which still appears in prose).
  assert.doesNotMatch(css, /^\s*\.lift\s*\{/m);
});

test("the dead blob/glow-pulse keyframes and animations left tailwind.config.ts", () => {
  const src = readCode("tailwind.config.ts");
  assert.doesNotMatch(src, /\bblob:\s*\{/);
  assert.doesNotMatch(src, /"glow-pulse":\s*\{/);
});

test("useParallax.ts is gone; ParallaxRoot is a plain (non-client) wrapper that still carries id/className", () => {
  assert.throws(() => read("src/components/home/useParallax.ts"), "useParallax.ts should have been deleted — its only CSS consumers (.parallax-art/.parallax-aurora) are dead");
  const code = readCode("src/components/home/ParallaxRoot.tsx");
  assert.doesNotMatch(code, /"use client"/, "ParallaxRoot has no hooks left and doesn't need a client boundary");
  assert.match(code, /id\?:\s*string/);
  assert.match(code, /className\?:\s*string/);
});

test("Reveal.tsx's reduced-motion check stays a SYNCHRONOUS pre-paint read, not the useReducedMotion hook", () => {
  const code = readCode("src/components/Reveal.tsx");
  assert.match(code, /prefersReducedMotion\(\)/, "must use the synchronous function");
  assert.doesNotMatch(code, /useReducedMotion\(\)/, "the hook would hydrate false then flip a frame later — exactly the flash this component exists to avoid");
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — icons everywhere. nav-groups.ts's 57 `emoji:` fields (one per
// NavGroupLink) are gone; the collapsed rail's drawn-icon language now covers
// every group-level heading across SideNav, CinematicNavMenu and
// CommandLauncher. tests/sidenav.test.ts and tests/nav-icon.test.ts own the
// renderer-level assertions; this file owns the cross-cutting ones.
// ─────────────────────────────────────────────────────────────────────────────

test("NavGroupLink carries no emoji field — nav-groups.ts is icon-key-only data", () => {
  const src = readCode("src/components/nav-groups.ts");
  assert.doesNotMatch(src, /emoji/, "the emoji field left both the interface and every entry");
});

test("every NavIconName union member is actually drawn", () => {
  const src = read("src/components/NavIcon.tsx");
  const names = [...src.matchAll(/^\s+\| "(\w+)"/gm)].map((m) => m[1]);
  assert.ok(names.length > 0, "expected to find NavIconName union members");
  const drawn = new Set([...src.matchAll(/^  (\w+): \(/gm)].map((m) => m[1]));
  for (const name of names) {
    assert.ok(drawn.has(name), `NavIconName "${name}" has no drawing in the ICONS record`);
  }
});

test("the dead NavMenu.tsx renderer is gone", () => {
  assert.throws(() => read("src/components/NavMenu.tsx"), "NavMenu.tsx had zero importers and read the now-deleted l.emoji field");
});

test("no component hand-rolls the double-rAF entrance any more — usePresence() covers all of them now", () => {
  // 2026-09-16: the three corner nudges (SignupPromoPopup, PremiumSlideIn,
  // AnnualSwitchNudge) were the last holdouts, each with its own copy of the
  // double-rAF entrance + a bare setTimeout exit. All three now share
  // usePresence(shown, 250) from @/lib/motion, so this check no longer needs
  // an exclusion list — the pattern should not exist anywhere in src/.
  const dir = join(process.cwd(), "src/components");
  const offenders: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".tsx")) continue;
    const code = readCode(join("src/components", entry));
    if (/requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(code)) offenders.push(entry);
  }
  assert.deepEqual(offenders, [], "new overlay/animation code should use usePresence() from @/lib/motion instead of hand-rolling the double-rAF trick");
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 route feedback — owner decision: "progress bar + 150ms fade".
// ─────────────────────────────────────────────────────────────────────────────

test("layout.tsx mounts NextTopLoader, not between Navbar and SideNav", () => {
  const src = readCode("src/app/layout.tsx");
  assert.match(src, /import NextTopLoader from "nextjs-toploader"/);
  assert.match(src, /<NextTopLoader\b/);
  // tests/sidenav.test.ts pins <Navbar /> immediately followed by <SideNav />
  // — the loader must sit outside that pair, not between them.
  assert.doesNotMatch(src, /<Navbar \/>\s*<NextTopLoader/);
});

// ─────────────────────────────────────────────────────────────────────────────
// P3 — perceived performance: skeletons + an optimistic watchlist.
// ─────────────────────────────────────────────────────────────────────────────

test("use-watchlist.ts is optimistic: publish() before the fetch, with a rollback on failure", () => {
  const src = readCode("src/lib/use-watchlist.ts");
  const watchFn = /async watch\(cardId, market\) \{[\s\S]*?\n\s*\},/.exec(src)?.[0] ?? "";
  const unwatchFn = /async unwatch\(cardId\) \{[\s\S]*?\n\s*\},/.exec(src)?.[0] ?? "";
  for (const [name, fn] of [["watch", watchFn], ["unwatch", unwatchFn]] as const) {
    assert.ok(fn, `expected to find ${name}()`);
    const publishAt = fn.indexOf("publish();");
    const fetchAt = fn.indexOf("await fetch(");
    assert.ok(publishAt >= 0 && fetchAt >= 0 && publishAt < fetchAt, `${name}() must publish() the optimistic state before awaiting the fetch`);
    assert.match(fn, /watched = prev/, `${name}() must roll back to the pre-click snapshot on failure`);
  }
});

test("template.tsx's server render never contains a hidden opacity class", () => {
  const src = read("src/app/template.tsx");
  assert.match(src, /let navigatedBefore = false/, "the first-load flag must be module-level, not component state");
  // The hidden-state string must only ever be reached through the `firstLoad`
  // ternary's false branch — never emitted unconditionally.
  assert.doesNotMatch(src, /className="[^"]*opacity-0/, "a bare unconditional opacity-0 className would render in server HTML on first load");
  assert.match(src, /firstLoad\s*\?\s*undefined/, "first load must render with no className at all");
});

// ─────────────────────────────────────────────────────────────────────────────
// P4 — micro-interactions and systemic focus.
// ─────────────────────────────────────────────────────────────────────────────

test("SegmentedTabs implements the real ARIA tabs pattern and EbayTabs re-exports EbayTab", () => {
  const src = read("src/components/ui/SegmentedTabs.tsx");
  assert.match(src, /role="tablist"/);
  assert.match(src, /aria-selected=\{isActive\}/);
  const wrapper = read("src/components/EbayTabs.tsx");
  assert.match(wrapper, /export type EbayTab/, "existing `import { EbayTab }` call sites must keep compiling");
});

test("SegmentedTabs' sliding pill is sized to the ACTIVE TAB, never to the whole tablist", () => {
  // A real phone bug, reported live with a screenshot (2026-09-16). The tablist
  // is `flex-wrap`, and at 393px the homepage's three tabs wrap to two rows
  // ("All-time" + "Biggest movers", then "Recently updated"). The indicator was
  // `inset-y-0` with an x-only translate, so it stretched to the full height of
  // a two-row tablist: measured 93x96 instead of 93x44, and `rounded-full` on
  // that box rendered a giant green blob over the first pill that bled into the
  // second row. A tab on row two also had no y offset to slide to, so the pill
  // would have marked the wrong tab outright.
  //
  // Both halves are pinned because either alone leaves the bug: an explicit
  // measured height (not inset-y-0) AND a two-axis translate.
  const src = readCode("src/components/ui/SegmentedTabs.tsx");
  const indicator = src.slice(src.indexOf("{indicator && ("), src.indexOf("/>", src.indexOf("{indicator && (")));
  assert.ok(indicator, "expected the sliding indicator span");
  assert.doesNotMatch(
    indicator,
    /inset-y-0/,
    "inset-y-0 makes the pill as tall as the whole tablist, which is two rows deep once the tabs wrap",
  );
  assert.match(indicator, /height: indicator\.h/, "the pill must take the active tab's own height");
  assert.match(
    indicator,
    /translate\(\$\{indicator\.x\}px, \$\{indicator\.y\}px\)/,
    "a tab on the second row needs a y offset, not just an x one",
  );
  // And the measurement itself must record all four numbers.
  assert.match(src, /y: elRect\.top - listRect\.top/);
  assert.match(src, /h: elRect\.height/);
  // One measure() shared by the layout effect and the ResizeObserver: these were
  // two copies of the same arithmetic, so a fix to one silently missed the other.
  assert.equal(
    (src.match(/elRect\.left - listRect\.left/g) ?? []).length,
    1,
    "the measuring arithmetic must exist exactly once",
  );
});

test("PopularCardsCarousel no longer hand-rolls aria-pressed tabs", () => {
  const src = readCode("src/components/home/PopularCardsCarousel.tsx");
  assert.doesNotMatch(src, /aria-pressed/, "must use SegmentedTabs, not a toggle-button row");
  assert.match(src, /<SegmentedTabs/);
  assert.match(src, /renderAllPanels/, "every tab's cards must stay in the DOM for the page's ItemList JSON-LD");
});

test("every outline-none in src/**/*.tsx carries a focus-visible: ring in the same className", () => {
  // A bare `outline-none` with no replacement leaves keyboard/AT users with
  // NO focus indicator at all — worse than doing nothing, since it actively
  // removes the browser default. `focus:` (not `focus-visible:`) is also
  // wrong here: it shows the ring on a mouse click too, which :focus-visible
  // exists specifically to avoid (globals.css's own top-level rule).
  const offenders: { file: string; line: number }[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (entry.name === "ui") continue; // ui/ primitives own their own focus handling
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".tsx")) {
        const code = readCode(rel);
        code.split("\n").forEach((line, i) => {
          if (/\boutline-none\b/.test(line) && !/focus-visible:/.test(line)) {
            offenders.push({ file: rel, line: i + 1 });
          }
        });
      }
    }
  }
  walk("src/components");
  walk("src/app");
  assert.deepEqual(offenders, [], "every outline-none needs a focus-visible: ring in the same className string");
});

// ─────────────────────────────────────────────────────────────────────────────
// P5 — the product remembers you.
// ─────────────────────────────────────────────────────────────────────────────

test("recently-viewed entries store an already-resolved image, never a raw imageUrl/imageThumbUrl column", () => {
  const src = readCode("src/lib/recently-viewed.ts");
  assert.match(src, /imageSrc:\s*string \| null/, "RecentCardEntry must carry a resolved src, not raw DB columns");
  assert.doesNotMatch(src, /\bimageUrl\b|\bimageThumbUrl\b/, "the light cache must never carry the raw column names");
  // CardViewBeacon itself just carries the prop through — its CALLER (the
  // card page) is what must resolve it; QuickView resolves it itself since
  // it already holds the full CardTileData.
  for (const rel of ["src/app/card/[id]/page.tsx", "src/components/QuickView.tsx"]) {
    const writer = readCode(rel);
    assert.match(writer, /cardImageSrc\(/, `${rel} must resolve the image through cardImageSrc() before caching it`);
  }
});

test("notify() has real callers across price drops, premium lifecycle and release day", () => {
  for (const rel of ["src/lib/price-alerts.ts", "src/lib/premium.ts", "src/lib/release-day.ts"]) {
    const src = readCode(rel);
    assert.match(src, /import \{ notify \} from "\.\/notifications"/, `${rel} must import notify()`);
    assert.match(src, /void notify\(/, `${rel} must actually call notify()`);
    assert.match(src, /\.catch\(\(\) => \{\}\)/, `${rel}'s notify() call must be fire-and-forget`);
  }
});

test("GA4_ONLY_EVENTS carries the P5 retention events and use-watchlist.ts fires watch_add/watch_remove optimistically", () => {
  const analytics = read("src/lib/analytics.ts");
  for (const name of ["scroll_depth", "watch_add", "watch_remove", "collection_add", "recent_viewed_click", "notification_open", "riftle_start"]) {
    assert.match(analytics, new RegExp(`"${name}"`), `GA4_ONLY_EVENTS must list ${name}`);
  }
  const watchlist = read("src/lib/use-watchlist.ts");
  assert.match(watchlist, /publish\(\);\s*\n\s*trackEvent\("watch_add"/, "watch_add must fire right after the optimistic publish()");
  assert.match(watchlist, /publish\(\);\s*\n\s*trackEvent\("watch_remove"/, "watch_remove must fire right after the optimistic publish()");
});

test("use-unread.ts is a single shared poller, and NotificationBell reads it instead of polling itself", () => {
  const shared = read("src/lib/use-unread.ts");
  assert.match(shared, /setInterval\(refresh, 60_000\)/);
  const bell = readCode("src/components/NotificationBell.tsx");
  assert.doesNotMatch(bell, /setInterval/, "the bell must not run its own poll any more — see use-unread.ts");
  assert.match(bell, /useUnreadCount\(\)/, "the bell must read the shared store");
});

// ─────────────────────────────────────────────────────────────────────────────
// P6 — onboarding, empty states, honesty, the free-tier dashboard.
// ─────────────────────────────────────────────────────────────────────────────

test("/dashboard no longer bounces a free signed-in user to /premium", () => {
  const src = readCode("src/app/dashboard/page.tsx");
  assert.doesNotMatch(src, /if \(!isPremium\(user\)\) redirect\("\/premium"\)/, "free tier must be able to open the dashboard");
  assert.match(src, /const tierName = tier \? TIER_NAMES\[tier\] : "Free"/, "a free account must read as Free, never a blank/undefined tier");
  assert.match(src, /const isFree = tier == null/);
});

test("Watchlist, MyCollection and NotificationBell render their empty/error states through ui/EmptyState", () => {
  for (const rel of ["src/components/Watchlist.tsx", "src/components/MyCollection.tsx", "src/components/NotificationBell.tsx"]) {
    const src = readCode(rel);
    assert.match(src, /import \{ EmptyState \} from "\.\/ui\/EmptyState"/, `${rel} must import the shared EmptyState`);
    assert.match(src, /<EmptyState\b/, `${rel} must actually render it`);
  }
});

test("no price-alert surface still promises a target price shouldEmailDrop doesn't implement", () => {
  const priceAlerts = read("src/lib/price-alerts.ts");
  assert.doesNotMatch(priceAlerts, /targetCents/, "no target-price column exists yet — see DECISIONS.md backlog");
  for (const rel of ["src/app/alerts/page.tsx", "src/components/AdSlot.tsx"]) {
    const src = readCode(rel);
    assert.doesNotMatch(src, /target price|hits your (target|price)|reaches your price|set your price/i, `${rel} must not describe a mechanism the code doesn't run`);
  }
});

test("WelcomeChecklist is never a modal and keys eligibility off the rc_welcome_at stamp, not a live ?welcome param", () => {
  const src = readCode("src/components/WelcomeChecklist.tsx");
  assert.doesNotMatch(src, /from "\.\/ui\/Dialog"/, "onboarding must be inline, never an overlay");
  assert.match(src, /rc_welcome_at/, "must read the stamp SignupWelcome.tsx writes");
  assert.doesNotMatch(src, /useSearchParams/, "must not race SignupWelcome's own ?welcome param strip");
  assert.match(src, /id="welcome"/, "the /profile anchor target must exist");
});

// ─────────────────────────────────────────────────────────────────────────────
// P7's mobile bottom tab bar — REMOVED, 2026-09-18, and these pin the removal.
//
// It shipped three attempts at staying pinned to the bottom of a phone screen
// (a dvh/lvh calc in `bottom:`, the same value as a compositor-only transform,
// then a measured visualViewport version with a pinch-zoom gate and a geometry
// reset) and rode up the screen through all three. Reported as "the bottom part
// keeps rising up on the phone I've given up fixing it. Let's get rid of it and
// add the menu bar back to the top." Navigation moved to HeaderMenuButton, which
// cannot have that class of bug: the TOP edge of the layout viewport does not
// move when a mobile browser's chrome collapses.
// ─────────────────────────────────────────────────────────────────────────────

test("the bottom bar and its viewport arithmetic are deleted, not merely unmounted", () => {
  for (const rel of ["src/components/BottomTabBar.tsx", "src/lib/chrome-lift.ts"]) {
    assert.ok(!existsSync(join(ROOT, rel)), `${rel} must be deleted`);
  }
  const layout = readCode("src/app/layout.tsx");
  assert.doesNotMatch(layout, /BottomTabBar/, "no import and no render may survive");
});

test("the CSS reservations went with it, and .above-bottombar keeps only what still applies", () => {
  const css = read("src/app/globals.css");
  // --bottombar-h reserved space for a bar that no longer exists; --chrome-lift
  // corrected a position that is no longer computed. Both had to go together —
  // leaving either would silently pad every page by 3.5rem or shift the corner
  // nudges by a value nothing writes any more.
  assert.doesNotMatch(css, /--bottombar-h:/, "--bottombar-h must be gone");
  assert.doesNotMatch(css, /--chrome-lift:/, "--chrome-lift must be gone");
  assert.doesNotMatch(css, /var\(--bottombar-h\)/, "nothing may still read --bottombar-h");
  assert.doesNotMatch(css, /var\(--chrome-lift\)/, "nothing may still read --chrome-lift");
  // The native AdMob banner reservation is a separate, still-live concern, and
  // the utility keeps its name because five components anchor off it.
  assert.match(
    css,
    /\.above-bottombar\s*\{[\s\S]{0,200}var\(--native-banner-h\)[\s\S]{0,120}safe-area-inset-bottom/,
    "the utility must still clear the native banner and the safe area"
  );
  assert.match(css, /body\s*\{\s*padding-bottom:\s*calc\(var\(--native-banner-h\)/, "body padding keeps the banner reservation only");
  // --sidenav-w's own 1024px block must survive the edit that removed its
  // former neighbour.
  assert.match(css, /@media \(min-width:\s*1024px\)\s*\{\s*:root\s*\{\s*--sidenav-w:\s*17rem;/);
});

test("HeaderMenuButton is the below-lg nav entry point and opens the same overlay", () => {
  const src = readCode("src/components/HeaderMenuButton.tsx");
  assert.match(src, /useMegaMenu\(\)/, "same context the deleted tab used");
  assert.match(src, /setOpen\(true\)/);
  assert.match(src, /aria-label="Open menu"/);
  assert.match(src, /aria-haspopup="dialog"/);
  // A MENU BUTTON AND NOTHING ELSE. The watch count briefly lived here to keep
  // the deleted bar's signal alive, and that conflated "open the navigation"
  // with "N cards are being tracked" on one target — "the watchlist and the
  // menu should be separate."
  assert.doesNotMatch(src, /useWatchlist/, "the watchlist must not be folded back into the menu button");
  // Below lg only — from lg the command launcher and SideNav already cover it.
  assert.match(readCode("src/components/Navbar.tsx"), /<HeaderMenuButton className="lg:hidden" \/>/);
});

test("the watchlist is its own header control, linking to /watching and carrying the count", () => {
  const src = readCode("src/components/HeaderWatchButton.tsx");
  assert.match(src, /href="\/watching"/, "it must be a LINK to the watchlist, not a menu trigger");
  assert.doesNotMatch(src, /useMegaMenu/, "it must not open the menu");
  // The count is the point: the only ambient signal a price alert fired.
  assert.match(src, /useWatchlist\(\)/);
  assert.match(src, /9\+/, "same 9+ cap the deleted bar's badge used");
  assert.match(src, /aria-current=\{active \? "page" : undefined\}/);
  // A HEART (2026-09-21, owner: "the wishlist icon should be a heart and not a
  // bell"), and the SAME glyph on every surface that stands for the watchlist.
  // That second half is the durable rule, not the particular glyph: this
  // control shipped as a star once, alone, and was reverted with "it should be
  // the same icon as the watch has". So the heart was applied in one pass to
  // this control, PriceWatchButton (the toggle on every card tile and card
  // page), /watching's heading, the card page's "Watch this price" block and
  // the homepage's "Watching a card?" card — and this asserts all of them, so
  // a future change to one of them fails here rather than drifting.
  assert.match(src, /name="heart"/);
  assert.doesNotMatch(src, /name="star"|name="bell"/, "the star and the bell must both be gone, not just unused");
  const watchSurfaces: [string, RegExp][] = [
    ["src/components/PriceWatchButton.tsx", /4\.8 4\.8 0 0 1 6\.8 0/],
    ["src/app/watching/page.tsx", /<NavIcon name="heart"/],
    ["src/components/CardConversionCta.tsx", /<NavIcon name="heart"/],
    ["src/components/home/ReturnVisitCards.tsx", /<NavIcon name="heart"/],
  ];
  for (const [file, pattern] of watchSurfaces) {
    assert.match(readCode(file), pattern, `${file} must draw the same heart`);
  }
  // Filled when there is something in it — PriceWatchButton's own convention,
  // and what separates this from the outline NotificationBell in the sm-to-lg
  // band where a signed-in visitor sees both.
  assert.match(src, /fill=\{count > 0 \? "currentColor" : "none"\}/);
  // sm..lg, not 0..lg, as of 2026-09-19: restoring the Database link (the
  // explicit priority) put seven controls in this row and they measurably
  // overlapped below sm. The watchlist was the cheapest 48px — one tap away in
  // the menu overlay — where Database, Premium, the market switcher, the account
  // control and the menu were each either named a must-have or the only route to
  // something. It is still a SEPARATE control from the menu wherever it appears,
  // which is what "the watchlist and the menu should be separate" asked for.
  assert.match(readCode("src/components/Navbar.tsx"), /<HeaderWatchButton className="hidden sm:inline-flex" \/>/);
});

test("every fixed bottom-corner surface (the three nudges, the feedback FAB, ui/Toast) clears the banner via .above-bottombar", () => {
  for (const rel of [
    "src/components/SignupPromoPopup.tsx",
    "src/components/PremiumSlideIn.tsx",
    "src/components/AnnualSwitchNudge.tsx",
    "src/components/FeedbackWidget.tsx",
    "src/components/ui/Toast.tsx",
  ]) {
    const src = readCode(rel);
    assert.match(src, /above-bottombar/, `${rel} must anchor off the shared utility, not a hard-coded bottom-4/bottom-20`);
    assert.doesNotMatch(src, /\bbottom-(4|20)\b/, `${rel} must not also carry the retired hard-coded inset`);
  }
});
