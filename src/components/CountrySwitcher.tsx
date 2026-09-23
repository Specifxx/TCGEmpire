"use client";

import { useRef, useState } from "react";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useDismiss } from "@/lib/use-dismiss";
import { useCountry } from "./CountryProvider";

// Market chooser: 🇦🇺 Australia / 🇺🇸 United States / 🇬🇧 United Kingdom / 🇸🇬
// Singapore / 🇨🇦 Canada. Switching reloads prices + store lists for the chosen
// country and persists via cookie. Hidden entirely while INTL_ENABLED is off
// (the site is US-only then).
export function CountrySwitcher({ className = "" }: { className?: string }) {
  const { country, setCountry, isEurDisplay, setEurDisplay } = useCountry();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = COUNTRY_LIST.find((c) => c.code === country) ?? COUNTRY_LIST[0];

  // Outside click, Escape (refocusing this trigger) and focus leaving the
  // wrapper all close the panel — see use-dismiss.ts. Above the early return
  // below, per the rules of hooks.
  useDismiss(ref, open, () => setOpen(false));

  if (!INTL_ENABLED) return null;

  return (
    // data-region-control: paired with CountryHeroToggle's "hero" tag — see
    // that component's own doc comment. scripts/homepage-audit.mjs uses this
    // to assert at most one region selector is visible above the fold at a
    // time (the desktop scroll-gate this control's sibling search box gets
    // via HeaderSearchSlot has no equivalent here, since the header's region
    // switcher was never a duplicate of the hero's — it's a compact icon+code
    // button, not a six-button strip — but the tag exists either way so the
    // audit measures reality instead of assuming it).
    <div ref={ref} data-region-control="nav" className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        // The accessible name must CONTAIN the visible text ("US"), or a
        // voice-control user saying what they can see doesn't activate it —
        // axe's label-content-name-mismatch. Leading with the action keeps the
        // label useful when read aloud on its own.
        aria-label={`Change market — currently ${current.code}, ${current.label}`}
        aria-expanded={open}
        // `min-w-11` below sm is load-bearing: dropping the chevron there (see
        // below) took this control to 38px wide, under the site's own 44px tap
        // floor. The floor is a width AND a height rule; min-h-11 only covered
        // half of it, and nothing had needed the other half while the chevron
        // was padding it out.
        //
        // `sm:[@media(pointer:fine)]:min-h-0`, not `sm:min-h-0` (2026-09-23).
        // The 38px height from sm with a MOUSE is deliberate (DECISIONS.md,
        // 2026-09-18 and 2026-09-19: "so desktop rows stay 36px tall"), but a
        // bare sm:min-h-0 is a responsive utility emitted after globals.css's
        // coarse `.min-h-11 {min-height:48px}`, so it cancelled the touch floor
        // too: 87x38 at 768, 844x390 and 1024 on touch, beside 48px
        // neighbours. Scoped to a fine pointer, touch at >=sm keeps 48px.
        // `border-transparent` below sm: in the phone icon row this was the
        // only control with a visible outline (44x48 beside the borderless
        // 48x48 account and menu icons, worse in the light theme). The border
        // stays for the box model and turns ink-700 from sm.
        className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-transparent px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white sm:min-w-0 sm:justify-start sm:gap-1.5 sm:border-ink-700 sm:px-2.5 sm:[@media(pointer:fine)]:min-h-0"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.code}{isEurDisplay && " · €"}</span>
        {/* Chevron hidden below sm. The flag alone already reads as "tap to
            change market", the whole control is one button either way, and this
            is ~14px of the budget that putting "Premium" back as text needed on
            a phone. From sm up it returns alongside the country code. */}
        <svg className={`hidden h-3.5 w-3.5 transition-transform sm:block ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* OPAQUE AND SCROLLABLE (2026-09-23). It was bg-ink-850/95 with
          backdrop-blur, which let the hero H1 ghost through in both themes, and
          it had no max-height: at 844x390 it spanned y=57-408, cutting the EU
          row by 13px and putting UK's "Show UK prices in…" row off-screen with
          no way to reach it (it lives in the sticky header, so the page cannot
          scroll it into view). 4.5rem leaves the header row plus the gap. */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[calc(100dvh-4.5rem)] w-52 overflow-y-auto overscroll-contain rounded-xl border border-ink-700 bg-ink-850 p-1 shadow-2xl">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Shop & prices for
          </div>
          {COUNTRY_LIST.map((c) => (
            <button
              key={c.code}
              // The check mark below has no text alternative, so the selected
              // market is announced through aria-current instead.
              aria-current={c.code === country || undefined}
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
                <div className="text-xs text-slate-500">
                  Prices in {c.code === "UK" && c.code === country && isEurDisplay ? "EUR (converted)" : c.currency}
                </div>
              </div>
              {c.code === country && (
                <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
          {/* UK's real stores are always GBP — an EU visitor sees them converted to
              EUR by default (see CountryProvider), but can flip back, and a genuine
              UK visitor who somehow landed on EUR can flip back to the real GBP. */}
          {country === "UK" && (
            <button
              onClick={() => setEurDisplay(!isEurDisplay)}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg border-t border-ink-800 px-3 py-2 pt-2.5 text-left text-xs text-slate-400 hover:bg-ink-800 hover:text-white"
            >
              Show UK prices in {isEurDisplay ? "GBP (real price)" : "EUR instead"} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
