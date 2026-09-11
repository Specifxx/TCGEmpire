// The desktop navigation rail's two modes and how a page picks one. Shared by
// the root layout (which inlines SIDENAV_BOOT_SCRIPT so the first paint is
// already right), SideNav.tsx (which toggles and persists the choice) and
// tests/sidenav.test.ts. No React, no DOM at module level — importable anywhere.
//
// ── Why two modes ────────────────────────────────────────────────────────────
// The rail exists so a first-time visitor SEES the site's breadth (Deal
// Finder, Best Basket, Riftle…) instead of having to open ⌘K to discover it.
// But it was all-or-nothing: 17rem on every page from 1280px up, nothing at
// all below. On /browse that stacked a third column beside the filter panel
// and cost a whole card column; on a game page it was dead weight beside the
// playfield; and a 1100px laptop got no rail whatsoever.
//
// So: `expanded` is the full list (17rem); `collapsed` is an icon rail (4rem,
// one icon per group, links in a flyout). From 1024px to 1279px the rail is
// ALWAYS the icon rail — there isn't room for 17rem. From 1280px up it is
// expanded unless collapsed, and "collapsed" comes from, in order:
//   1. the visitor's own choice (the `sidenav` cookie, set by the toggle), else
//   2. the route's default — icon mode on pages that carry their own left
//      column or a playfield, full rail on the homepage and hubs.
//
// ── Why a cookie + inline script, not server rendering ───────────────────────
// The root layout must never read cookies()/headers() (see its own comment:
// one dynamic-API read there opts every route out of static caching). So the
// server cannot know the visitor's choice or even the pathname. Instead a
// tiny inline script in <head> — generated HERE from the same prefix list, so
// the two can never drift — stamps `data-sidenav` on <html> before first
// paint, and the CSS custom property `--sidenav-w` (globals.css) does the rest.

export type SidenavMode = "expanded" | "collapsed";

export const SIDENAV_COOKIE = "sidenav";
export const SIDENAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Routes where the rail defaults to icon mode. Matched as `path === prefix`
// or `path.startsWith(prefix + "/")`, so "/card" does NOT swallow "/cards"
// (listed separately on purpose). Keep this to pages that either have their
// own left-hand column (browse, sealed, singles, decks, portfolio, trade,
// bulk pricer) or a playfield (games, riftle, gallery, a card's own page).
export const SIDENAV_COLLAPSED_PREFIXES: readonly string[] = [
  "/browse",
  "/card",
  "/cards",
  "/sealed",
  "/singles",
  "/deck",
  "/decks",
  "/games",
  "/riftle",
  "/gallery",
  "/portfolio",
  "/trade",
  "/bulk-pricer",
];

export function isSidenavMode(v: unknown): v is SidenavMode {
  return v === "expanded" || v === "collapsed";
}

export function sidenavDefaultFor(pathname: string): SidenavMode {
  for (const prefix of SIDENAV_COLLAPSED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return "collapsed";
  }
  return "expanded";
}

// The visitor's saved choice wins everywhere; otherwise the route decides.
export function resolveSidenavMode(saved: string | null | undefined, pathname: string): SidenavMode {
  return isSidenavMode(saved) ? saved : sidenavDefaultFor(pathname);
}

// Parse the `sidenav` cookie out of a document.cookie / Cookie-header string.
export function readSidenavCookie(cookieString: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${SIDENAV_COOKIE}=(expanded|collapsed)(?:;|$)`).exec(cookieString);
  return m ? m[1] : null;
}

// Inlined in <head> by the root layout. Plain ES5, wrapped in try/catch, and
// generated from SIDENAV_COLLAPSED_PREFIXES so the script and the TypeScript
// resolver above are one source of truth (tests/sidenav.test.ts runs this
// string in a sandbox and checks it agrees with resolveSidenavMode).
export const SIDENAV_BOOT_SCRIPT: string = [
  "(function(){try{",
  "var p=location.pathname;",
  `var m=/(?:^|;\\s*)${SIDENAV_COOKIE}=(expanded|collapsed)(?:;|$)/.exec(document.cookie);`,
  "var v=m?m[1]:null;",
  "if(!v){",
  `var d=${JSON.stringify(SIDENAV_COLLAPSED_PREFIXES)};`,
  'v="expanded";',
  'for(var i=0;i<d.length;i++){if(p===d[i]||p.indexOf(d[i]+"/")===0){v="collapsed";break}}',
  "}",
  'document.documentElement.setAttribute("data-sidenav",v)',
  "}catch(e){}})();",
].join("");
