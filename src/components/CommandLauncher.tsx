"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NAV_GROUPS } from "./nav-groups";
import { searchNav } from "./nav-search";

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

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // ⌘K / Ctrl+K toggles from anywhere; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key === "Escape") {
        setIsOpen(false);
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

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* The query lives in the overlay, NOT here. This provider wraps the whole
          app, so holding the search text in its state re-rendered every page on
          every keystroke. */}
      {isOpen && <LauncherOverlay onClose={close} />}
    </Ctx.Provider>
  );
}

function LauncherOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchNav(query), [query]);
  const searching = query.trim().length > 0;

  // A new query means a new result set — the highlight has to go back to the top
  // or Enter opens whatever happened to be at the old index.
  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!searching) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, searching]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[Math.min(active, results.length - 1)].href);
    }
  };

  // Unfiltered, the panel keeps its grouped grid — it is a site map, and the
  // grouping is the information. Once you type, it becomes one ranked list:
  // relevance ordering across groups is what a search result is, and a single
  // list is also the only thing arrow keys can traverse sensibly.
  const grouped = useMemo(() => {
    if (searching) return [];
    return NAV_GROUPS.map((g) => ({ title: g.title, links: g.links }));
  }, [searching]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Explore RiftCompare"
    >
      <button className="absolute inset-0 animate-fade-in bg-ink-950/80 backdrop-blur-md" aria-label="Close" onClick={onClose} />
      <div className="card-surface relative z-10 mt-[7vh] flex max-h-[82vh] w-full max-w-3xl animate-fade-up flex-col overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-ink-800 p-3">
          <GridIcon className="h-5 w-5 shrink-0 text-brand-400" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search features, tools, pages…"
            // focus-visible:ring-*: autoFocus puts real focus here the instant
            // the dialog opens, so the missing indicator was invisible in the
            // common case — but Shift+Tab back into this field (e.g. from the
            // results list, or after tabbing to the close/backdrop) landed on
            // it with zero visible focus state. Same ring treatment
            // CinematicNavMenu already uses for its own bare links.
            className="w-full rounded bg-transparent text-base text-slate-100 placeholder:text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Search RiftCompare features"
            role="combobox"
            aria-expanded
            aria-controls="launcher-results"
            aria-autocomplete="list"
          />
          {searching && (
            <span className="shrink-0 text-xs tabular-nums text-slate-500">
              {results.length} {results.length === 1 ? "result" : "results"}
            </span>
          )}
        </div>
        {/* Results */}
        <div className="overflow-y-auto p-4" id="launcher-results" ref={listRef}>
          {searching ? (
            results.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No features match &ldquo;{query}&rdquo;. This searches pages and tools — to look up a
                card, use the search box in the header.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {results.map((l, i) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={onClose}
                      data-active={i === active}
                      onMouseEnter={() => setActive(i)}
                      aria-current={i === active ? "true" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                        i === active ? "bg-ink-800 text-white" : "text-slate-200 hover:bg-ink-800 hover:text-white"
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden>{l.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{l.group}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.map((g) => (
                <div key={g.title}>
                  <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-brand-300">{g.title}</div>
                  <ul className="space-y-0.5">
                    {g.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={onClose}
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
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">↑↓</kbd> move ·{" "}
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">↵</kbd> open ·{" "}
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">Esc</kbd> close ·{" "}
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5 font-sans">⌘K</kbd> anywhere
        </div>
      </div>
    </div>
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
