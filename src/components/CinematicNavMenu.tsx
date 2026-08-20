"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMegaMenu } from "./MegaMenuProvider";
import { NAV_GROUPS, POPULAR_LINKS, type NavGroupLink } from "./nav-groups";
import { searchNav } from "./nav-search";
import { BrandLogo } from "./BrandLogo";

// Shared by the Popular grid and the full category panels below — both need
// the identical active-pathname/external branching, so it's factored out
// rather than duplicated (and drifting) between the two render paths.
function FeatureLink({ l, pathname, onClick }: { l: NavGroupLink; pathname: string; onClick: () => void }) {
  const active = !l.external && (pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)));
  const className = `group flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 ${
    active ? "bg-brand-500 font-semibold text-ink-950" : "text-slate-200 hover:bg-ink-800 hover:text-white"
  }`;
  if (l.external) {
    return (
      <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        <span className="text-lg" aria-hidden>{l.emoji}</span>
        <span className="font-medium">{l.label}</span>
      </a>
    );
  }
  return (
    <Link href={l.href} onClick={onClick} aria-current={active ? "page" : undefined} className={className}>
      <span className="text-lg" aria-hidden>{l.emoji}</span>
      <span className="font-medium">{l.label}</span>
    </Link>
  );
}

// Full-screen, "movie-like" navigation overlay (ported from DexCompare). Stays
// mounted and toggles via classes (animates in AND out): scroll-lock, Escape,
// backdrop/outside click, transform/opacity transitions + a focus trap. Flat,
// single accent (brand green). Fully prefers-reduced-motion safe.
export function CinematicNavMenu() {
  const { open, setOpen } = useMegaMenu();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  // Reported directly: "we don't need everything to show up... have a subset
  // of the most used features and have a way for them to look at all
  // features only if they want to." Default view is POPULAR_LINKS (flat, no
  // category headers); this reveals the full NAV_GROUPS panel instead —
  // typing a filter always searches the full index regardless of this flag,
  // since narrowing-by-search already IS "show me something specific".
  const [showAll, setShowAll] = useState(false);

  // React 18's JSX `inert` prop doesn't reliably reach the DOM (no first-class
  // support until React 19 — the attribute was silently missing from the
  // rendered HTML, which is exactly what let a close button and search input
  // stay tab-reachable inside this aria-hidden subtree while closed). Setting
  // the DOM property directly bypasses that gap; `HTMLElement.prototype.inert`
  // itself is supported by every browser this site targets.
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.inert = !open;
  }, [open]);

  // The panels below, narrowed by the FEATURE filter. Same matcher the ⌘K
  // launcher uses, so "prices"/"deals"/"blog"/"alerts" behave identically on a
  // phone and on a desktop.
  const filtering = filter.trim().length > 0;
  const sections = useMemo(() => {
    if (!filtering) return NAV_GROUPS.map((g) => ({ title: g.title, links: g.links }));
    const hits = searchNav(filter);
    const byGroup = new Map<string, typeof hits>();
    for (const h of hits) {
      const list = byGroup.get(h.group);
      if (list) list.push(h);
      else byGroup.set(h.group, [h]);
    }
    return NAV_GROUPS.filter((g) => byGroup.has(g.title)).map((g) => ({
      title: g.title,
      links: byGroup.get(g.title)!,
    }));
  }, [filter, filtering]);

  // A stale filter (or a stale "showing everything") on reopen would show a
  // fraction — or an overwhelming amount — of the menu with no obvious reason
  // why. Every open starts fresh: Popular, unfiltered.
  useEffect(() => {
    if (!open) {
      setFilter("");
      setShowAll(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 60);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, setOpen]);

  // Simple focus trap: loop Tab within the dialog while open.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const close = () => setOpen(false);

  return (
    // `inert` alongside aria-hidden: the panel stays mounted when closed (so the
    // open/close transition can animate), which left a close button and a search
    // input focusable inside an aria-hidden subtree — a screen-reader user could
    // tab into controls that, as far as the accessibility tree is concerned, do
    // not exist. `inert` removes them from the tab order and from hit-testing
    // for exactly as long as aria-hidden is set, so the two can't disagree (set
    // imperatively via overlayRef above — see that comment for why).
    <div
      ref={overlayRef}
      aria-hidden={!open}
      className={`fixed inset-0 z-[95] ${open ? "" : "pointer-events-none"}`}
    >
      {/* Solid backdrop — no transparency, no blur. */}
      <div
        onClick={close}
        className={`absolute inset-0 bg-ink-950 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* Content (click empty space to close) */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        onKeyDown={onKeyDown}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={`absolute inset-0 overflow-y-auto p-4 transition-all duration-300 sm:p-8 ${open ? "cine-open scale-100 opacity-100 translate-y-0" : "scale-[0.98] opacity-0 translate-y-3"}`}
      >
        {/* The middle panel — flat, bordered. */}
        <div className="relative mx-auto my-auto max-w-5xl">
          <div className="relative rounded-lg border border-ink-800 bg-ink-900 p-5 sm:p-8">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-4">
              <Link href="/" onClick={close} className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <BrandLogo />
                <span className="font-display text-lg font-extrabold text-white">
                  Rift<span className="text-brand-400">Compare</span>
                </span>
              </Link>
              <button
                type="button"
                data-autofocus
                onClick={close}
                aria-label="Close menu"
                className="rounded-md border border-ink-800 bg-ink-850 px-3 py-2 text-sm font-bold text-white outline-none transition-colors hover:border-ink-600 hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-brand-400 min-h-11"
              >
                Close ✕
              </button>
            </div>

            {/* FEATURE filter front-and-centre — NOT the card search.
                This slot used to hold the card SearchBar. On a phone
                this overlay IS the Explore menu (the ⌘K launcher's button is
                desktop-only and ⌘K needs a keyboard), so the one input sitting
                directly above a grid of features searched the card database
                instead of filtering the grid — reported as "the search bar is
                broken for the explore features… it acts like a normal search bar
                and searches all the cards". The card search has its own
                full-width row in the phone navbar, so nothing is lost. */}
            <div className="mx-auto mt-6 max-w-2xl">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter features, tools and pages…"
                aria-label="Filter RiftCompare features"
                className="input w-full"
                type="search"
              />
              {filtering && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  {sections.reduce((n, s2) => n + s2.links.length, 0)} feature
                  {sections.reduce((n, s2) => n + s2.links.length, 0) === 1 ? "" : "s"} match &ldquo;{filter}&rdquo; ·{" "}
                  <Link href={`/browse?q=${encodeURIComponent(filter)}`} onClick={close} className="text-brand-400 hover:underline">
                    search cards for &ldquo;{filter}&rdquo; instead →
                  </Link>
                </p>
              )}
            </div>

            {/* Default view: the curated Popular set, flat (no category
                headers — the whole point is "glance, tap, done" instead of
                hunting through ~9 categories). Swaps out for the full
                category-grouped panel below the moment a visitor filters
                (real search intent — narrower is better) or explicitly asks
                to see everything. */}
            {!filtering && !showAll ? (
              <>
                <div className="mt-7 rounded-lg border border-ink-800 border-l-2 border-l-brand-500 bg-ink-850 p-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />
                    Popular
                  </div>
                  <ul className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                    {POPULAR_LINKS.map((l) => (
                      <li key={l.href}>
                        <FeatureLink l={l} pathname={pathname} onClick={close} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="tap-link inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-brand-300 outline-none transition-colors hover:text-brand-200 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    Show all features →
                  </button>
                </div>
              </>
            ) : (
              /* Category panels (flat, single accent, staggered on open) */
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sections.map((sec, si) => (
                  <div
                    key={sec.title}
                    className="cine-item relative overflow-hidden rounded-lg border border-ink-800 border-l-2 border-l-brand-500 bg-ink-850 p-4"
                    style={{ "--cine-delay": `${si * 70}ms` } as CSSProperties}
                  >
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />
                      {sec.title}
                    </div>
                    <ul className="space-y-0.5">
                      {sec.links.map((l) => (
                        <li key={l.href}>
                          <FeatureLink l={l} pathname={pathname} onClick={close} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
