"use client";

import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Market chooser for the homepage hero — pill toggle of 🇦🇺/🇳🇿/🇺🇸 that switches
// all prices + store lists. Mirrors the compact navbar switcher. Deliberately
// quiet (small type, low-contrast border, no filled active state) — it's a
// utility, not a CTA, and shouldn't compete with the search box or the
// hero's one primary button.
export function CountryHeroToggle() {
  const { country, setCountry, currency } = useCountry();
  if (!INTL_ENABLED) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Shopping from</span>
      {/* Compact segmented control: one label per chip (country code only — no
          flag glyph, since regional-indicator flag emoji render as literal
          "AU"/"NZ" text on several platforms, which duplicated the code right
          next to it), currency shown only on the active chip. Stays a single
          tight row even with 4+ markets on a phone; min-h-11 keeps each chip's
          tap target accessible despite the small type. */}
      <div className="inline-flex items-center gap-1 rounded-full border border-ink-800 p-0.5">
        {COUNTRY_LIST.map((c) => {
          const active = c.code === country;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-label={`${c.label} (${active ? currency : c.currency})`}
              className={`flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-ink-800 text-slate-200"
                  : "text-slate-500 hover:bg-ink-900 hover:text-slate-300"
              }`}
            >
              <span>{c.code}</span>
              {active && <span className="text-[9px] font-medium text-slate-400">{currency}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
