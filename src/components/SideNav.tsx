"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav-groups";

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
// without turning into wallpaper.
//
// COLLAPSIBLE, not a fixed always-open list. Nine groups' worth of links
// (60+) rendered flat made the rail mostly a scrollbar — you had to hunt past
// Games and Guides to find Your Collection every single time. Each group is a
// disclosure now, matching the pattern Filters.tsx already uses for its own
// facet sections. The default is still every group OPEN (this component's
// entire reason to exist is reading as "this site has a lot to offer" on
// first landing, which a rail that opens collapsed everywhere would not do);
// collapsing one is something a visitor now chooses, and that choice is
// remembered locally so it survives a reload instead of resetting every time.
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
// `hidden xl:flex`: matches the exact breakpoint (1280px) that
// `--sidenav-w` switches on in globals.css. Below it, the existing
// hamburger + ⌘K launcher are the only nav surfaces, unchanged — a narrower
// desktop/tablet has no room to spare for a 17rem rail without meaningfully
// narrowing every page's content.

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

export function SideNav() {
  const pathname = usePathname();

  // The one group (if any) that contains the current page — used both to mark
  // its link active and to keep that group visible regardless of what the
  // visitor collapsed on an earlier visit.
  const activeGroupTitle = useMemo(
    () => NAV_GROUPS.find((g) => g.links.some((l) => isActiveLink(pathname, l)))?.title ?? null,
    [pathname],
  );

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

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-16 z-20 hidden h-[calc(100vh-4rem)] w-[var(--sidenav-w)] flex-col overflow-y-auto border-r border-ink-800 bg-ink-900/95 backdrop-blur xl:flex"
    >
      <div className="flex-1 px-3 py-3">
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
                  {group.links.map((link) => {
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
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
