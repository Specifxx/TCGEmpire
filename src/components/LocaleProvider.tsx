"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/locale";
import { useCountry } from "./CountryProvider";
import { trackEvent } from "@/lib/analytics";

// German UI chrome — nav, footer, mega-menu/⌘K launcher, and the handful of
// generic microcopy strings that repeat on every page. Scoped deliberately
// narrow (see lib/locale.ts's header comment): everything else — card names,
// prices, store names, article/guide bodies, region-page hero copy — stays
// English on every market including /de, matching how this site has always
// worked. This is a toggle for the site's OWN words, not a translation of the
// product catalogue.
//
// ONLY EVER "de" WHEN THE VISITOR'S MARKET IS GERMANY. There is no
// English-in-Germany vs German-elsewhere distinction being made here — the
// language toggle is a facet of "Germany mode", not an independent global
// preference, so a visitor who switches their market away from DE loses the
// German chrome immediately (matches the language toggle's own visibility
// rule: it only ever appears for a DE-market visitor). The one thing that DOES
// persist across a country switch is the visitor's LAST German-mode pick, so a
// DE visitor who explicitly switched back to English chrome, wandered to
// another market and returned to DE, gets English again rather than being
// defaulted back to German every time — same "respect an explicit choice"
// rule CountryProvider itself follows for market/currency.
interface LocaleCtx {
  locale: Locale;
  // No-op outside the DE market — mirrors setCountry()'s own INTL_ENABLED/
  // same-value guard. The switcher that calls this is itself only rendered
  // for a DE-market visitor, so this guard is a backstop, not the only line
  // of defence.
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleCtx | null>(null);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Mirrors CountryProvider's own cookie+localStorage pair exactly (see that
// file's header comment for the full reasoning) — the cookie would be the
// server-authoritative copy IF a server component ever needed to read it, and
// the localStorage mirror survives a cleared/blocked cookie. Nothing here
// reads this cookie server-side today (every chrome string swap happens
// client-side via <Localized>, precisely so the root layout never has to call
// cookies() and lose ISR) — kept as a cookie anyway for parity/consistency
// with COUNTRY_COOKIE, and in case a future server-rendered surface needs it.
function readLocalStorage(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function writeLocalStorage(name: string, value: string) {
  try {
    window.localStorage.setItem(name, value);
  } catch {
    /* best-effort */
  }
}

function persist(value: Locale) {
  writeCookie(LOCALE_COOKIE, value);
  writeLocalStorage(LOCALE_COOKIE, value);
}

function readPreference(): Locale | null {
  const c = readCookie(LOCALE_COOKIE) ?? readLocalStorage(LOCALE_COOKIE);
  return c === "de" || c === "en" ? c : null;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { country } = useCountry();
  // Default preference the FIRST time a visitor's market resolves to DE with no
  // stored pick yet: German. Once they've made an explicit choice (either way),
  // that choice sticks for as long as they stay in the DE market.
  const [preference, setPreference] = useState<Locale>("de");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readPreference();
    if (stored) setPreference(stored);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (l: Locale) => {
      if (country !== "DE" || l === preference) return;
      trackEvent("locale_changed", { to: l });
      setPreference(l);
      persist(l);
    },
    [country, preference]
  );

  // SSR/pre-hydration output is always "en" (the same default every other
  // market gets) so the server-rendered markup a DE visitor's browser hydrates
  // against matches exactly — the swap to a stored/defaulted "de" happens as a
  // normal post-hydration state update, never a hydration mismatch. Outside
  // the DE market this is unconditionally "en", regardless of any stored
  // preference from a previous visit while the visitor WAS in Germany mode.
  const locale: Locale = country === "DE" && hydrated ? preference : "en";

  return <Ctx.Provider value={{ locale, setLocale }}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
