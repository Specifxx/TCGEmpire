import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: "we have the menu, but we also have the menu on the top
// right. So I'm thinking we only need one of them... get rid of the
// duplicates." Below the `lg` breakpoint, the header rendered its own
// hamburger (MobileNav.tsx) AND BottomTabBar rendered a "Menu" tab — both
// called the exact same `useMegaMenu().setOpen(true)`, opening the identical
// CinematicNavMenu overlay. The header's copy is gone; the thumb-reachable
// bottom-bar tab (already the pattern Watch/Binder/Search use) is the one
// entry point that survives.
//
// A second, related complaint in the same message — "get rid of any duplicate
// information... we don't even need the see all features anymore... they can
// just scroll down and look at all the features" — is pinned in
// nav-menu-full-grid.test.ts: the overlay's curated "Popular" subset (a
// filter() over the same NAV_GROUPS links shown again below it) and its
// "Show all features" gate are both gone too.
// ─────────────────────────────────────────────────────────────────────────────

test("MobileNav (the header's own hamburger) no longer exists", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/MobileNav.tsx")), "the duplicate header trigger must be deleted, not just unused");
});

test("Navbar.tsx renders no menu-opening control of its own below lg", () => {
  const code = readCode("src/components/Navbar.tsx");
  assert.doesNotMatch(code, /MobileNav/, "no import or render of the removed hamburger");
  assert.doesNotMatch(code, /setOpen\(true\)/, "the header must not open the mega menu itself any more");
});

test("BottomTabBar's Menu tab is the one surviving entry point to the overlay", () => {
  const code = readCode("src/components/BottomTabBar.tsx");
  assert.match(code, /setOpen: setMenuOpen/, "still reads from the same useMegaMenu() context");
  assert.match(code, /onClick=\{\(\) => setMenuOpen\(true\)\}/, "the Menu tab still opens it");
});
