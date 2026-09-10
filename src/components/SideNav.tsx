"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav-groups";
import type { NavGroupLink } from "./nav-groups";
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
// TWO MODES (see lib/sidenav-shared.ts for the full reasoning): `expanded` is
// the full grouped list at 17rem; `collapsed` is an icon rail at 4rem — one
// icon per group, the group's links in a flyout on hover/click/focus. Which
// one renders is decided by CSS alone, off `data-sidenav` on <html> and the
// viewport width (globals.css): 1024–1279px is always the icon rail, 1280px+
// is expanded unless collapsed. Both blocks are in the DOM; `.sidenav-expanded`
// / `.sidenav-collapsed` toggle their display. That keeps first paint correct
// with zero JS state to hydrate: an inline script in the root layout stamps
// the attribute before paint, and this component only (a) re-applies the
// route's default on client-side navigation when there's no saved choice,
// and (b) flips + persists the choice when the visitor uses the toggle or
// presses "[".
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

function readMode(): SidenavMode {
  return document.documentElement.getAttribute("data-sidenav") === "collapsed" ? "collapsed" : "expanded";
}

function applyMode(mode: SidenavMode) {
  document.documentElement.setAttribute("data-sidenav", mode);
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function SideNav() {
  const pathname = usePathname() ?? "/";
  // Mirrors the <html> attribute for aria-labels only; CSS owns the layout.
  const [mode, setMode] = useState<SidenavMode>("expanded");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Client-side navigation: with no saved choice, follow the new route's default.
  useEffect(() => {
    const next = resolveSidenavMode(readSidenavCookie(document.cookie), pathname);
    applyMode(next);
    setMode(next);
    setOpenGroup(null);
  }, [pathname]);

  const toggle = useCallback(() => {
    const next: SidenavMode = readMode() === "collapsed" ? "expanded" : "collapsed";
    applyMode(next);
    setMode(next);
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
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Active when the current route IS this link, or is nested under it (e.g.
  // /card/abc under /browse) — but never for "/" itself, which would otherwise
  // match every route via startsWith("/").
  const isActive = (link: NavGroupLink) =>
    link.href !== "/" && !link.external && (pathname === link.href || pathname.startsWith(`${link.href}/`));

  const renderLink = (link: NavGroupLink) => {
    const active = isActive(link);
    const className = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
      active ? "bg-brand-500/15 font-semibold text-brand-300" : "text-slate-300 hover:bg-ink-800 hover:text-white"
    }`;
    return (
      <li key={link.href}>
        {link.external ? (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
            <span aria-hidden="true">{link.emoji}</span>
            <span className="truncate">{link.label}</span>
          </a>
        ) : (
          <Link href={link.href} className={className} aria-current={active ? "page" : undefined}>
            <span aria-hidden="true">{link.emoji}</span>
            <span className="truncate">{link.label}</span>
          </Link>
        )}
      </li>
    );
  };

  const collapsed = mode === "collapsed";

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-16 z-20 hidden h-[calc(100vh-4rem)] w-[var(--sidenav-w)] flex-col border-r border-ink-800 bg-ink-900/95 backdrop-blur lg:flex"
      onMouseLeave={() => setOpenGroup(null)}
    >
      {/* The toggle only exists where both modes do (xl+); 1024–1279px is
          icon-only and has nothing to toggle to. */}
      <div className="hidden shrink-0 items-center justify-end px-2 pt-2 xl:flex">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          title={`${collapsed ? "Expand" : "Collapse"} navigation  [`}
          className="tap-icon rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>

      {/* Expanded: the full grouped list (display controlled in globals.css). */}
      <div className="sidenav-expanded min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </div>
            <ul className="space-y-0.5">{group.links.map(renderLink)}</ul>
          </div>
        ))}
      </div>

      {/* Collapsed: one icon per group, links in a flyout. Deliberately NOT a
          scroll container — an overflow-y:auto parent would clip the flyout
          that pops out to the right; ten 44px icons fit any laptop viewport. */}
      <ul className="sidenav-collapsed min-h-0 flex-1 px-2 pb-4 pt-1">
        {NAV_GROUPS.map((group) => {
          const groupActive = group.links.some(isActive);
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
