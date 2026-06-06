"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_COOKIE, INTL_ENABLED, normalizeCountry, pickPrice, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";

type PricedCard = { lowestPriceCents: number | null; lowestPriceCentsNz?: number | null; lowestPriceCentsUs?: number | null };

interface CountryCtx {
  country: Country;
  setCountry: (c: Country) => void;
  currency: string;
  // Format integer cents in the current market's currency.
  fmt: (cents: number) => string;
  // Pick the effective lowest price for the current market from a card.
  price: (card: PricedCard) => number | null;
}

const Ctx = createContext<CountryCtx | null>(null);

export function CountryProvider({ initial, children }: { initial: Country; children: React.ReactNode }) {
  // While NZ is disabled the site is AU-only — lock it regardless of any stale cookie.
  const [country, setState] = useState<Country>(INTL_ENABLED ? initial : "AU");
  const router = useRouter();

  // Static pages (blog/guides) are prerendered at build time with the default
  // country baked in. After mount, reconcile with the real cookie so the selector
  // and any client prices match the user's actual choice. Runs post-hydration, so
  // it can't cause a hydration mismatch; no router.refresh (nothing server-rendered
  // here depends on it — dynamic pages already read the cookie server-side).
  useEffect(() => {
    if (!INTL_ENABLED) return; // AU-only: ignore any country cookie
    const m = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([^;]*)`));
    const cookieCountry = normalizeCountry(m ? decodeURIComponent(m[1]) : undefined);
    if (cookieCountry !== country) setState(cookieCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCountry = useCallback(
    (c: Country) => {
      if (!INTL_ENABLED || c === country) return;
      setState(c);
      // 1-year cookie so the choice persists; server components read it via getCountry().
      document.cookie = `${COUNTRY_COOKIE}=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Re-render server components (prices, store lists) for the new market.
      router.refresh();
    },
    [country, router]
  );

  const currency = COUNTRIES[country].currency;
  const fmt = useCallback((cents: number) => formatMoney(cents, currency), [currency]);
  const price = useCallback((card: PricedCard) => pickPrice(card, country), [country]);

  return <Ctx.Provider value={{ country, setCountry, currency, fmt, price }}>{children}</Ctx.Provider>;
}

export function useCountry(): CountryCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCountry must be used within <CountryProvider>");
  return ctx;
}
