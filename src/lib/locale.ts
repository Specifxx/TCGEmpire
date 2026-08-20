// The UI-CHROME language — nav, footer, mega-menu/⌘K launcher, and the handful
// of generic microcopy strings that repeat across every page (buy-button
// labels, in-stock/out-of-stock, the watchlist button, the search
// placeholder). Deliberately NOT a full site translation: card names, prices,
// store names, and every page's own prose (articles, FAQs, region-page hero
// copy) stay English everywhere, including on /de — see DECISIONS.md-style
// reasoning in LocaleProvider.tsx for why this is scoped this way.
export type Locale = "en" | "de";

export const LOCALE_COOKIE = "rc_locale";

// Only ever offered to a Germany-market visitor (see LocaleProvider) — there is
// no English-speaking-Germany vs German-speaking-elsewhere distinction to make
// here, so a flat two-value type is enough. Extend this (and the dictionaries
// in components that consume it) the day a second non-English market wants a
// toggle of its own.
export const LOCALES: Locale[] = ["en", "de"];
