"use client";

import { useCountry } from "./CountryProvider";
import { useLocale } from "./LocaleProvider";

// Chrome-language toggle — English/German nav, footer and ⌘K labels. Rendered
// ONLY for a Germany-market visitor (see the `country !== "DE"` guard below):
// this is a facet of "Germany mode", not a site-wide language picker, so it
// never appears for any other market. Defaults to German the first time a
// visitor's market resolves to DE (see LocaleProvider); this is just the
// override.
//
// Deliberately a plain two-state pill, not a dropdown like CountrySwitcher —
// there are only ever two values, and a menu would be one extra click for a
// binary choice.
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { country } = useCountry();
  const { locale, setLocale } = useLocale();

  if (country !== "DE") return null;

  return (
    <div
      data-locale-control="nav"
      className={`flex items-center overflow-hidden rounded-lg border border-ink-700 text-sm font-medium ${className}`}
      role="group"
      aria-label="Chrome language"
    >
      <button
        onClick={() => setLocale("de")}
        aria-pressed={locale === "de"}
        className={`min-h-11 px-2.5 py-2 sm:min-h-0 ${locale === "de" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
      >
        DE
      </button>
      <button
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`min-h-11 px-2.5 py-2 sm:min-h-0 ${locale === "en" ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}
      >
        EN
      </button>
    </div>
  );
}
