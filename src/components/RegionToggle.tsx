"use client";

import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Compact segmented market switcher for inline use on tool pages (arbitrage, value
// finder, etc.). Switching sets the country cookie and refreshes, so the server page
// re-runs its queries for the chosen market. Optional label; hidden when INTL is off.
export function RegionToggle({ label = "Market", className = "" }: { label?: string; className?: string }) {
  const { country, setCountry } = useCountry();
  if (!INTL_ENABLED) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900 p-1">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-label={`${c.label} (${c.currency})`}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors ${
                active ? "bg-brand-500 text-white" : "text-slate-300 hover:bg-ink-800 hover:text-white"
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
