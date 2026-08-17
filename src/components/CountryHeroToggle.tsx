"use client";

import { useEffect, useRef, useState } from "react";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Market chooser for the homepage hero.
//
// REBUILT for the homepage-redesign brief's audit phase: this used to render
// all six markets as permanently-visible pill buttons — a real "six-button
// strip competing for attention" (the exact shape the brief's own hero spec
// explicitly rules out: "Show it once, quietly... not as a six-button strip
// competing for attention"). It read as quiet because of its small type and
// low-contrast border, but six always-present tap targets is six always-
// present tap targets regardless of how they're styled — and it was the
// single largest contributor to the hero blowing the page's above-the-fold
// interactive-target budget (scripts/homepage-audit.mjs's "≤12, header
// included" hard target).
//
// Now: ONE labelled trigger showing the resolved default ("Shopping from:
// US · USD"), exactly the "labelled default, shown once" the brief asks for.
// Clicking it reveals the other five markets in a dropdown panel — the same
// disclosure-on-demand pattern CountrySwitcher (the header's own region
// control) already uses, so this isn't a new interaction model, just the
// hero adopting the one the rest of the site already settled on. The panel
// is a real DOM subtree that only mounts while open, so it costs nothing
// against the above-the-fold interactive-target count until a visitor
// actually asks for it.
export function CountryHeroToggle() {
  const { country, setCountry, currency } = useCountry();
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
    // data-region-control: scripts/homepage-audit.mjs's selector for "how many
    // distinct region selectors are visible above the fold at once" — the hero
    // and the header's own CountrySwitcher both carry this tag (a different
    // value each) so the audit can assert at most one is visible above the
    // fold at a time rather than guessing from class names.
    <div ref={ref} data-region-control="hero" className="relative mt-4">
      {/*
          aria-labelledby, not a hand-written aria-label: it concatenates the
          referenced elements' own visible text, in order, so the accessible
          name is built FROM what's on screen instead of a hand-written string
          that has to be kept in sync with it. This is the same fix the old
          per-country buttons needed (see git history) — a hand-written label
          starting with "Shopping from — currently US..." still failed
          label-content-name-mismatch because axe compares against the visible
          text run as actually concatenated in the DOM ("Shopping fromUSUSD",
          no separators), not just "starts with the same words".

          The Lighthouse/axe run in the redesign's final verification phase
          caught a residual instance of exactly that: the browser's own
          aria-labelledby name-computation algorithm inserts a normalizing
          space between each referenced id's text ("Shopping from US USD"),
          but there was no actual whitespace between this span and the next
          one in the DOM, so the *visible* text axe extracts read "Shopping
          fromUS USD" — one word glued together — which is never a substring
          of the space-separated accessible name. The `{" "}` immediately
          below is that missing separator, restoring the substring match.
          It's a text node, not a flex item, so Flexbox's own "whitespace-
          only text runs are not flex items" rule (CSS Flexbox §4) means it
          costs nothing visually — the `gap-1.5` on this button already
          supplies the real visual spacing regardless. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-labelledby="cht-trigger-eyebrow cht-trigger-code cht-trigger-currency cht-trigger-desc"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-ink-800 px-3 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-ink-700 hover:text-slate-300"
      >
        <span id="cht-trigger-eyebrow" className="text-[9px] font-medium uppercase tracking-wide text-slate-500">Shopping from</span>{" "}
        <span className="font-semibold text-slate-200">
          <span id="cht-trigger-code">{current.code}</span> <span id="cht-trigger-currency" className="text-slate-500">{currency}</span>
        </span>
        <span id="cht-trigger-desc" className="sr-only">— change market</span>
        <svg className={`h-3 w-3 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1.5 w-52 -translate-x-1/2 overflow-hidden rounded-xl border border-ink-700 bg-ink-850/95 p-1 text-left shadow-2xl backdrop-blur">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Shop &amp; prices for</div>
          {COUNTRY_LIST.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCountry(c.code);
                setOpen(false);
              }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-ink-800 ${
                c.code === country ? "bg-ink-800" : ""
              }`}
            >
              <span className="text-lg leading-none">{c.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{c.label}</div>
                <div className="text-xs text-slate-500">Prices in {c.currency}</div>
              </div>
              {c.code === country && (
                <svg className="h-4 w-4 shrink-0 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
