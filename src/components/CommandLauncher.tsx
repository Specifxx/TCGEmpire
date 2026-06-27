"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { NAV_GROUPS } from "./nav-groups";

// A global "command launcher": one searchable, full-screen overlay listing every
// section of the site, opened from a button on any page (navbar) or the homepage
// hero, or with ⌘K / Ctrl+K anywhere. This is how every page reaches every page now
// that the desktop rail is hidden on the homepage.

type LauncherCtx = { open: () => void; close: () => void; isOpen: boolean };
const Ctx = createContext<LauncherCtx | null>(null);

export function useCommandLauncher(): LauncherCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCommandLauncher must be used within CommandLauncherProvider");
  return c;
}

function GridIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function CommandLauncherProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  // ⌘K / Ctrl+K toggles from anywhere; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock background scroll while the overlay is open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  const q = query.trim().toLowerCase();
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    links: q ? g.links.filter((l) => l.label.toLowerCase().includes(q)) : g.links,
  })).filter((g) => g.links.length > 0);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Explore RiftCompare">
          <button className="absolute inset-0 animate-fade-in bg-ink-950/80 backdrop-blur-md" aria-label="Close" onClick={close} />
          <div className="card-surface relative z-10 mt-[7vh] flex max-h-[82vh] w-full max-w-3xl animate-fade-up flex-col overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-ink-800 p-3">
              <GridIcon className="h-5 w-5 shrink-0 text-brand-400" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search features, tools, pages…"
                className="w-full bg-transparent text-base text-slate-100 placeholder:text-slate-500 outline-none"
                aria-label="Search RiftCompare features"
              />
            </div>
            {/* Results */}
            <div className="overflow-y-auto p-4">
              {groups.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No matches for &ldquo;{query}&rdquo;.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.map((g) => (
                    <div key={g.title}>
                      <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-brand-300">{g.title}</div>
                      <ul className="space-y-0.5">
                        {g.links.map((l) => (
                          <li key={l.href}>
                            <Link
                              href={l.href}
                              onClick={close}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-ink-800 hover:text-white"
                            >
                              <span className="text-base leading-none" aria-hidden>{l.emoji}</span>
                              {l.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-ink-800 px-4 py-2 text-[11px] text-slate-500">
              <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">Esc</kbd> close ·{" "}
              <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">⌘K</kbd> open anywhere
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

// Trigger button. `variant="nav"` is the compact navbar form; `variant="hero"` is the
// prominent homepage form.
export function CommandLauncherButton({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const { open } = useCommandLauncher();

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-950/50 px-4 py-2.5 text-sm font-semibold text-slate-200 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/60 hover:text-white hover:shadow-glow"
      >
        <GridIcon />
        Explore all features
        <kbd className="ml-1 hidden rounded bg-ink-800/80 px-1.5 py-0.5 text-[10px] font-sans text-slate-400 sm:inline">⌘K</kbd>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Explore all features (Command/Ctrl K)"
      title="Explore — ⌘K"
      className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-ink-800 hover:text-white sm:px-2.5"
    >
      <GridIcon />
      <span className="hidden lg:inline">Explore</span>
    </button>
  );
}
