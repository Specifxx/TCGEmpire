"use client";

import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Prominent market chooser for the homepage hero — pill toggle of 🇦🇺/🇳🇿/🇺🇸 that
// switches all prices + store lists. Mirrors the compact navbar switcher.
export function CountryHeroToggle() {
  const { country, setCountry } = useCountry();
  if (!INTL_ENABLED) return null;

  return (
    <div className="mt-5 flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Shopping from</span>
      {/* Compact segmented control: flag + country code, currency only on the active
          one. Stays a single tight row even with 4+ markets on a phone. */}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-ink-700 bg-ink-950/60 p-1 backdrop-blur">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-label={`${c.label} (${c.currency})`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-all ${
                active
                  ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow"
                  : "text-slate-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span>{c.code}</span>
              {active && <span className="text-[10px] font-medium text-white/80">{c.currency}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
