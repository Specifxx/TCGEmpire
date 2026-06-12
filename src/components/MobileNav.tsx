"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { DISCORD_URL } from "@/lib/site";
import { useCountry } from "./CountryProvider";
import { NAV_GROUPS } from "./nav-groups";

// The phone menu (shown below the lg breakpoint). Organised, not a flat list:
// a compact one-row country picker, then labelled groups in a two-column grid —
// prices (the core product) first, then games, deck tools, and community. Each
// link carries an emoji so the eye can scan by icon, like an app launcher. The
// groups live in nav-groups.ts, shared with the desktop NavMenu.

// Hamburger menu so phone users can reach every section (the desktop links are
// hidden below the sm breakpoint).
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { country, setCountry } = useCountry();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-ink-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute right-2 top-14 z-50 max-h-[calc(100dvh-4.5rem)] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
            {/* Compact country picker — one row of pills instead of four tall rows. */}
            {INTL_ENABLED && (
              <div className="border-b border-ink-700 p-3">
                <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Shop &amp; prices for
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {COUNTRY_LIST.map((c) => {
                    const active = c.code === country;
                    return (
                      <button
                        key={c.code}
                        onClick={() => setCountry(c.code)}
                        aria-pressed={active}
                        aria-label={`${c.label} (${c.currency})`}
                        className={`flex flex-col items-center rounded-lg px-1 py-1.5 transition-colors ${
                          active
                            ? "bg-brand-500/20 ring-1 ring-brand-500/60"
                            : "bg-ink-800/60 hover:bg-ink-800"
                        }`}
                      >
                        <span className="text-base leading-none">{c.flag}</span>
                        <span className={`mt-0.5 text-xs font-bold ${active ? "text-brand-300" : "text-slate-300"}`}>{c.code}</span>
                        <span className="text-[9px] text-slate-500">{c.currency}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grouped links, two per row — scannable like an app launcher. */}
            <div className="space-y-3 p-3">
              {NAV_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {g.title}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-lg bg-ink-800/60 px-2.5 py-2.5 text-[13px] font-medium text-slate-200 transition-colors hover:bg-ink-800 hover:text-white"
                      >
                        <span className="text-base leading-none" aria-hidden>{l.emoji}</span>
                        <span className="truncate">{l.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Discord — the top-bar icon is hidden on the narrowest screens, so
                surface it here too. */}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 border-t border-ink-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-ink-800 hover:text-[#5865F2]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Join our Discord ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
