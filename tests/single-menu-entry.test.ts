import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// ONE MENU ENTRY POINT BELOW lg — the invariant survives; its address changed.
//
// Originally reported as: "we have the menu, but we also have the menu on the
// top right… we only need one of them." Two controls — the header's own
// hamburger (MobileNav.tsx) and BottomTabBar's "Menu" tab — both called the same
// useMegaMenu().setOpen(true). MobileNav was deleted and the bottom-bar tab won,
// because a thumb reaches the bottom of a phone more easily than the top.
//
// THEN THE BOTTOM BAR ITSELF WAS DELETED (2026-09-18). It could not be kept
// pinned to the bottom of a phone screen across three attempts — a dvh/lvh calc
// in `bottom:`, the same value as a compositor-only transform, and finally a
// measured visualViewport version with a pinch-zoom gate, a geometry-change
// reset and a 25% clamp. Reported as "the bottom part keeps rising up on the
// phone I've given up fixing it. Let's get rid of it and add the menu bar back
// to the top." So the surviving control moved back into the header as
// HeaderMenuButton.
//
// THE RULE IS UNCHANGED AND IS WHAT THIS FILE PINS: at any given width there is
// exactly ONE control that opens CinematicNavMenu. What follows checks there is
// one, not zero (the failure this change could most easily have caused — the
// overlay reachable from nowhere on a phone) and not two.
// ─────────────────────────────────────────────────────────────────────────────

test("MobileNav (the original duplicate hamburger) is still gone", () => {
  assert.ok(
    !existsSync(join(ROOT, "src/components/MobileNav.tsx")),
    "the old duplicate must stay deleted — HeaderMenuButton is not a reinstatement of it",
  );
});

test("the bottom bar is gone, so it cannot be a second entry point", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/BottomTabBar.tsx")));
  assert.doesNotMatch(readCode("src/app/layout.tsx"), /BottomTabBar/);
});

test("HeaderMenuButton is the one surviving entry point to the overlay", () => {
  const code = readCode("src/components/HeaderMenuButton.tsx");
  assert.match(code, /useMegaMenu\(\)/, "reads the same context the deleted tab used");
  assert.match(code, /onClick=\{\(\) => setOpen\(true\)\}/, "and opens it the same way");
});

test("exactly one component in the tree opens the mega menu", () => {
  // The real invariant, checked against the source rather than against a list of
  // names — a third opener added anywhere would fail here.
  const files = [
    "src/components/HeaderMenuButton.tsx",
    "src/components/Navbar.tsx",
    "src/components/NavbarShell.tsx",
    "src/components/SideNav.tsx",
    "src/components/CommandLauncher.tsx",
    "src/app/layout.tsx",
  ].filter((f) => existsSync(join(ROOT, f)));
  const openers = files.filter((f) => /setOpen\(true\)/.test(readCode(f)));
  assert.deepEqual(openers, ["src/components/HeaderMenuButton.tsx"], "exactly one opener, and it is the header button");
});

test("the header renders it below lg only, so desktop keeps ONE full-nav surface", () => {
  const nav = readCode("src/components/Navbar.tsx");
  assert.match(nav, /<HeaderMenuButton className="lg:hidden" \/>/);
  // From lg that surface is the RAIL, not the header's ⌘K button — which was
  // removed on 2026-09-21 precisely because the rail carries its own Search
  // row opening the same launcher, plus every NAV_GROUPS link inline. A menu
  // button, a launcher button AND a rail would have been three doors into one
  // index, which is the duplication this file exists to prevent.
  assert.doesNotMatch(nav, /<CommandLauncherButton \/>/, "the desktop launcher button belongs to the rail now");
  // From lg that surface is the RAIL, which renders the whole NAV_GROUPS
  // index inline — no button to press, nothing to open. The ⌘K launcher still
  // exists and still has its global shortcut; it simply has no desktop BUTTON
  // any more, and (since 2026-09-21) no longer sits behind the rail's search
  // field either, which is real card search now.
  const rail = readCode("src/components/SideNav.tsx");
  assert.match(rail, /NAV_GROUPS\.map/, "the rail renders the full index inline");
  assert.match(rail, /<SearchBar variant="rail" \/>/, "…and its search field searches cards, not navigation");
});
