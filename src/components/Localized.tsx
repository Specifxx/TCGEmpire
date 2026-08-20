"use client";

import { useLocale } from "./LocaleProvider";

// Swaps a piece of CHROME text between English and German, for use inside
// server components (Navbar, FooterNav) that can't call useLocale()
// themselves — same "small client leaf inside otherwise server-rendered
// chrome" pattern as HeaderSearchSlot/HomeHeaderReveal. SSR always emits `en`
// (LocaleProvider's own pre-hydration default), so this never causes a
// hydration mismatch; the swap to German is a normal post-hydration update
// for a DE-market visitor who has (or defaults to) the German pick.
export function Localized({ en, de }: { en: string; de: string }) {
  const { locale } = useLocale();
  return <>{locale === "de" ? de : en}</>;
}
