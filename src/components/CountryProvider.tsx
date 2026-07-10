"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_COOKIE, INTL_ENABLED, normalizeCountry, pickPrice, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";

type PricedCard = { lowestPriceCents: number | null; lowestPriceCentsNz?: number | null; lowestPriceCentsUs?: number | null; lowestPriceCentsUk?: number | null; lowestPriceCentsSg?: number | null };

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

  // Pages are server-rendered/cached with the AU default baked in (the shared
  // chrome deliberately no longer reads the country cookie — that dynamic read
  // used to force every route to render per-request, killing ISR). After
  // mount, reconcile with the real cookie so the selector and all
  // client-localised prices match the user's actual choice. Runs
  // post-hydration, so it can't cause a hydration mismatch. First-time
  // visitors with no cookie get one geo-detection fetch (/api/geo reads
  // Vercel's IP-country header) so NZ/US/UK visitors still land on their
  // local market automatically.
  useEffect(() => {
    if (!INTL_ENABLED) return; // AU-only: ignore any country cookie
    const m = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([^;]*)`));
    if (m) {
      const cookieCountry = normalizeCountry(decodeURIComponent(m[1]));
      if (cookieCountry !== country) setState(cookieCountry);
      return;
    }
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.country) {
          const geo = normalizeCountry(d.country);
          setState((prev) => (geo !== prev ? geo : prev));
        }
      })
      .catch(() => {
        /* geo is best-effort — the AU default stands */
      });
    return () => {
      cancelled = true;
    };
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
