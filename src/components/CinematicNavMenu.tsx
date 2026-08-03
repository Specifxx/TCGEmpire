"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, type CSSProperties } from "react";
import { useMegaMenu } from "./MegaMenuProvider";
import { NAV_GROUPS } from "./nav-groups";
import { SearchBar } from "./SearchBar";
import { BrandLogo } from "./BrandLogo";

// Full-screen, "movie-like" navigation overlay (ported from DexCompare). Stays
// mounted and toggles via classes (animates in AND out): scroll-lock, Escape,
// backdrop/outside click, transform/opacity transitions + a focus trap. Flat,
// single accent (brand green). Fully prefers-reduced-motion safe.
export function CinematicNavMenu() {
  const { open, setOpen } = useMegaMenu();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);

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
    // for exactly as long as aria-hidden is set, so the two can't disagree.
    <div
      aria-hidden={!open}
      {...(open ? {} : { inert: true })}
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

            {/* Search front-and-centre */}
            <div className="mx-auto mt-6 max-w-2xl">
              <Suspense fallback={<div className="input" />}>
                <SearchBar />
              </Suspense>
            </div>

            {/* Category panels (flat, single accent, staggered on open) */}
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_GROUPS.map((sec, si) => (
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
                    {sec.links.map((l) => {
                      const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
                      return (
                        <li key={l.href}>
                          <Link
                            href={l.href}
                            onClick={close}
                            aria-current={active ? "page" : undefined}
                            className={`group flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 ${
                              active ? "bg-brand-500 font-semibold text-ink-950" : "text-slate-200 hover:bg-ink-800 hover:text-white"
                            }`}
                          >
                            <span className="text-lg" aria-hidden>{l.emoji}</span>
                            <span className="font-medium">{l.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
