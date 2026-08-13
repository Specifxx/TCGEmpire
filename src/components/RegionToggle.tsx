"use client";

import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Compact segmented market switcher for inline use on tool pages (arbitrage, value
// finder, etc.). Switching sets the country cookie and refreshes, so the server page
// re-runs its queries for the chosen market. Optional label; hidden when INTL is off.
export function RegionToggle({ label = "Market", className = "" }: { label?: string; className?: string }) {
  const { country, setCountry, currency } = useCountry();
  if (!INTL_ENABLED) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900 p-1">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          // aria-labelledby, not aria-label: see the comment on the equivalent
          // buttons in CountryHeroToggle for why a hand-written string kept
          // failing label-content-name-mismatch even when it started with the
          // right word.
          const flagId = `rt-${c.code}-flag`;
          const codeId = `rt-${c.code}-code`;
          const currencyId = `rt-${c.code}-currency`;
          const descId = `rt-${c.code}-desc`;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-labelledby={active ? `${flagId} ${codeId} ${currencyId} ${descId}` : `${flagId} ${codeId} ${descId}`}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors ${
                active ? "bg-brand-500 text-ink-950" : "text-slate-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <span id={flagId} className="text-base leading-none">{c.flag}</span>
              <span id={codeId}>{c.code}</span>
              {active && (
                <span id={currencyId} className="text-[10px] font-medium text-white/80">
                  {currency}
                </span>
              )}
              <span id={descId} className="sr-only">
                — {c.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
