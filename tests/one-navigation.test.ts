import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_GROUPS, HEADER_MENUS, NAV_GROUPS } from "../src/components/nav-groups";

// ONE NAVIGATION (owner, 2026-11-13: "we're making things too complicated, and before it was simplicity that was driving
// it"; DECISIONS.md "Minimal redesign: one navigation, a hero of words and search").
//
// This file replaces tests/sidenav.test.ts, which pinned the 17rem rail that was fixed to the left of every desktop
// page from 2026-09-21 to 2026-11-13: its width variable, the padding every consumer reserved for it, its collapsible
// groups and its "Search features" box. All of that is gone. What is pinned here is the contract that replaced it:
//   • no rail, no reserved width, one centred column;
//   • the header is the navigation, and its menu button (every width) is the one door to the full index;
//   • nothing the rail linked was lost: the same index is in the menu, the ⌘K launcher and the footer's site map.

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the desktop rail is gone: no component, no reserved width, no consumer left padding for it", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/SideNav.tsx")), "SideNav.tsx is deleted, not just unmounted");
  for (const f of [
    "src/app/globals.css",
    "src/app/layout.tsx",
    "src/components/Navbar.tsx",
    "src/components/NavbarShell.tsx",
    "src/components/home/CinematicHero.tsx",
    "src/components/home/RiftEmbers.tsx",
  ]) {
    assert.doesNotMatch(codeOnly(read(f)), /--sidenav-w/, `${f} must not read or set the rail's width`);
  }
  const layout = codeOnly(read("src/app/layout.tsx"));
  assert.doesNotMatch(layout, /<SideNav\b|from "@\/components\/SideNav"/, "layout.tsx must not mount the rail");
  assert.match(layout, /<Navbar \/>/, "the header is still mounted");
  // The ad zone and the footer are plain, full-width blocks again.
  assert.match(layout, /<InlineAdsZone \/>/);
  assert.match(layout, /<footer className="border-t border-ink-800 py-8 text-center text-xs text-slate-500">/);
});

test("the content column is 1200px and centred; the hero breaks out to the window with a plain half-and-half shift", () => {
  const css = codeOnly(read("src/app/globals.css"));
  assert.match(css, /\.container-app \{\s*@apply mx-auto w-full max-w-\[1200px\] px-4 sm:px-6;/);
  const hero = codeOnly(read("src/components/home/CinematicHero.tsx"));
  assert.match(hero, /id="rc-hero" className="relative left-1\/2 z-10 -mt-6 flex min-h-\[30vh\] w-screen -translate-x-1\/2 items-center"/);
  // The corner nudges are a plain left-4 again: nothing pushes them right of a rail.
  assert.doesNotMatch(css, /\.above-bottombar\.left-4 \{\s*left:/);
});

test("the header's menu button is at every width, and it is the only control that opens the full index", () => {
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  assert.match(nav, /<HeaderMenuButton \/>/, "no breakpoint gate: the menu is the index on a desktop too");
  assert.doesNotMatch(nav, /<HeaderMenuButton className=/);
  assert.doesNotMatch(nav, /<CommandLauncherButton \/>/, "no second door beside it (⌘K keeps its shortcut)");
  const button = codeOnly(read("src/components/HeaderMenuButton.tsx"));
  assert.match(button, /useMegaMenu\(\)/);
  assert.match(button, /setOpen\(true\)/);
});

test("the header row is the calm one: brand, Database, the one search, three menus, Pricing, theme, market, account, cart, menu", () => {
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  // The brand is in the header at every width (the rail owned it from lg until 2026-11-13); the word waits for xl.
  assert.match(nav, /className="tap-link min-w-11 shrink-0 gap-2" aria-label="RiftCompare home"/);
  assert.match(nav, /<span className="hidden text-lg font-extrabold tracking-tight text-white xl:block">/);
  assert.match(nav, /href="\/browse"[\s\S]{0,260}?>\s*Database\s*</, "Database stays, at every width (owner, 2026-09-21)");
  // ONE card search: inline from lg, on its own row below it.
  assert.equal((nav.match(/<HeaderSearchSlot\b/g) ?? []).length, 2, "the inline slot and the phone row, never both on screen");
  assert.match(nav, /<div className="hidden min-w-0 flex-1 lg:block lg:w-\[36rem\]">\s*<HeaderSearchSlot>/);
  assert.match(nav, /<div className="flex items-center gap-1 pb-3 lg:hidden">[\s\S]{0,120}?<HeaderSearchSlot mobile>/);
  // The three mega menus from 1440px; the plain Sealed link stands in from lg to 1439px.
  assert.match(nav, /<HeaderMegaMenu menus=\{HEADER_MENUS\} className="hidden min-\[1440px\]:flex" \/>/);
  assert.deepEqual(HEADER_MENUS.map((m) => m.label), ["Singles", "Sealed", "Deals & market"]);
  assert.match(nav, /<Link href="\/sealed" className="hidden [^"]*lg:block[^"]*min-\[1440px\]:hidden/);
  // What left the row on 2026-11-13: Blog, Tools and the Discord icon (the menu and the footer row carry them).
  assert.doesNotMatch(nav, /<Link href="\/blog"|<Link href="\/tools"/, "Blog and Tools are in the menu and the footer, not the row");
  assert.doesNotMatch(nav, /DISCORD_URL|Join our Discord/, "the Discord icon is in the footer row, not the header");
  // Still here: Pricing (twice: the phone slot and the lg row), theme, market, account, cart, the watchlist once used.
  assert.equal((nav.match(/<GetPremiumLink\b/g) ?? []).length, 2);
  assert.match(nav, /<ThemeToggle className="hidden lg:grid" \/>/);
  assert.match(nav, /<CountrySwitcher /);
  assert.match(nav, /<NavUser \/>/);
  assert.equal((nav.match(/<CartHeaderLink\b/g) ?? []).length, 2, "beside the search on a phone, in the row from sm");
  assert.match(nav, /<HeaderWatchButton className="hidden sm:inline-flex" onlyWhenWatching \/>/);
});

test("the watchlist heart is in the header only once a card is watched", () => {
  const src = codeOnly(read("src/components/HeaderWatchButton.tsx"));
  assert.match(src, /onlyWhenWatching = false/);
  assert.match(src, /if \(onlyWhenWatching && count === 0\) return null;/);
  // Until then the menu's own entry reaches it.
  assert.ok(NAV_GROUPS.some((g) => g.links.some((l) => l.href === "/watching")), "My Watchlist is in the menu");
});

test("nothing the rail linked was lost: the menu, the launcher and the footer all render the shared index", () => {
  assert.ok(NAV_GROUPS.length >= 8, `expected the full grouped index, found ${NAV_GROUPS.length} groups`);
  const menu = read("src/components/CinematicNavMenu.tsx");
  assert.match(menu, /NAV_GROUPS\.map/, "the menu renders every group");
  assert.match(read("src/components/CommandLauncher.tsx"), /NAV_GROUPS\.map/, "the ⌘K launcher searches the same index");
  // The footer's site map is the copy that is in every page's server HTML (the menu draws its links on first open).
  assert.match(read("src/components/FooterNav.tsx"), /FOOTER_GROUPS\.map/);
  const inFooter = new Set(FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href)));
  for (const g of NAV_GROUPS) {
    for (const l of g.links) {
      if (l.hideInFooter) continue;
      assert.ok(inFooter.has(l.href), `${l.href} (${g.title}) must be in the footer's site map`);
    }
  }
  // /creators is hideInFooter (the site map's column balance), and the rail and the hero badge were its links in
  // every page's HTML. The footer's always-visible row carries it now.
  assert.match(read("src/app/layout.tsx"), /<Link href="\/creators" className="tap-link text-slate-300 hover:text-brand-400">Creators<\/Link>/);
  // What the 2026-11-13 cull took off the header row and the home page is still one click away.
  const everywhere = new Set(NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href)));
  for (const href of ["/blog", "/tools", "/creators", "/watching", "/riftle", "/games/pack-sim", "/feedback", "/premium", "/legacy-preorders"]) {
    assert.ok(everywhere.has(href), `${href} must stay in the menu`);
  }
});

test("every NAV_GROUPS renderer still branches on external links and reads no per-link emoji", () => {
  for (const renderer of ["CommandLauncher.tsx", "CinematicNavMenu.tsx"]) {
    const src = read(`src/components/${renderer}`);
    assert.doesNotMatch(src, /link\.emoji|l\.emoji/, `${renderer} must not read a per-link emoji`);
  }
  assert.doesNotMatch(read("src/components/nav-groups.ts"), /emoji:\s*string|emoji:\s*"/, "NavGroupLink carries no emoji field");
  assert.match(read("src/components/nav-groups.ts"), /FooterNav,\s*\n?\s*\* CinematicNavMenu, CommandLauncher\)/s, "nav-groups.ts names its renderers");
  assert.match(read("src/components/FooterNav.tsx"), /\.external/, "the footer opens external links in a new tab");
});
