"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { NAV_GROUPS } from "./nav-groups";
import type { NavGroup, NavGroupLink } from "./nav-groups";
import { PRIMARY_NAV } from "./primary-nav";
import { BrandLogo } from "./BrandLogo";
import { useCommandLauncher } from "./CommandLauncher";
import { useCountry } from "./CountryProvider";
import { useMe } from "@/lib/use-me";
import { COUNTRIES } from "@/lib/country";
import { usePresence, DUR } from "@/lib/motion";
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
// is always the icon rail, 1280px+ is the icon rail too UNLESS explicitly
// expanded. Both blocks are in the DOM; `.sidenav-expanded` /
// `.sidenav-collapsed` toggle their display. That keeps first paint correct
// with zero JS state to hydrate: an inline script in the root layout stamps
// the attribute before paint (collapsed, unless the visitor's cookie says
// otherwise), and this component only (a) re-syncs its own aria-label state
// on client-side navigation, and (b) flips + persists the choice (a cookie)
// when the visitor uses the chevron or presses "[".
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
  return document.documentElement.getAttribute("data-sidenav") === "expanded" ? "expanded" : "collapsed";
}

function applyRailMode(mode: SidenavMode) {
  document.documentElement.setAttribute("data-sidenav", mode);
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

// One collapsed-rail icon + its flyout — extracted so usePresence (a hook)
// can run once per group instead of once for the whole NAV_GROUPS.map(), and
// so the flyout's own keyboard handling (roving tabindex, Escape-returns-
// focus) has somewhere to live without cluttering SideNav itself.
function RailGroup({
  group,
  isOpen,
  groupActive,
  setOpenGroup,
  renderLink,
}: {
  group: NavGroup;
  isOpen: boolean;
  groupActive: boolean;
  setOpenGroup: (title: string | null) => void;
  renderLink: (link: NavGroupLink) => React.ReactNode;
}) {
  const { mounted, entered } = usePresence(isOpen, DUR.fast);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  // Viewport coordinates for the flyout. It is `position: fixed`, NOT
  // `absolute left-full`, because the collapsed list around it has to scroll:
  // the rail now carries the primary destinations as well as one icon per
  // group (18 icons, ~790px) and no longer fits a laptop viewport the way ten
  // did. An `overflow-y: auto` ancestor clips an absolutely-positioned child
  // that sticks out sideways (and CSS turns `overflow-x: visible` into `auto`
  // the moment the other axis scrolls), so the panel is measured off the
  // trigger's own rect instead and escapes the scroller entirely.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      // Clamp so a group low in the list opens UPWARD rather than off-screen.
      const estimated = 44 + group.links.length * 32;
      const top = Math.max(8, Math.min(r.top, window.innerHeight - estimated - 8));
      setPos({ top, left: r.right + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen, group.links.length]);

  function focusables(): HTMLElement[] {
    return Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);
  }

  // Roving tabindex within the open flyout: Arrow keys move between links,
  // Home/End jump to the ends, Escape closes and returns focus to the
  // trigger button — the same "close returns you to where you were" contract
  // Dialog gives every overlay, applied here since the flyout isn't Dialog.
  function onPanelKeyDown(e: React.KeyboardEvent) {
    const items = focusables();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenGroup(null);
      buttonRef.current?.focus();
    }
  }

  // ArrowRight from the collapsed button opens the flyout and moves straight
  // into it — the keyboard equivalent of hovering onto the panel.
  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight") return;
    e.preventDefault();
    setOpenGroup(group.title);
    requestAnimationFrame(() => focusables()[0]?.focus());
  }

  return (
    <li className="relative mb-1" onMouseEnter={() => setOpenGroup(group.title)}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={group.title}
        title={group.title}
        onClick={() => setOpenGroup(isOpen ? null : group.title)}
        onFocus={() => setOpenGroup(group.title)}
        onKeyDown={onButtonKeyDown}
        className={`grid h-11 w-full place-items-center rounded-lg transition-colors ${
          groupActive
            ? "bg-brand-500/15 text-brand-300"
            : isOpen
              ? "bg-ink-800 text-white"
              : "text-slate-400 hover:bg-ink-800 hover:text-white"
        }`}
      >
        {/* The icon takes currentColor, so the active/hover states above
            actually reach it — the emoji this replaced could not be
            tinted at all, leaving the active group's only cue its
            background tint. */}
        {group.icon ? <NavIcon name={group.icon} className="h-5 w-5" /> : null}
      </button>
      {mounted && (
        <div
          ref={panelRef}
          role="group"
          aria-labelledby={buttonId}
          onKeyDown={onPanelKeyDown}
          style={pos ? { top: pos.top, left: pos.left } : undefined}
          className={`fixed z-flyout max-h-[80vh] w-60 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-2 shadow-card transition-[opacity,transform] duration-fast ease-out ${
            pos ? "" : "invisible"
          } ${entered ? "translate-x-0 opacity-100" : "motion-safe:-translate-x-1 motion-safe:opacity-0"}`}
        >
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {group.title}
          </div>
          <ul className="space-y-0.5">{group.links.map(renderLink)}</ul>
        </div>
      )}
    </li>
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

  // ── Rail mode (expanded / collapsed) ──────────────────────────────────────
  // Mirrors the <html> attribute for aria-labels only; CSS owns the layout.
  // "collapsed" is also the true default (see sidenav-shared.ts), so this
  // initial guess already matches the common case before the effect below
  // ever runs.
  const [railMode, setRailMode] = useState<SidenavMode>("collapsed");
  // Which group's flyout is open in the icon rail.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Re-derive from the cookie (there's no per-route default any more, so this
  // is the same value on every navigation) and close any open flyout — runs
  // on mount too, which is what keeps the aria-label above correct from the
  // first render even before this component has seen the real DOM attribute.
  useEffect(() => {
    const next = resolveSidenavMode(readSidenavCookie(document.cookie));
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

  // Kept for the toggle button's own aria-expanded/label only — every LAYOUT
  // decision in the markup below is made by CSS (.sidenav-row /
  // .sidenav-expanded / .sidenav-collapsed in globals.css), not by this, so
  // the server's HTML and the client's first paint can never disagree about
  // how the rail looks.
  const railCollapsed = railMode === "collapsed";

  // ── PA-style chrome: search, primary action, account block ────────────────
  const launcher = useCommandLauncher();
  const { country } = useCountry();
  const { user, premium, loaded: meLoaded } = useMe();

  const primaryActive = (item: (typeof PRIMARY_NAV)[number]) =>
    item.exact ? pathname === item.href : isActiveLink(pathname, item);

  // One renderer for both blocks: `.sidenav-row` centres the icon when the
  // rail is collapsed and puts the label beside it when expanded, so neither
  // copy can drift from the other in where it links.
  const renderPrimary = (item: (typeof PRIMARY_NAV)[number]) => {
    const active = primaryActive(item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
          title={item.label}
          className={`sidenav-row w-full rounded-lg border-l-2 px-2 py-2 text-sm font-semibold transition-colors ${
            active
              ? "border-brand-400 bg-brand-500/10 text-brand-300"
              : "border-transparent text-slate-300 hover:bg-ink-800 hover:text-white"
          }`}
        >
          <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
          <span className="sidenav-expanded truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Site navigation"
      className="fixed left-0 top-0 z-rail hidden h-screen w-[var(--sidenav-w)] flex-col border-r border-ink-800 bg-ink-900 lg:flex"
      onMouseLeave={() => setOpenGroup(null)}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────
          The rail owns the brand now that it runs the full page height, the
          same way the sidebar this follows does. The header keeps its own
          mark below lg, where this panel isn't rendered at all. */}
      <Link
        href="/"
        aria-label="RiftCompare home"
        className="sidenav-row h-16 shrink-0 border-b border-ink-800 px-2 transition-colors hover:bg-ink-800/60"
      >
        <BrandLogo />
        <span className="sidenav-expanded min-w-0">
          <span className="block truncate text-sm font-extrabold tracking-tight text-white">
            Rift<span className="text-brand-400">Compare</span>
          </span>
          {/* The visitor's own market — the piece of context every price on
              the site is quoted in, and the closest real equivalent to the
              workspace line this block mirrors. */}
          <span className="block truncate text-[11px] text-slate-500">{COUNTRIES[country].label}</span>
        </span>
      </Link>

      <div className="shrink-0 space-y-2 border-b border-ink-800 px-2 py-3">
        {/* ── Search ─────────────────────────────────────────────────────
            A button, not an input: the ⌘K launcher IS the site's search, and
            a second real input here would be a second thing to keep in sync
            with it. Same overlay the header's own search button opens. */}
        <button
          type="button"
          onClick={launcher.open}
          aria-label="Search"
          title="Search  ⌘K"
          className="sidenav-boxed sidenav-row w-full rounded-lg px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-ink-800 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px] shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sidenav-expanded flex-1 text-left">Search</span>
          <kbd className="sidenav-expanded rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
        </button>

        {/* ── Primary action ─────────────────────────────────────────────
            The rail's one filled button. Browsing the catalogue is this
            site's equivalent of "New deck": what a first-time visitor came
            to do, and the entry point every card page hangs off.

            BRAND GREEN, not the reference design's amber — same fill as
            .btn-primary and the signed-out header CTA. Gold is not a spare
            accent here: it is this site's PREMIUM identity colour (see the
            account block below, and the phone Premium link in Navbar.tsx),
            so a gold button that merely browses the catalogue would read as
            a paid feature. */}
        <Link
          href="/browse"
          aria-label="Browse cards"
          className="sidenav-row w-full rounded-lg bg-brand-500 px-2 py-2 text-sm font-bold text-ink-950 transition-colors hover:bg-brand-400"
        >
          <NavIcon name="browse" className="h-[18px] w-[18px] shrink-0" />
          <span className="sidenav-expanded">Browse cards</span>
        </Link>
      </div>

      {/* ── The index: primary destinations, then every grouped link ─────
          TWO separate blocks, one per mode, exactly as this component has
          always done it — both always in the DOM, CSS picks which shows, so
          the mode needs no JS state to hydrate.

          BOTH scroll now. The collapsed one used to be deliberately
          unscrollable, on the reasoning that ten group icons fit any laptop
          viewport and an `overflow-y: auto` ancestor would clip the flyouts
          that pop out to its right. The first half of that stopped being true
          when the primary destinations were added above the groups (18 icons,
          ~790px, which overflows a 900px viewport once the brand, search,
          action and account blocks take their share). So the second half was
          fixed instead: RailGroup's flyout is `position: fixed`, placed from
          the trigger's own rect, and is not clipped by any scroller. */}
      <div className="sidenav-expanded min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <ul className="space-y-0.5">{PRIMARY_NAV.map((item) => renderPrimary(item))}</ul>

        <div className="my-2 border-t border-ink-800" />

        {NAV_GROUPS.map((group) => {
          const open = !collapsed.has(group.title);
          const panelId = `sidenav-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={group.title} className="py-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-ink-800/60 hover:text-slate-300"
              >
                {group.icon ? <NavIcon name={group.icon} className="h-4 w-4 shrink-0" /> : null}
                <span className="flex-1 truncate text-left">{group.title}</span>
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

      <ul className="sidenav-collapsed min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-2">
        {PRIMARY_NAV.map((item) => renderPrimary(item))}
        <li aria-hidden className="!my-2 border-t border-ink-800" />
        {NAV_GROUPS.map((group) => (
          <RailGroup
            key={group.title}
            group={group}
            isOpen={openGroup === group.title}
            groupActive={group.title === activeGroupTitle}
            setOpenGroup={setOpenGroup}
            renderLink={renderLink}
          />
        ))}
      </ul>

      {/* ── Pinned account block ──────────────────────────────────────────
          Premium, then the session, then the rail's own collapse control —
          the bottom-of-sidebar grouping the layout this follows uses for the
          same three jobs. Pinned (outside the scroller above) so it stays
          reachable without scrolling past the ~60-link index. */}
      <div className="shrink-0 space-y-1.5 border-t border-ink-800 px-2 py-2.5">
        {!premium && (
          <Link
            href="/premium"
            aria-label="Go Premium"
            className="sidenav-row w-full rounded-lg border border-gold/40 px-2 py-2 text-sm font-bold text-gold transition-colors hover:bg-gold/10"
          >
            <NavIcon name="trophy" className="h-[18px] w-[18px] shrink-0" />
            <span className="sidenav-expanded truncate">Go Premium</span>
          </Link>
        )}

        {/* A fixed-height placeholder until /api/me resolves, so a signed-in
            visitor never sees the signed-out row flash first — the same
            contract NavUser follows in the header. */}
        {!meLoaded ? (
          <div aria-hidden className="h-[38px]" />
        ) : (
          <Link
            href={user ? "/profile" : "/login"}
            aria-label={user ? "Your account" : "Sign in"}
            className="sidenav-row w-full rounded-lg px-2 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-ink-800 hover:text-white"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px] shrink-0">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            <span className="sidenav-expanded truncate">{user ? user.displayName : "Sign in"}</span>
          </Link>
        )}

        {/* The rail toggle lives down here now (it used to float above the
            list), matching the bottom-corner panel control this layout uses.
            xl+ only: 1024-1279px is icon-only and has nothing to toggle to. */}
        <div className="sidenav-row sidenav-row-end hidden xl:flex">
          <button
            type="button"
            onClick={toggleRail}
            aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!railCollapsed}
            title={`${railCollapsed ? "Expand" : "Collapse"} navigation  [`}
            className="tap-icon rounded-lg text-slate-500 transition-colors hover:bg-ink-800 hover:text-white"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
