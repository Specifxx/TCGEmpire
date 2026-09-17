import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nextChromeLift, MAX_LIFT_RATIO, type ChromeLiftState } from "../src/lib/chrome-lift";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// Three phone complaints, reported over time:
//
//   1. "the search bar at the bottom on a mobile app, it should be searching
//      through the card pages, not the features … cards and like sealed
//      products". The Search tab opened the ⌘K command launcher, which searches
//      NAV_GROUPS. Its own empty state admitted the mismatch: "This searches
//      pages and tools — to look up a card, use the search box in the header."
//      Fixed first by focusing the on-screen card SearchBar in place (an
//      SEARCH_FOCUS_EVENT dispatch), then reported again for consistency:
//      "the search bar should open to like a new page… just like when you
//      click on portfolio, it opens to a new page." The tab is now a plain
//      `Link href="/browse"`, same as Watch/Binder, and the old event/focus
//      machinery (search-focus.ts, SearchBar's onFocusSearch) is gone with it.
//
//   2. "you have to scroll down in order for the bottom to show up. The bottom
//      should be up all the time for mobile phone users." Not a hydration
//      delay — the bar is in the server HTML — and not reproducible in headless
//      Chromium, which has no collapsible chrome. A `position: fixed` element
//      anchors to the LAYOUT viewport, which on a real phone is the large
//      viewport; with the URL bar out, the bar sits behind it until a scroll
//      retracts the chrome.
// ─────────────────────────────────────────────────────────────────────────────

const BAR = "src/components/BottomTabBar.tsx";
const CSS = "src/app/globals.css";
const LIFT = "src/lib/chrome-lift.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 3. "We need to fix this glitch with the bottom bar" — a screenshot of a Z Fold
//    7 cover screen (1080x2520) with the bar floating about a third of the way
//    up, page content scrolling in the gap under it, and the fifth tab clipped
//    from "Menu" to "M" off the right edge.
//
//    One cause, PINCH-ZOOM, and only one half of it is ours. A fixed element is
//    sized against the LAYOUT viewport, so under zoom it is drawn wider than the
//    screen and its right end is off it — the browser doing the right thing. The
//    float was ours: the lift subtracted the zoom-shrunken visual viewport from
//    the tallest height ever seen and handed the difference to translateY as
//    though a URL bar had slid out.
//
//    The arithmetic lives in lib/chrome-lift.ts now, so these are real cases
//    with real numbers rather than assertions that certain words appear in a
//    file. That matters here: the words were all present and correct in the
//    version that shipped this bug.
// ─────────────────────────────────────────────────────────────────────────────

// Z Fold 7 cover screen: 1080x2520 physical at DPR 2.625 ≈ 411x960 CSS px.
const FOLD_W = 411;
const FOLD_H = 960;
const CHROME = 112;

const run = (
  start: ChromeLiftState,
  steps: { height: number; scale?: number; layoutWidth?: number }[]
): { state: ChromeLiftState; lifts: number[] } => {
  let state = start;
  const lifts: number[] = [];
  for (const s of steps) {
    const r = nextChromeLift(state, {
      height: s.height,
      scale: s.scale ?? 1,
      layoutWidth: s.layoutWidth ?? FOLD_W,
    });
    state = r.state;
    lifts.push(r.lift);
  }
  return { state, lifts };
};

const fresh = (): ChromeLiftState => ({ maxHeight: FOLD_H - CHROME, layoutWidth: FOLD_W });

test("chrome sliding back out still lifts the bar by exactly what it covers", () => {
  // The behaviour everything else must not break: this is why the lift exists.
  const { lifts } = run(fresh(), [
    { height: FOLD_H - CHROME }, // mount, chrome out — nothing learned yet
    { height: FOLD_H }, // a scroll retracts it: now we know the full height
    { height: FOLD_H - CHROME }, // and it slides back out
  ]);
  assert.deepEqual(lifts, [0, 0, CHROME]);
});

test("PINCH-ZOOM IS NOT CHROME — the bar stays on the bottom edge", () => {
  // THE REPORTED BUG. Zoom to ~1.14 (measured off the screenshot: the fixed bar
  // rendered ~1228 physical px wide on a 1080 px screen). The old arithmetic
  // read the shrunken visual viewport as chrome and lifted the bar ~117 CSS px
  // into the middle of the page.
  const start = run(fresh(), [{ height: FOLD_H }]).state; // full height learned
  const { lifts } = run(start, [
    { height: Math.round(FOLD_H / 1.14), scale: 1.14 },
    { height: 700, scale: 1.14 }, // panned around while still zoomed
    { height: Math.round(FOLD_H / 2), scale: 2 }, // zoomed harder still
  ]);
  assert.deepEqual(lifts, [0, 0, 0], "a zoomed viewport must never lift the bar");
});

test("zooming does not poison the maximum for when they zoom back out", () => {
  const start = run(fresh(), [{ height: FOLD_H }]).state;
  const after = run(start, [{ height: 600, scale: 1.6 }]).state;
  assert.equal(after.maxHeight, FOLD_H, "the zoomed reading must not be learned");
  // And chrome still works immediately afterwards.
  assert.deepEqual(run(after, [{ height: FOLD_H - CHROME }]).lifts, [CHROME]);
});

test("unfolding and folding back does not strand the bar in mid-air", () => {
  // The maximum only ever grows, which is right while the screen stays the same
  // screen. Unfold, and the tallest height ever seen belongs to a viewport that
  // no longer exists — every later reading sits below it, so without the reset
  // the bar lifts by the difference between two DEVICES and never comes down.
  const cover = run(fresh(), [{ height: FOLD_H }]).state;
  const { state, lifts } = run(cover, [
    { height: 1180, layoutWidth: 674 }, // unfolded to the inner display
    { height: FOLD_H, layoutWidth: FOLD_W }, // folded back to the cover screen
  ]);
  assert.deepEqual(lifts, [0, 0], "neither the unfold nor the fold may lift the bar");
  assert.equal(state.maxHeight, FOLD_H, "the maximum belongs to the screen in front of you");
  assert.deepEqual(run(state, [{ height: FOLD_H - CHROME }]).lifts, [CHROME], "chrome still works after");
});

test("no misreading can park the bar more than a quarter of the way up", () => {
  // Belt and braces over the two named fixes. Whatever produces a lift this
  // large it is wrong, and a bar stranded mid-page is far worse than one sitting
  // low under unusually tall chrome.
  const tall = run(fresh(), [{ height: FOLD_H }]).state;
  const { lifts } = run(tall, [{ height: 10 }]);
  assert.equal(lifts[0], Math.round(FOLD_H * MAX_LIFT_RATIO));
  assert.ok(lifts[0] < FOLD_H / 3);
});

test("the lift is never negative and never a fraction of a pixel", () => {
  const { lifts } = run({ maxHeight: 800.4, layoutWidth: FOLD_W }, [{ height: 900.7 }, { height: 855.2 }]);
  for (const l of lifts) {
    assert.ok(Number.isInteger(l), `${l} must be a whole pixel`);
    assert.ok(l >= 0, `${l} must not be negative`);
  }
});

test("the geometry signal ignores chrome, or it would reinstate the original bug", () => {
  // documentElement.clientWidth, not window.innerHeight. innerHeight tracks the
  // chrome on iOS Safari, so using it would reset the maximum on every scroll —
  // the lift would always be 0 and the bar would go back to hiding behind the
  // URL bar until you scrolled, which is the complaint that started all of this.
  const code = readCode("src/lib/chrome-lift.ts") + readCode(BAR);
  assert.match(code, /documentElement\.clientWidth/);
  assert.doesNotMatch(code, /window\.innerHeight/);
});

test("the phone's Search tab is a real page link to the card database, not an in-place focus trick", () => {
  const code = readCode(BAR);
  assert.match(code, /\{ label: "Search", icon: "browse", href: "\/browse" \}/, "Search must be a plain Link tab, matching Watch/Binder");
  assert.doesNotMatch(code, /focusCardSearch/, "the old in-place-focus mechanism must be gone");
  assert.doesNotMatch(code, /useCommandLauncher/, "the ⌘K feature launcher is the wrong tool behind this button");
  assert.doesNotMatch(code, /openLauncher/);
});

test("the old focus-event machinery left no trace once Search became a real link", () => {
  assert.ok(!existsSync(join(ROOT, "src/lib/search-focus.ts")), "search-focus.ts has no remaining consumer");
  const searchBar = readCode("src/components/SearchBar.tsx");
  assert.doesNotMatch(searchBar, /SEARCH_FOCUS_EVENT/, "SearchBar must not still wire up the removed event");
  assert.doesNotMatch(searchBar, /onFocusSearch/);
});

test("…and that search really does cover cards AND sealed products", () => {
  // The box the event focuses is SearchBar, which renders both lists off one
  // /api/search call. If that ever became cards-only the complaint is only half
  // answered, so pin the sealed half too.
  const api = readCode("src/app/api/search/route.ts");
  assert.match(api, /sealed/, "the endpoint must return sealed groups");
  const bar = readCode("src/components/SearchBar.tsx");
  assert.match(bar, /\/api\/search\?q=/, "SearchBar is the consumer");
  assert.match(bar, /\/sealed\?q=/, "…and it links sealed results through to /sealed");
});

test("the feature launcher is still reachable — this moved it, it didn't delete it", () => {
  const launcher = readCode("src/components/CommandLauncher.tsx");
  assert.match(launcher, /export function CommandLauncherButton/, "the header's Explore button must survive");
  const navbar = readCode("src/components/Navbar.tsx");
  assert.match(navbar, /CommandLauncherButton/, "…and still be rendered in the header at phone width");
});

test("the surviving \"/\" shortcut still only focuses the instance actually on screen", () => {
  // 2-3 SearchBars are mounted at once (nav desktop, nav mobile, hero). This
  // visibility rule used to serve two entry points (the "/" key and the phone
  // tab's focus event); it now serves only "/", but must still work correctly.
  const code = readCode("src/components/SearchBar.tsx");
  const handler = code.slice(code.indexOf("function onKeyDown"));
  assert.match(handler, /isVisible\(el\)/, "must check visibility before focusing");
  assert.match(handler, /el\.focus\(\)/);
  assert.match(code, /addEventListener\("keydown", onKeyDown\)/);
  assert.match(code, /removeEventListener\("keydown", onKeyDown\)/, "listener must be cleaned up");
});

test("the search can be closed without a keyboard — there is a real button", () => {
  // "YOU ALSO need to be able to close the search bar on phone." The only exits
  // were Escape (no such key on a phone) and a tap outside the box — and with
  // the suggestions and the on-screen keyboard both up there is often no
  // "outside" left to tap.
  const code = readCode("src/components/SearchBar.tsx");
  assert.match(code, /aria-label="Close search"/, "a labelled control, not just an icon");
  assert.match(code, /type="button"/, "must not submit the form it sits inside");

  const btn = code.slice(code.indexOf('aria-label="Close search"'));
  assert.match(btn, /setOpen\(false\)/, "closes the dropdown");
  assert.match(btn, /setValue\(""\)/, "clears the query");
  assert.match(btn, /inputRef\.current\?\.blur\(\)/, "…and puts the keyboard away — half-closed is not closed");
  assert.match(btn, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/, "blur must not beat the click to it");
});

test("the close button is there the moment the field is focused, not only once results appear", () => {
  // The stuck state this was reported from: tapping Search raises the keyboard,
  // but the dropdown stays shut until it has something to show (no recent
  // searches on a first visit). Gating the button on the dropdown alone would
  // have left exactly that gap unfixed.
  const code = readCode("src/components/SearchBar.tsx");
  assert.match(code, /\{\(focused \|\| showDropdown \|\| value\.length > 0\) && \(/, "focus alone must be enough to show it");
  assert.match(code, /setFocused\(true\)/);
  assert.match(code, /setFocused\(false\)/, "and it must go away again on blur");
});

test("the close button and the \"/\" hint never fight over the same slot", () => {
  const code = readCode("src/components/SearchBar.tsx");
  // Both are absolutely positioned at the right edge of the input.
  assert.match(code, /value\.length === 0 && !showDropdown && !focused/, "the hint yields whenever the button is up");
  // …and the input reserves room for the button at BOTH tap-icon sizes
  // (44px below sm, 36px from sm up — see .tap-icon in globals.css).
  assert.match(code, /input pl-9 pr-12 sm:pr-10/, "nav variant");
  assert.match(code, /pl-11 pr-14 text-base shadow-glow sm:pr-11/, "hero variant");
});

test("--chrome-lift has no CSS source any more — only useChromeLift() may set it", () => {
  // First version: `calc(100lvh - 100dvh)`. That caused a persistent GAP under
  // the bar on a Z Fold 7 (the value read nonzero with no chrome actually
  // covering anything) and a stutter across the WHOLE page during scroll,
  // including the unrelated sticky header — dvh/lvh are recalculated by the
  // browser continuously and uncontrollably while its own chrome animates, and
  // every recalculation invalidates a `:root` custom property globally.
  // Strip comments first — the doc comment on --chrome-lift NAMES the old
  // `100lvh - 100dvh` approach to explain why it was replaced, and a test that
  // failed on its own history lesson would be self-defeating.
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /--chrome-lift:\s*0px;/, "the only value CSS may ever give it — a measured effect supplies the rest");
  assert.doesNotMatch(css, /100lvh|100dvh|100svh/, "no LIVE viewport-unit arithmetic left to reintroduce the same bug");
  assert.doesNotMatch(css, /@supports[\s\S]*--chrome-lift/, "no guarded CSS override either");
});

test("the lift is MEASURED (visualViewport), not inferred from a CSS unit this file cannot verify", () => {
  const code = readCode(BAR);
  assert.match(code, /window\.visualViewport/, "the standards-track API for \"how much of the screen is visible right now\"");
  assert.doesNotMatch(code, /100lvh|100dvh|100svh/, "must not fall back to the CSS-unit approach anywhere in this file");
});

test("the measurement is self-consistent: one API's own numbers, never mixed with a second", () => {
  // window.innerHeight vs visualViewport.height is exactly the kind of
  // cross-API disagreement that made the CSS-unit version unverifiable on a
  // device this codebase has no way to test against. Tracking visualViewport's
  // own running maximum avoids needing a second source at all.
  // The arithmetic moved to lib/chrome-lift.ts so it could be unit-tested with
  // real numbers (see the cases above); the invariant is unchanged, so this
  // follows it there rather than being dropped.
  const code = readCode(BAR) + readCode(LIFT);
  assert.doesNotMatch(code, /window\.innerHeight/, "must not reintroduce a second, differently-behaved height source");
  assert.match(code, /maxHeight/i, "must track the largest visualViewport reading seen, not a fixed baseline");
  assert.match(
    code,
    /next\.maxHeight\s*-\s*reading\.height/,
    "the lift is max minus CURRENT — recomputed, not cached once"
  );
  // And the component must not keep a second, private copy of the same maths.
  assert.doesNotMatch(readCode(BAR), /maxHeight\s*-/, "one derivation, in one place");
});

test("the update rate is under THIS file's control, not the browser engine's", () => {
  const code = readCode(BAR);
  assert.match(code, /requestAnimationFrame/, "rAF-throttled — at most one write per frame, on our terms");
  assert.match(code, /addEventListener\("resize"/);
  assert.match(code, /addEventListener\("scroll"/, "visualViewport fires both — a pinch-zoom pan is a scroll event, not a resize");
  assert.match(code, /removeEventListener/, "cleaned up on unmount");
});

test("no support for visualViewport degrades to NO lift, never to a wrong one", () => {
  const code = readCode(BAR);
  const fn = code.slice(code.indexOf("function useChromeLift"), code.indexOf("function useChromeLift") + 400);
  assert.match(fn, /if \(!vv\) return;/, "must bail out cleanly rather than guess");
});

test("the lift is applied via transform, never via `bottom` — that split IS the Z Fold 7 fix", () => {
  // Reported on a Z Fold 7 (cover screen): "the bottom is glitched … should not
  // be able to move or lag when I scroll down." The original version put
  // --chrome-lift straight into `bottom`, a LAYOUT property. Layout thrash plus
  // a backdrop-filter repaint on every frame is a textbook jank source.
  const code = readCode(BAR);
  assert.match(code, /bottom-\[var\(--native-banner-h\)\]/, "`bottom` must be static — no chrome-lift in it");
  assert.doesNotMatch(code, /bottom-\[calc\(var\(--native-banner-h\)\+var\(--chrome-lift\)\)\]/, "the old layout-thrashing form must be gone");
  assert.match(code, /translate-y-\[calc\(var\(--chrome-lift\)\*-1\)\]/, "the SAME value, carried by a compositor-only property instead");
  assert.match(code, /will-change-transform/, "promote to its own layer up front, not discover the need mid-animation");
});

test("the header stays sticky with no scroll-tied React render to compete for the same frame", () => {
  // "at the very top when you scroll it should be there and not disappear …
  // always sit there so the site is smooth." position:sticky;top:0 shouldn't
  // itself be susceptible to the address-bar phenomenon (the top edge of the
  // viewport doesn't move when chrome collapses — only the bottom edge does),
  // so the prime suspect was contention: a React re-render competing with the
  // browser's own chrome animation on the same frames the (now-fixed) bottom
  // bar was also thrashing layout on. This removes this file's own half of
  // that contention regardless of which theory is right.
  const code = readCode("src/components/NavbarShell.tsx");
  assert.doesNotMatch(code, /useState/, "no React state tied to scroll position any more");
  assert.match(code, /useRef/, "direct DOM manipulation instead");
  assert.match(code, /classList\.(add|remove)/, "a class toggle, not a re-render");
  assert.match(code, /sticky top-0/, "still sticky — this changes HOW it updates, not the positioning strategy");
});

test("everything that floats above the bar rides up with it", () => {
  // .above-bottombar is what the nudges, the feedback FAB and Toast position
  // against — if the bar lifts and they don't, the bar covers them.
  const css = read(CSS);
  // The RULE, not the first mention — the variable's own doc comment names the
  // class too, and slicing from there reads the wrong block entirely.
  const start = css.indexOf(".above-bottombar {");
  assert.ok(start > 0, "expected an .above-bottombar rule");
  const rule = css.slice(start, css.indexOf("}", start));
  assert.match(rule, /var\(--chrome-lift\)/, "these must share the bar's lift");
});

test("the bar is still server-rendered and still swaps with the desktop rail at one breakpoint", () => {
  const code = readCode(BAR);
  assert.match(code, /lg:hidden/, "SideNav takes over at lg — the two must never both show");
  assert.match(code, /fixed inset-x-0/, "still pinned, not sticky");
  // Five targets, and the sliding indicator's 20% maths depends on that count.
  const tabs = [...code.matchAll(/\{ label: "/g)].length;
  assert.equal(tabs, 5, "the indicator translates in 20% steps — five is not decorative");
});
