"use client";

import { useRouter, usePathname } from "next/navigation";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { REGION_HOME_PATH } from "@/lib/seo";
import { useCountry } from "./CountryProvider";
import { Flag } from "./Flag";

// Market chooser for the homepage hero — pill toggle of AU/US/UK/SG/CA/EU
// that switches all prices + store lists. Mirrors the compact navbar switcher.
// PROMINENT WITH FLAGS (owner, 2026-11-02: "the region switcher must be more
// prevalent … on the main home page hero … and have the flags as well"). It
// was deliberately quiet (9px label, slate-500 chips, no flags) and sat last
// in the hero, under the Premium link; it now sits right under the search and
// stats line, each chip carries its drawn flag (Flag.tsx, inline SVG — not
// the emoji, which Windows draws as the letters "AU"), and the active chip
// has a brand outline. Still smaller than the search box: it is not a CTA.
//
// RESTORED (2026-08-17) to this horizontal strip, overriding a same-day
// redesign that had collapsed it into a single "Shopping from: US" trigger +
// dropdown: direct owner feedback was the dropdown itself rendered visibly
// see-through over the page content behind it (bg-ink-850/95 + backdrop-blur
// wasn't opaque enough against a bright card thumbnail), and — separately —
// a same-row-of-buttons UI is just the preferred, more scannable design.
// Keeps that redesign's one real, independent improvement though: UNLIKE
// CountrySwitcher (the navbar one), this toggle only ever appears on the
// homepage / region home pages, so a pick here ALSO navigates to that
// market's own crawlable URL (REGION_HOME_PATH — "/" for US, "/au" etc.
// otherwise), not just a client-side cookie mutation. CountrySwitcher stays
// URL-stable on purpose: switching market on a card/browse/set page must
// re-price that SAME page, not navigate away from it. No separate analytics
// call here — CountryProvider's setCountry() is the one shared choke point
// every region control (this one, CountrySwitcher, the marketplace pickers)
// already funnels through, and it fires `region_changed` itself; a second
// event here would just double-count every hero-triggered switch.
export function CountryHeroToggle() {
  const { country, setCountry, currency } = useCountry();
  const router = useRouter();
  const pathname = usePathname();
  if (!INTL_ENABLED) return null;

  return (
    // data-region-control: scripts/homepage-audit.mjs's selector for "how many
    // distinct region selectors are visible above the fold at once" — the hero
    // and the header's own CountrySwitcher both carry this tag (a different
    // value each) so the audit can assert at most one is visible above the
    // fold at a time rather than guessing from class names.
    <div data-region-control="hero" className="mt-5 flex flex-col items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shopping from</span>
      {/* Segmented control: flag + code per chip (the flag is a drawn SVG,
          aria-hidden, so it never duplicates the code the way the emoji's
          "AU" letters did), currency shown only on the active chip. Three by two on
          phones (six flags and codes don't fit one 360px row), one row from sm;
          min-h-11 keeps each chip's tap target accessible. */}
      <div className="grid max-w-full grid-cols-3 gap-1 rounded-2xl border border-ink-700 bg-ink-900/60 p-1 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:rounded-full">
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
              onClick={() => {
                // setCountry() is the one shared choke point (see the file
                // header) — it already fires `region_changed` and no-ops when
                // c.code === country, so this only needs to navigate, since
                // this control alone represents a real, crawlable per-market URL.
                setCountry(c.code);
                const target = REGION_HOME_PATH[c.code];
                if (target !== pathname) router.push(target);
              }}
              aria-pressed={active}
              aria-labelledby={active ? `${codeId} ${currencyId} ${descId}` : `${codeId} ${descId}`}
              // min-w-11 alongside the existing min-h-11: measured a 2-letter
              // inactive chip ("SG", no currency suffix shown) at ~37px wide on
              // a real 390px viewport — under the 44px mobile tap-target floor
              // even though the height was already covered.
              className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-colors ${
                active ? "border-brand-400/70 bg-ink-800 text-white" : "border-transparent text-slate-300 hover:bg-ink-800 hover:text-white"
              }`}
            >
              <Flag code={c.code} />
              <span id={codeId}>{c.code}</span>
              {active && (
                <span id={currencyId} className="text-[10px] font-medium text-slate-400">
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
