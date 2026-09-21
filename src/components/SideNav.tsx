"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { NAV_GROUPS } from "./nav-groups";
import { BrandLogo } from "./BrandLogo";
import { useCommandLauncher } from "./CommandLauncher";
import { useCountry } from "./CountryProvider";
import { useMe } from "@/lib/use-me";
import { COUNTRIES } from "@/lib/country";

// The persistent desktop navigation rail: the full left edge of the page from
// `lg` up, carrying the brand, one search affordance, every link in
// NAV_GROUPS, and a pinned Premium/account block at the foot.
//
// IT IS A NAVIGATION SYSTEM AND NOTHING ELSE. An earlier revision opened with
// a flat list of eight "primary destinations" (Home, Cards, Prices, …) above
// the grouped index, mirroring the reference design this layout came from.
// That was wrong for this site and was removed the same day it shipped:
// "when I click prices, it should just expand to all of the different
// features — I'm not going to a single page when I click prices." Every one
// of those eight was also a link INSIDE a group below it, so the rail showed
// the same destination twice and made a section header look like a page. A
// group header is a disclosure now, never a link; the leaves are the links.
//
// ALWAYS EXPANDED. The two-mode rail (a 4rem icon strip with hover flyouts,
// toggled by a chevron and remembered in a cookie) is gone: "the collapsible
// option is actually, there's no point — have the default as uncollapsed."
// Removing it rather than re-defaulting it took a whole mechanism with it —
// the cookie, the pre-paint boot script that stamped `data-sidenav`, the
// `[` keybinding, the flyout positioning and the CSS that switched between
// the two — which is why the rail is now a plain list with no mode to keep
// the server and the client agreeing about.
//
// `position: fixed`, not a flex/grid layout participant — a fixed-width rail
// slotted INTO the page's box model would shift `<main>`'s horizontal centre
// off the true viewport, which CinematicHero's full-bleed hero background
// depends on. Everything that needs to make room for it (main, the footer ad
// zone, the footer, the header, CinematicHero's breakout maths) reads the
// same `--sidenav-w` custom property from globals.css instead of duplicating
// a hardcoded width.

// Only the DEVIATIONS from "every group open" are remembered — so a group
// added to NAV_GROUPS tomorrow starts open for everyone, exactly as it would
// if this component had no memory at all.
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
  const launcher = useCommandLauncher();
  const { country } = useCountry();
  const { premium } = useMe();

  // The one group (if any) containing the current page — used both to mark its
  // link active and to keep that group visible regardless of what the visitor
  // collapsed on an earlier visit.
  const activeGroupTitle = useMemo(
    () => NAV_GROUPS.find((g) => g.links.some((l) => isActiveLink(pathname, l)))?.title ?? null,
    [pathname],
  );

  // Empty set = every group open, matching SSR and first client paint exactly
  // (localStorage isn't readable on the server, so starting from anything else
  // would make the client's first render disagree and React would log a
  // hydration mismatch). The real state loads in the effect below.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const titles = raw ? JSON.parse(raw) : null;
      if (Array.isArray(titles)) setCollapsed(new Set(titles));
    } catch {
      /* corrupt/unavailable storage — every group stays open, the same default
         a first-time visitor gets */
    }
    setHydrated(true);
  }, []);

  // Force the active group open on every navigation, even one the visitor
  // collapsed in a previous session: landing on a page inside a section you
  // can't currently see reads as broken, not tidy.
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
    // update (toggleGroup persists its own changes).
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
      className="fixed left-0 top-0 z-rail hidden h-screen w-[var(--sidenav-w)] flex-col border-r border-ink-800 bg-ink-900 lg:flex"
    >
      {/* ── Brand ─────────────────────────────────────────────────────────
          The rail owns the brand from lg up, because it runs the full page
          height and reaches the top-left corner the header's own mark used to
          occupy. Navbar.tsx hides its copy at exactly this breakpoint rather
          than drawing a second one beside it. */}
      <Link
        href="/"
        aria-label="RiftCompare home"
        className="flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-800 px-3 transition-colors hover:bg-ink-800/60"
      >
        <BrandLogo />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight text-white">
            Rift<span className="text-brand-400">Compare</span>
          </span>
          {/* The visitor's own market — the context every price on the site is
              quoted in, and the one piece of state worth showing permanently. */}
          <span className="block truncate text-[11px] text-slate-500">{COUNTRIES[country].label}</span>
        </span>
      </Link>

      {/* ── Search ────────────────────────────────────────────────────────
          A button, not an input: the ⌘K launcher IS the site's search, and a
          second real input here would be a second thing to keep in sync with
          it. This is the only search affordance from lg up — the header's
          inline box was removed when this arrived. */}
      <div className="shrink-0 border-b border-ink-800 px-3 py-3">
        <button
          type="button"
          onClick={launcher.open}
          aria-label="Search"
          title="Search  ⌘K"
          className="flex w-full items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-950/60 px-2.5 py-2 text-sm text-slate-400 transition-colors hover:border-ink-600 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px] shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
        </button>
      </div>

      {/* ── The index ─────────────────────────────────────────────────────
          Every NAV_GROUPS link, each group a disclosure. This is the whole
          navigation system: the same index the ⌘K launcher searches, the
          footer site-map renders and /llms.txt publishes, so a link added in
          one place appears in all four. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {NAV_GROUPS.map((group) => {
          const open = !collapsed.has(group.title);
          const panelId = `sidenav-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
          const groupActive = group.title === activeGroupTitle;
          return (
            <div key={group.title} className="py-0.5">
              {/* A DISCLOSURE, never a link — see this file's header. The
                  group's own icon is tinted when the current page is inside
                  it, so the section you're in is findable at a glance even
                  when its links are scrolled out of view. */}
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                aria-controls={panelId}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-ink-800/60 ${
                  groupActive ? "text-brand-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {group.icon ? <NavIcon name={group.icon} className="h-4 w-4 shrink-0" /> : null}
                <span className="flex-1 truncate text-left">{group.title}</span>
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

      {/* ── Pinned Premium ───────────────────────────────────────────────
          Outside the scroller, so it stays reachable without scrolling past
          the ~60-link index above it. Gold is this site's Premium identity
          colour and is used for nothing else in the rail.
          
          PREMIUM ONLY — no session row. An earlier revision had "Sign in"
          here too, which duplicated the header's own account control: the
          owner's split is explicit ("I still want ... the accounts" in the
          header; "have premium on the sidebar as well ... at the bottom"),
          and a second sign-in link is exactly the double-up this pass was
          asked to remove elsewhere in the rail. */}
      <div className="shrink-0 space-y-1.5 border-t border-ink-800 px-3 py-2.5">
        {!premium && (
          <Link
            href="/premium"
            className="flex w-full items-center gap-2.5 rounded-lg border border-gold/40 px-2.5 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold/10"
          >
            <NavIcon name="trophy" className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">Get Premium</span>
          </Link>
        )}

      </div>
    </nav>
  );
}
