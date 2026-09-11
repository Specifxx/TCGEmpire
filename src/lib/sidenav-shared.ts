// The desktop navigation rail's two modes and how a visitor's choice is
// remembered. Shared by the root layout (which inlines SIDENAV_BOOT_SCRIPT so
// the first paint is already right), SideNav.tsx (which toggles and persists
// the choice) and tests/sidenav.test.ts. No React, no DOM at module level —
// importable anywhere.
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
// ALWAYS the icon rail — there isn't room for 17rem. From 1280px up, the
// DEFAULT is the icon rail (2026-09-11: expanded-by-default read as intrusive
// on ordinary browsing, not just on the smaller set of pages that carry their
// own left column). It only expands to the full list once the visitor
// explicitly asks — via the toggle, remembered afterwards in the `sidenav`
// cookie. There is no per-route default any more: the earlier design (full
// rail on hub pages, icon rail on pages with their own column or a playfield)
// is gone in favour of one answer for every route.
//
// ── Why a cookie + inline script, not server rendering ───────────────────────
// The root layout must never read cookies()/headers() (see its own comment:
// one dynamic-API read there opts every route out of static caching). So the
// server cannot know the visitor's choice. Instead a tiny inline script in
// <head> — generated HERE, so the two can never drift — stamps `data-sidenav`
// on <html> before first paint, and the CSS custom property `--sidenav-w`
// (globals.css) does the rest. The CSS's OWN default (no attribute at all —
// script blocked, CSP, whatever) is also collapsed, via a positive
// `[data-sidenav="expanded"]` selector rather than a `:not([...="collapsed"])`
// one — so "collapsed" is the true fallback, not just the common case.

export type SidenavMode = "expanded" | "collapsed";

export const SIDENAV_COOKIE = "sidenav";
export const SIDENAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isSidenavMode(v: unknown): v is SidenavMode {
  return v === "expanded" || v === "collapsed";
}

// The visitor's saved choice wins; otherwise the rail defaults to collapsed.
export function resolveSidenavMode(saved: string | null | undefined): SidenavMode {
  return isSidenavMode(saved) ? saved : "collapsed";
}

// Parse the `sidenav` cookie out of a document.cookie / Cookie-header string.
export function readSidenavCookie(cookieString: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${SIDENAV_COOKIE}=(expanded|collapsed)(?:;|$)`).exec(cookieString);
  return m ? m[1] : null;
}

// Inlined in <head> by the root layout. Plain ES5, wrapped in try/catch.
// tests/sidenav.test.ts runs this string in a sandbox and checks it agrees
// with resolveSidenavMode for every cookie value.
export const SIDENAV_BOOT_SCRIPT: string = [
  "(function(){try{",
  `var m=/(?:^|;\\s*)${SIDENAV_COOKIE}=(expanded|collapsed)(?:;|$)/.exec(document.cookie);`,
  'var v=m?m[1]:"collapsed";',
  'document.documentElement.setAttribute("data-sidenav",v)',
  "}catch(e){}})();",
].join("");
