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

test("the bottom bar clears the phone browser's own chrome at every scroll position", () => {
  const css = read(CSS);
  assert.match(css, /--chrome-lift:\s*0px;/, "must default to 0 where it doesn't apply");
  assert.match(
    css,
    /@supports \(height: 100dvh\) and \(height: 100lvh\)[\s\S]*?--chrome-lift:\s*calc\(100lvh - 100dvh\);/,
    "the real value belongs behind @supports"
  );
  // An unsupported unit inside calc() invalidates the whole declaration — a bar
  // with no `bottom` would be worse than the bug being fixed, so the 0px
  // default must sit OUTSIDE the @supports block, not inside it.
  const guardAt = css.indexOf("@supports (height: 100dvh)");
  assert.ok(css.indexOf("--chrome-lift: 0px;") < guardAt, "the fallback must be declared before the guarded override");
  assert.match(readCode(BAR), /bottom-\[calc\(var\(--native-banner-h\)\+var\(--chrome-lift\)\)\]/);
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
