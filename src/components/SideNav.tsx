"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav-groups";
import {
  SIDENAV_COOKIE,
  SIDENAV_COOKIE_MAX_AGE,
  readSidenavCookie,
  resolveSidenavMode,
  type SidenavMode,
} from "@/lib/sidenav-shared";

// Persistent desktop navigation rail — visible the instant a visitor lands on
// ANY page, homepage included, without needing to scroll or open the ⌘K
// launcher first. Reported directly: the header's own nav (Navbar.tsx) is
// scroll-gated/translucent at the top of the page, and the ⌘K launcher +
// hamburger both put the site's actual breadth of features one interaction
// away instead of on screen — a new visitor has no reason to suspect there's
// a Deal Finder, a Best Basket optimiser, a Riftle daily puzzle, etc. behind
// that. This renders the same NAV_GROUPS index the launcher searches.
//
// TEXT ONLY — no per-link emoji, unlike CommandLauncher and CinematicNavMenu
// (FooterNav was already text-only). This is the one surface that is on
// screen permanently rather than opened for a moment, so a page of
// mismatched emoji read as decoration rather than signal here in a way they
// don't in a dropdown or footer column. The active link is marked with a
// left accent bar + colour instead, which scales to a list this long
// without turning into wallpaper. (The ONE emoji per GROUP — NavGroup.icon —
// is different: in the rail's collapsed mode below it is the whole signal.)
//
// TWO RAIL MODES (see lib/sidenav-shared.ts for the full reasoning):
// `expanded` is the full grouped list at 17rem; `collapsed` is a 4rem icon
// rail — one icon per group, the group's links in a flyout on hover, click
// or keyboard focus. Which one renders is decided by CSS alone, off
// `data-sidenav` on <html> and the viewport width (globals.css): 1024–1279px
// is always the icon rail, 1280px+ is expanded unless collapsed. Both blocks
// are in the DOM; `.sidenav-expanded` / `.sidenav-collapsed` toggle their
// display. That keeps first paint correct with zero JS state to hydrate: an
// inline script in the root layout stamps the attribute before paint, and
// this component only (a) re-applies the route's default on client-side
// navigation when there's no saved choice, and (b) flips + persists the
// choice (a cookie) when the visitor uses the chevron or presses "[".
//
// COLLAPSIBLE GROUPS inside the expanded list, not a fixed always-open list.
// Nine groups' worth of links (60+) rendered flat made the rail mostly a
// scrollbar — you had to hunt past Games and Guides to find Your Collection
// every single time. Each group is a disclosure, matching the pattern
// Filters.tsx already uses for its own facet sections. The default is still
// every group OPEN (this component's entire reason to exist is reading as
// "this site has a lot to offer" on first landing); collapsing one is
// something a visitor chooses, remembered locally so it survives a reload.
// Whichever group holds the page you're actually on always forces itself
// open, even across that memory — a collapsed section hiding your own
// location would read as broken, not tidy.
//
// `position: fixed`, not a flex/grid layout participant — a fixed-width rail
// slotted INTO the page's box model would shift `<main>`'s horizontal center
// off the true viewport, which CinematicHero's full-bleed hero background
// depends on (see that component's own doc comment: "main is centred in the
// viewport on every breakpoint, so the breakout is symmetric"). Fixed
// positioning sidesteps that entirely — this panel simply layers on top of
// the page at a fixed screen position, and every OTHER element that needs to
// make room for it (main, the footer ad zone, the footer, and CinematicHero's
// breakout math) reads the same `--sidenav-w` custom property
// (globals.css) instead of duplicating a hardcoded width.
//
// `hidden lg:flex`: matches the breakpoint (1024px) at which `--sidenav-w`
// first becomes non-zero in globals.css. Below it, the existing hamburger +
// ⌘K launcher are the only nav surfaces, unchanged.

// Only the DEVIATIONS from "every group open" are worth remembering — that
// way a group added to NAV_GROUPS tomorrow starts open for everyone, the same
// as it would if this component had no memory at all.
const STORAGE_KEY = "rc:sidenav:collapsed-groups";

function isActiveLink(pathname: string | null, link: { href: string; external?: boolean }): boolean {
  // Active when the current route IS this link, or is nested under it (e.g.
  // /card/abc under /browse) — but never for "/" itself, which would
  // otherwise match every route via startsWith("/").
  return (
    link.href !== "/" &&
    !link.external &&
    (pathname === link.href || !!pathname?.startsWith(`${link.href}/`))
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function readRailMode(): SidenavMode {
  return document.documentElement.getAttribute("data-sidenav") === "collapsed" ? "collapsed" : "expanded";
}

function applyRailMode(mode: SidenavMode) {
  document.documentElement.setAttribute("data-sidenav", mode);
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function SideNav() {
  const pathname = usePathname();

  // The one group (if any) that contains the current page — used both to mark
  // its link active and to keep that group visible regardless of what the
  // visitor collapsed on an earlier visit.
  const activeGroupTitle = useMemo(
    () => NAV_GROUPS.find((g) => g.links.some((l) => isActiveLink(pathname, l)))?.title ?? null,
    [pathname],
  );

  // ── Rail mode (expanded / collapsed) ──────────────────────────────────────
  // Mirrors the <html> attribute for aria-labels only; CSS owns the layout.
  const [railMode, setRailMode] = useState<SidenavMode>("expanded");
  // Which group's flyout is open in the icon rail.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Client-side navigation: with no saved choice, follow the new route's default.
  useEffect(() => {
    const next = resolveSidenavMode(readSidenavCookie(document.cookie), pathname ?? "/");
    applyRailMode(next);
    setRailMode(next);
    setOpenGroup(null);
  }, [pathname]);

  const toggleRail = useCallback(() => {
    const next: SidenavMode = readRailMode() === "collapsed" ? "expanded" : "collapsed";
    applyRailMode(next);
    setRailMode(next);
    setOpenGroup(null);
    document.cookie = `${SIDENAV_COOKIE}=${next}; path=/; max-age=${SIDENAV_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);

  // "[" toggles the rail (only where both modes exist); Esc closes a flyout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenGroup(null);
        return;
      }
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (window.innerWidth < 1280) return;
      e.preventDefault();
      toggleRail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleRail]);

  // ── Per-group disclosures (expanded list) ─────────────────────────────────
  // Empty set = every group open, matching SSR/first paint exactly (localStorage
  // isn't available server-side, so starting from anything else here would
  // mean the client's first render disagrees with the server's and React logs
  // a hydration mismatch). Real collapse state is loaded in the effect below,
  // after hydration — the same restore-after-mount shape TradeCalculator uses
  // for its own localStorage-backed state.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const titles = raw ? JSON.parse(raw) : null;
      if (Array.isArray(titles)) setCollapsed(new Set(titles));
    } catch {
      /* corrupt/unavailable storage — every group stays open, which is the
         same default a first-time visitor gets */
    }
    setHydrated(true);
  }, []);

  // Force the active group open on every navigation, even one the visitor
  // collapsed in a previous session — landing on a page inside a section you
  // can't currently see would look like a bug, not a tidy sidebar.
  useEffect(() => {
    if (!hydrated || !activeGroupTitle || !collapsed.has(activeGroupTitle)) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(activeGroupTitle);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* quota/private mode — the in-memory state still updates for this visit */
      }
      return next;
    });
    // Only re-run when the active group changes, not on every `collapsed`
    // update (toggleGroup below already persists its own changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupTitle, hydrated]);

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* quota/private mode — collapsing still works for this visit */
      }
      return next;
    });
  }

  // One link renderer for both the expanded list and the icon rail's flyouts.
  const renderLink = (link: (typeof NAV_GROUPS)[number]["links"][number]) => {
    const active = isActiveLink(pathname, link);
    const className = `block truncate rounded-md border-l-2 py-1.5 pl-3 pr-2 text-sm transition-colors ${
      active
        ? "border-brand-400 bg-brand-500/10 font-semibold text-brand-300"
        : "border-transparent text-slate-300 hover:border-ink-700 hover:bg-ink-800 hover:text-white"
    }`;
    return (
      <li key={link.href}>
        {link.external ? (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
            {link.label}
          </a>
        ) : (
          <Link href={link.href} className={className} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        )}
      </li>
    );
  };

  const railCollapsed = railMode === "collapsed";

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-16 z-20 hidden h-[calc(100vh-4rem)] w-[var(--sidenav-w)] flex-col border-r border-ink-800 bg-ink-900/95 backdrop-blur lg:flex"
      onMouseLeave={() => setOpenGroup(null)}
    >
      {/* The rail toggle only exists where both modes do (xl+); 1024–1279px
          is icon-only and has nothing to toggle to. */}
      <div className="hidden shrink-0 items-center justify-end px-2 pt-2 xl:flex">
        <button
          type="button"
          onClick={toggleRail}
          aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!railCollapsed}
          title={`${railCollapsed ? "Expand" : "Collapse"} navigation  [`}
          className="tap-icon rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {railCollapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>

      {/* Expanded: the full grouped list, each group a disclosure (display
          controlled in globals.css). This block is the scroll container, not
          the nav — an overflow-y:auto nav would clip the icon rail's flyouts. */}
      <div className="sidenav-expanded min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => {
          const open = !collapsed.has(group.title);
          const panelId = `sidenav-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={group.title} className="border-b border-ink-800/60 py-1 last:border-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-300"
              >
                {group.title}
                <Chevron open={open} />
              </button>
              {open && (
                <ul id={panelId} className="space-y-0.5 pb-1.5">
                  {group.links.map(renderLink)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapsed: one icon per group, links in a flyout. Deliberately NOT a
          scroll container — ten 44px icons fit any laptop viewport, and an
          overflow-y:auto parent would clip the flyout that pops out to the right. */}
      <ul className="sidenav-collapsed min-h-0 flex-1 px-2 pb-3 pt-1">
        {NAV_GROUPS.map((group) => {
          const groupActive = group.title === activeGroupTitle;
          const isOpen = openGroup === group.title;
          return (
            <li key={group.title} className="relative mb-1" onMouseEnter={() => setOpenGroup(group.title)}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={isOpen}
                aria-label={group.title}
                title={group.title}
                onClick={() => setOpenGroup(isOpen ? null : group.title)}
                onFocus={() => setOpenGroup(group.title)}
                className={`grid h-11 w-full place-items-center rounded-lg text-xl leading-none transition-colors ${
                  groupActive ? "bg-brand-500/15" : isOpen ? "bg-ink-800" : "hover:bg-ink-800"
                }`}
              >
                <span aria-hidden="true">{group.icon}</span>
              </button>
              {isOpen && (
                <div
                  role="group"
                  aria-label={group.title}
                  className="absolute left-full top-0 z-30 ml-2 w-60 rounded-lg border border-ink-700 bg-ink-900 p-2 shadow-card"
                >
                  <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.title}
                  </div>
                  <ul className="space-y-0.5">{group.links.map(renderLink)}</ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
