"use client";

import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Prominent market chooser for the homepage hero — pill toggle of 🇦🇺/🇳🇿/🇺🇸 that
// switches all prices + store lists. Mirrors the compact navbar switcher.
export function CountryHeroToggle() {
  const { country, setCountry } = useCountry();
  if (!INTL_ENABLED) return null;

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Shopping from</span>
      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-ink-700 bg-ink-950/60 p-1.5 backdrop-blur">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
                active
                  ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow"
                  : "text-slate-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span>{c.label}</span>
              <span className={`text-[10px] ${active ? "text-white/80" : "text-slate-500"}`}>{c.currency}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
