import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIMARY_NAV } from "../src/components/primary-nav";
import { NAV_GROUPS } from "../src/components/nav-groups";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// THE FULL-HEIGHT RAIL (2026-09-21). Asked for directly, with a reference:
// "make the sidebar for riftcompare like how piltover archive does it", then
// "get rid of some of the header like explore, sealed, deck builder, auctions
// and the search bar if it's already on the left".
//
// The rail went from "a column of ten group icons starting below the header"
// to the whole left edge of the page: brand, search, one primary action, a
// short flat list of destinations, the full grouped index, and a pinned
// account block. The header lost everything the rail now carries.
//
// What follows pins the parts that are easy to undo by accident, and the two
// that are load-bearing rather than cosmetic: nothing may become unreachable,
// and the mode must stay a CSS decision rather than a React one.
// ─────────────────────────────────────────────────────────────────────────────

test("the rail spans the full page height and outranks the header it now sits beside", () => {
  const code = codeOnly(read("src/components/SideNav.tsx"));
  assert.match(code, /fixed left-0 top-0 z-rail[^"]*h-screen/, "full height, pinned to the top-left corner");
  const header = codeOnly(read("src/components/NavbarShell.tsx"));
  assert.match(header, /pl-\[var\(--sidenav-w\)\]/, "the header's content must start where the rail ends");
  assert.match(header, /z-header/, "the header keeps its own token");
  // The rail has to paint ABOVE the header, because the header's background
  // still spans the corner the rail's brand block occupies.
  const { Z } = require("../src/lib/motion-tokens") as { Z: Record<string, number> };
  assert.ok(Z.rail > Z.header, `rail (${Z.rail}) must outrank header (${Z.header})`);
  assert.ok(Z.rail < Z.dropdown, "…but never outrank a menu or an overlay");
});

test("every primary destination is a real route with an icon, and is duplicated in the grouped index", () => {
  // The flat list is a SHORTCUT, never the only way to something: each entry
  // must also exist in NAV_GROUPS, which is what the footer site-map, the ⌘K
  // launcher and /llms.txt all render.
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.links).map((l) => l.href));
  for (const item of PRIMARY_NAV) {
    assert.match(item.href, /^\//, `${item.label} must be an internal route`);
    assert.ok(item.icon, `${item.label} needs an icon — collapsed, it is the whole signal`);
    if (item.href === "/") continue; // the home link has no group entry by design
    assert.ok(grouped.has(item.href), `${item.href} must also be reachable from NAV_GROUPS`);
  }
});

test("only Home matches exactly — no other primary item may swallow every route via a '/' prefix", () => {
  const exact = PRIMARY_NAV.filter((i) => i.exact);
  assert.deepEqual(exact.map((i) => i.href), ["/"]);
});

test("which mode the rail is in stays a CSS decision, not a React one", () => {
  // The chrome rows carry .sidenav-row / .sidenav-expanded and let globals.css
  // decide. A `railCollapsed ? … : …` in the CLASSNAMES would mean the server
  // renders one layout and the client's first paint can render the other — a
  // visible flash for anyone whose cookie says "expanded".
  const code = codeOnly(read("src/components/SideNav.tsx"));
  const rows = code.match(/className=\{?["`][^"`]*sidenav-row/g) ?? [];
  assert.ok(rows.length >= 5, `expected the chrome rows to use .sidenav-row, found ${rows.length}`);
  assert.doesNotMatch(
    code,
    /className=\{`[^`]*\$\{\s*railCollapsed/,
    "railCollapsed must not decide a className — that is what .sidenav-row exists for",
  );
  const css = read("src/app/globals.css");
  for (const rule of [".sidenav-row", ".sidenav-expanded", ".sidenav-collapsed", ".sidenav-boxed"]) {
    assert.ok(css.includes(rule), `${rule} must be defined in globals.css`);
  }
  // The boxed search field is themeable like everything else, not hardcoded hex.
  const boxed = css.slice(css.indexOf(".sidenav-boxed"));
  assert.doesNotMatch(boxed.slice(0, 400), /#[0-9a-f]{6}/i, "use the --c-* tokens so the light palette follows");
});

test("the collapsed rail scrolls, and its flyouts escape the scroller", () => {
  // Adding the primary destinations took the collapsed list from 10 icons to
  // 18 (~790px), which no longer fits a laptop viewport beside the brand,
  // search, action and account blocks. It scrolls now — so the flyout had to
  // stop being an `absolute` child of a scrolling ancestor, which clips.
  const code = codeOnly(read("src/components/SideNav.tsx"));
  assert.match(code, /sidenav-collapsed[^"]*overflow-y-auto/, "the collapsed list must scroll");
  assert.match(code, /className=\{`fixed z-flyout/, "the flyout must be viewport-fixed, not absolutely positioned");
  assert.match(code, /getBoundingClientRect\(\)/, "…placed from the trigger's own rect");
  assert.doesNotMatch(code, /absolute left-full/, "the old clipping position must not come back");
});

test("the header gave up exactly what the rail took, and kept what it did not", () => {
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  // Gone from the header entirely — all of these are in the rail from lg up,
  // and none of them rendered below lg in the first place.
  assert.doesNotMatch(nav, /<HeaderSearchSlot>/, "the inline desktop search box");
  assert.doesNotMatch(nav, /<CommandLauncherButton \/>/, "the ⌘K button");
  for (const href of ["/sealed", "/deck", "/blog", "/auctions"]) {
    assert.doesNotMatch(nav, new RegExp(`<Link href="${href}"`), `the desktop ${href} link`);
  }
  // Still here, because the rail does NOT carry them: the phone search row,
  // the phone menu button, the country picker, the theme toggle, the session.
  assert.match(nav, /<HeaderSearchSlot mobile>/, "the phone search row is the only search below lg");
  assert.match(nav, /<HeaderMenuButton className="lg:hidden" \/>/);
  assert.match(nav, /<ThemeToggle/);
  assert.match(nav, /<NavUser/);
});

test("the rail carries the account block the header no longer shows on desktop", () => {
  const code = codeOnly(read("src/components/SideNav.tsx"));
  assert.match(code, /href="\/premium"/, "Premium");
  assert.match(code, /href=\{user \? "\/profile" : "\/login"\}/, "the session row, both states");
  // A placeholder until /api/me resolves, so a signed-in visitor never sees
  // "Sign in" flash first — the same contract NavUser follows in the header.
  assert.match(code, /!meLoaded \? \(/, "must not render either state before the session resolves");
});

test("the rail is in RiftCompare's colours: green acts, gold stays Premium-only", () => {
  // Asked for explicitly — "obviously it should be in riftcompare colours and
  // not piltover archive colours". The layout is borrowed; the palette is not.
  // Gold is this site's PREMIUM identity colour (Navbar's phone Premium link,
  // PremiumNavLink, the /premium page), so the only gold in the rail may be
  // the Premium call to action. A gold "Browse cards" button — which is what
  // the reference design's equivalent looks like — would read as a paid
  // feature.
  const code = codeOnly(read("src/components/SideNav.tsx"));

  // Through the closing ">" of the opening tag — anchoring on the label text
  // would stop at aria-label="Browse cards", before the className.
  const cta = /href="\/browse"[\s\S]{0,400}?\/>/.exec(code)?.[0] ?? "";
  assert.ok(cta, "expected the primary action");
  assert.match(cta, /bg-brand-500/, "the primary action is brand green, same fill as .btn-primary");
  assert.doesNotMatch(cta, /gold/, "…and must never be gold");

  const premium = /href="\/premium"[\s\S]{0,500}?Go Premium<\/span>/.exec(code)?.[0] ?? "";
  assert.ok(premium, "expected the Premium call to action");
  assert.match(premium, /gold/, "Premium keeps the gold it owns sitewide");

  // Nothing else in the rail may reach for gold.
  const golds = code.match(/gold/g) ?? [];
  assert.equal(golds.length, (premium.match(/gold/g) ?? []).length, "gold appears only in the Premium row");
});
