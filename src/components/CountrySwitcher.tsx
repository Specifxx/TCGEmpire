"use client";

import { useEffect, useRef, useState } from "react";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Market chooser: 🇦🇺 Australia (default) / 🇳🇿 New Zealand. Switching reloads
// prices + store lists for the chosen country and persists via cookie. Hidden while
// NZ mode is in development (the site is AU-only then).
export function CountrySwitcher({ className = "" }: { className?: string }) {
  const { country, setCountry } = useCountry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = COUNTRY_LIST.find((c) => c.code === country) ?? COUNTRY_LIST[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!INTL_ENABLED) return null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Country: ${current.label}. Change market`}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg border border-ink-700 px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white sm:gap-1.5 sm:px-2.5"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.code}</span>
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-ink-700 bg-ink-850/95 p-1 shadow-2xl backdrop-blur">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Shop &amp; prices for
          </div>
          {COUNTRY_LIST.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCountry(c.code);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-ink-800 ${
                c.code === country ? "bg-ink-800" : ""
              }`}
            >
              <span className="text-lg leading-none">{c.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{c.label}</div>
                <div className="text-xs text-slate-500">Prices in {c.currency}</div>
              </div>
              {c.code === country && (
                <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
