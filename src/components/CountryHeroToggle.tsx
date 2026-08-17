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
          // aria-labelledby, not aria-label: it concatenates the referenced
          // elements' own text, in this order, so the accessible name is built
          // FROM the visible "US"/"USD" text instead of a hand-written string
          // that has to be kept in sync with it. A hand-written aria-label
          // ("US — United States (USD)") still failed label-content-name-mismatch
          // even starting with "US", because axe compares against the visible
          // text run as actually concatenated in the DOM ("USUSD", no separator
          // between the two spans) — not just "starts with the same word".
          const codeId = `chc-${c.code}-code`;
          const currencyId = `chc-${c.code}-currency`;
          const descId = `chc-${c.code}-desc`;
          return (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              aria-pressed={active}
              aria-labelledby={active ? `${codeId} ${currencyId} ${descId}` : `${codeId} ${descId}`}
              // min-w-11 alongside the existing min-h-11: measured a 2-letter
              // inactive chip ("NZ", no currency suffix shown) at ~37px wide on
              // a real 390px viewport — under the 44px mobile tap-target floor
              // even though the height was already covered.
              className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-ink-800 text-slate-200"
                  : "text-slate-500 hover:bg-ink-900 hover:text-slate-300"
              }`}
            >
              <span id={codeId}>{c.code}</span>
              {active && (
                <span id={currencyId} className="text-[9px] font-medium text-slate-400">
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
