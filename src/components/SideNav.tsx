"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav-groups";

// Persistent desktop navigation rail — visible the instant a visitor lands on
// ANY page, homepage included, without needing to scroll or open the ⌘K
// launcher first. Reported directly: the header's own nav (Navbar.tsx) is
// scroll-gated/translucent at the top of the page, and the ⌘K launcher +
// hamburger both put the site's actual breadth of features one interaction
// away instead of on screen — a new visitor has no reason to suspect there's
// a Deal Finder, a Best Basket optimiser, a Riftle daily puzzle, etc. behind
// that. This renders the same NAV_GROUPS index the launcher searches, as an
// always-on list, so "this site has a lot to offer" reads immediately.
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
export function SideNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-16 z-20 hidden h-[calc(100vh-4rem)] w-[var(--sidenav-w)] flex-col overflow-y-auto border-r border-ink-800 bg-ink-900/95 backdrop-blur xl:flex"
    >
      <div className="flex-1 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.links.map((link) => {
                // Active when the current route IS this link, or is nested under
                // it (e.g. /card/abc under /browse) — but never for "/" itself,
                // which would otherwise match every route via startsWith("/").
                const active =
                  link.href !== "/" &&
                  !link.external &&
                  (pathname === link.href || pathname?.startsWith(`${link.href}/`));
                const className = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-brand-500/15 font-semibold text-brand-300"
                    : "text-slate-300 hover:bg-ink-800 hover:text-white"
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
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
