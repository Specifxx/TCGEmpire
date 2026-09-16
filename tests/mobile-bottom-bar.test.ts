import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEARCH_FOCUS_EVENT } from "../src/lib/search-focus";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// Two phone complaints, reported together:
//
//   1. "the search bar at the bottom on a mobile app, it should be searching
//      through the card pages, not the features … cards and like sealed
//      products". The Search tab opened the ⌘K command launcher, which searches
//      NAV_GROUPS. Its own empty state admitted the mismatch: "This searches
//      pages and tools — to look up a card, use the search box in the header."
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

test("the phone's Search tab reaches the CARD search, not the feature launcher", () => {
  const code = readCode(BAR);
  assert.match(code, /focusCardSearch\(\)/, "Search must focus the card box");
  assert.doesNotMatch(code, /useCommandLauncher/, "the ⌘K feature launcher is the wrong tool behind this button");
  assert.doesNotMatch(code, /openLauncher/);
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

test("sender and receiver agree on one event name, defined in one place", () => {
  assert.equal(SEARCH_FOCUS_EVENT, "rc:focus-search");
  // Neither side may hard-code the string: a typo would silently do nothing,
  // which is the worst possible failure for a button.
  for (const f of [BAR, "src/components/SearchBar.tsx"]) {
    assert.match(read(f), /from "@\/lib\/search-focus"/, `${f} must import the shared module`);
    assert.doesNotMatch(readCode(f), /"rc:focus-search"/, `${f} must not re-type the event name`);
  }
  // The always-mounted tab bar must not drag the 900-line SearchBar into its
  // dependency graph just to get a constant.
  assert.doesNotMatch(readCode(BAR), /from "\.\/SearchBar"/);
});

test("the receiver only answers if it is the instance actually on screen", () => {
  // 2-3 SearchBars are mounted at once (nav desktop, nav mobile, hero). Focusing
  // an off-screen one would open the keyboard and scroll nowhere useful.
  const code = readCode("src/components/SearchBar.tsx");
  const handler = code.slice(code.indexOf("function onFocusSearch"));
  assert.match(handler, /isVisible\(el\)/, "must reuse the same visibility rule the / shortcut uses");
  assert.match(handler, /el\.focus\(\)/);
  assert.match(code, /addEventListener\(SEARCH_FOCUS_EVENT/);
  assert.match(code, /removeEventListener\(SEARCH_FOCUS_EVENT/, "listener must be cleaned up");
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

test("the bottom bar clears the phone browser's own chrome at every scroll position", () => {
  const css = read(CSS);
  assert.match(css, /--chrome-lift:\s*0px;/, "must default to 0 where it doesn't apply");
  assert.match(
    css,
    /@supports \(height: 100dvh\) and \(height: 100lvh\)[\s\S]*?--chrome-lift:\s*clamp\(0px, calc\(100lvh - 100dvh\), 200px\);/,
    "the real value belongs behind @supports, and clamped — see the Z Fold 7 test below for why"
  );
  // An unsupported function inside calc() invalidates the whole declaration —
  // a bar with no `bottom` would be worse than the bug being fixed, so the
  // 0px default must sit OUTSIDE the @supports block, not inside it.
  const guardAt = css.indexOf("@supports (height: 100dvh)");
  assert.ok(css.indexOf("--chrome-lift: 0px;") < guardAt, "the fallback must be declared before the guarded override");
});

test("the chrome-lift is clamped against a bad viewport reading, not trusted raw", () => {
  // Foldables are exactly the device class most likely to report a garbage
  // dvh/lvh value mid fold-state-change — a negative reading would push the
  // bar UP off-screen (translateY negative-of-negative), and an oversized one
  // would fling it far past any real browser chrome height.
  const css = read(CSS);
  assert.match(css, /clamp\(0px, calc\(100lvh - 100dvh\), 200px\)/);
});

test("the lift is applied via transform, never via `bottom` — that split IS the Z Fold 7 fix", () => {
  // Reported on a Z Fold 7 (cover screen): "the bottom is glitched … should not
  // be able to move or lag when I scroll down." The original version put
  // --chrome-lift straight into `bottom`, a LAYOUT property, and dvh/lvh are
  // deliberately DYNAMIC — the browser recomputes them continuously while its
  // own chrome animates. That forced a full reflow of the bar PLUS a
  // backdrop-blur repaint at its new position on every frame: layout thrash
  // plus a backdrop-filter repaint every frame is a textbook jank source.
  const code = readCode(BAR);
  assert.match(code, /bottom-\[var\(--native-banner-h\)\]/, "`bottom` must be static — no chrome-lift in it");
  assert.doesNotMatch(code, /bottom-\[calc\(var\(--native-banner-h\)\+var\(--chrome-lift\)\)\]/, "the old layout-thrashing form must be gone");
  assert.match(code, /translate-y-\[calc\(var\(--chrome-lift\)\*-1\)\]/, "the SAME value, carried by a compositor-only property instead");
  assert.match(code, /will-change-transform/, "promote to its own layer up front, not discover the need mid-animation");
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
