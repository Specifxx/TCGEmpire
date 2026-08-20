"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, COUNTRY_COOKIE, DEFAULT_COUNTRY, EUR_DISPLAY_COOKIE, INTL_ENABLED, normalizeCountry, pickPrice, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { gbpCentsToEur } from "@/lib/fx";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";

type PricedCard = { lowestPriceCents: number | null; lowestPriceCentsUs?: number | null; lowestPriceCentsUk?: number | null; lowestPriceCentsCa?: number | null; lowestPriceCentsSg?: number | null };

interface CountryCtx {
  country: Country;
  setCountry: (c: Country) => void;
  // The DISPLAY currency — usually the market's native currency, but an EU
  // visitor browsing the UK market (real GBP stores) sees "EUR" here instead.
  // Never a second market: `price()` still returns the real GBP cents; `fmt()`
  // is what converts them for display.
  currency: string;
  // True when `currency` differs from the UK market's real currency (GBP) — i.e.
  // we're showing a converted reference figure, not the real transactional price.
  isEurDisplay: boolean;
  // Explicit override for the UK market's display currency (does nothing outside
  // the UK market) — lets a mis-detected genuine UK visitor switch back to GBP,
  // or a EU visitor who landed on GBP switch to EUR, without changing `country`.
  setEurDisplay: (eur: boolean) => void;
  // Format integer cents (in the market's REAL/native currency) in the display
  // currency — converts GBP → EUR first when isEurDisplay is true.
  fmt: (cents: number) => string;
  // The real native-currency figure as a small reference string (e.g. "≈ £4.20"),
  // for when fmt() above is showing a converted price — null otherwise.
  secondaryFmt: (cents: number) => string | null;
  // Pick the effective lowest price for the current market from a card.
  price: (card: PricedCard) => number | null;
}

const Ctx = createContext<CountryCtx | null>(null);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// localStorage mirror of the two cookies above. The cookie stays authoritative
// — it's what getCountry()/getDisplayCurrency() read server-side, which is the
// whole reason this is cookie-based rather than localStorage-based in the
// first place (see the reconcile effect below: a dynamic per-request cookie
// read was deliberately removed from the shared chrome because it killed ISR;
// localStorage can never be read server-side at all, so it could never replace
// the cookie without reintroducing that same problem). This mirror exists so
// the choice survives a cleared/blocked cookie (Safari ITP, a privacy
// extension, a user manually deleting cookies) without touching a device the
// visitor hasn't signed into — a plain client-side fallback, not a second
// source of truth. Wrapped in try/catch: private browsing and storage-disabled
// contexts throw on access, and this must never be why the page breaks.
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

// Every real write of a choice (as opposed to the localStorage->cookie
// backfill in the reconcile effect below, which only ever moves data the
// other direction) goes through both stores together so they can't drift.
function persist(name: string, value: string) {
  writeCookie(name, value);
  writeLocalStorage(name, value);
}

export function CountryProvider({ initial, children }: { initial: Country; children: React.ReactNode }) {
  // With the switcher disabled the site is single-market — lock it to
  // DEFAULT_COUNTRY regardless of any stale cookie.
  //
  // This MUST be the same constant the server's getCountry() falls back to. Both
  // said "AU" while DEFAULT_COUNTRY was "US", so flipping the switch would not
  // just have picked the wrong market — server and client would have picked it
  // together and silently, and any future divergence between the two literals
  // shows up as a hydration mismatch rather than an error anyone can read.
  const [country, setState] = useState<Country>(INTL_ENABLED ? initial : DEFAULT_COUNTRY);
  // The DISPLAY currency (see the CountryCtx doc comment) — defaults to the
  // initial country's native currency; reconciled below just like `country`.
  const [currency, setCurrency] = useState<string>(COUNTRIES[INTL_ENABLED ? initial : DEFAULT_COUNTRY].currency);
  const router = useRouter();
  // Shares the module-level /api/me fetch cache with NavUser/PremiumProvider —
  // this doesn't add a second request.
  const { user: meUser, loaded: meLoaded } = useMe();

  // Pages are server-rendered/cached with the AU default baked in (the shared
  // chrome deliberately no longer reads the country cookie — that dynamic read
  // used to force every route to render per-request, killing ISR). After
  // mount, reconcile with the real cookie so the selector and all
  // client-localised prices match the user's actual choice. Runs
  // post-hydration, so it can't cause a hydration mismatch. First-time
  // visitors with no cookie get one geo-detection fetch (/api/geo reads
  // Vercel's IP-country header) so AU/US/UK/SG/CA visitors still land on
  // their local market automatically — and an EU visitor outside those markets
  // lands on UK stores with EUR display (see the eur_display cookie below).
  useEffect(() => {
    if (!INTL_ENABLED) return; // AU-only: ignore any country cookie
    // Cookie first (server-authoritative); localStorage only covers a visitor
    // whose cookie was cleared/blocked but whose browser storage wasn't — and
    // when it does, backfill the cookie so the next server render agrees too.
    let cookieCountry = readCookie(COUNTRY_COOKIE);
    let cookieCurrency = readCookie(EUR_DISPLAY_COOKIE);
    if (!cookieCountry) {
      const lsCountry = readLocalStorage(COUNTRY_COOKIE);
      if (lsCountry) {
        cookieCountry = lsCountry;
        cookieCurrency = readLocalStorage(EUR_DISPLAY_COOKIE);
        writeCookie(COUNTRY_COOKIE, lsCountry);
        if (cookieCurrency) writeCookie(EUR_DISPLAY_COOKIE, cookieCurrency);
      }
    }
    if (cookieCountry) {
      const c = normalizeCountry(cookieCountry);
      if (c !== country) setState(c);
      if (c === "UK" && (cookieCurrency === "EUR" || cookieCurrency === "GBP")) {
        setCurrency(cookieCurrency);
        return;
      }
      if (c !== "UK") {
        setCurrency(COUNTRIES[c].currency);
        return;
      }
      // UK with no currency preference recorded yet — fall through to the geo
      // fetch below so an EU visitor's EUR default gets backfilled once.
    }
    let cancelled = false;
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.country) return;
        // A manual pick (setCountry, or the signed-in preferredCountry sync)
        // may have landed while this fetch was in flight — re-check the
        // cookie now rather than trusting the closure's stale `cookieCountry`,
        // so a slow geo response can't silently clobber a choice the visitor
        // already made (was overwriting country AND currency unconditionally
        // here, e.g. "picked US, geo resolves after and snaps it back to a
        // detected SG IP" — currency symbol flips to S$ under a US selection).
        if (readCookie(COUNTRY_COOKIE)) return;
        const geo = normalizeCountry(d.country);
        setState((prev) => (geo !== prev ? geo : prev));
        // Derive from the market registry rather than trusting d.currency
        // verbatim — one canonical mapping, not a second source of truth that
        // could drift from COUNTRIES if the API's own logic ever changes.
        const geoCurrency = geo === "UK" && d.currency === "EUR" ? "EUR" : COUNTRIES[geo].currency;
        setCurrency(geoCurrency);
        if (geo === "UK") persist(EUR_DISPLAY_COOKIE, geoCurrency === "EUR" ? "EUR" : "GBP");
        // Backfill the country cookie so the next server-rendered page load
        // (no client JS needed) already agrees, and so a second in-flight
        // effect (e.g. a fast remount) won't re-apply a stale geo guess.
        persist(COUNTRY_COOKIE, geo);
      })
      .catch(() => {
        /* geo is best-effort — the AU default stands */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed-in accounts remember their market (User.preferredCountry) —
  // authoritative over the cookie/geo-detect resolution above, since it
  // survives across devices and doesn't depend on IP-geo detection staying
  // accurate (see get-country.ts's caveat on that header). Runs once /api/me
  // resolves, so it may briefly show the cookie/geo guess first and then
  // correct itself — same pattern as the geo-fetch above.
  useEffect(() => {
    if (!INTL_ENABLED || !meLoaded || !meUser) return;
    if (meUser.preferredCountry) {
      const c = normalizeCountry(meUser.preferredCountry);
      setState((prev) => (c !== prev ? c : prev));
      if (c !== "UK") setCurrency(COUNTRIES[c].currency);
      persist(COUNTRY_COOKIE, c);
    } else {
      // First time this signed-in account has been seen — persist whatever
      // market it's currently resolved to (cookie or geo-detected) so it's
      // remembered from here on, without waiting for an explicit switcher pick.
      fetch("/api/account/country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      }).catch(() => {
        /* best-effort backfill */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoaded, meUser?.preferredCountry]);

  const setCountry = useCallback(
    (c: Country) => {
      if (!INTL_ENABLED || c === country) return;
      // Every region control in the app (CountryHeroToggle, RegionToggle, the
      // navbar's CountrySwitcher, the marketplace's inline pickers) shares this
      // one callback — there is no separate "region changed" code path per
      // component, so firing the event here covers all of them at once. This
      // deliberately does NOT fire for the silent auto-detect/account-restore
      // paths above (the geo-fetch effect and the signed-in preferredCountry
      // effect both call setState directly, bypassing setCountry) — those are
      // the page choosing a starting market for a visitor who hasn't acted
      // yet, not the visitor changing anything. `region_changed` should mean
      // "a person clicked a market", which is exactly what reaches this line.
      trackEvent("region_changed", { from: country, to: c });
      setState(c);
      // A deliberate switcher pick always uses that market's real currency —
      // no surprise EUR conversion for someone who just explicitly chose UK.
      setCurrency(COUNTRIES[c].currency);
      // 1-year cookies so the choice persists; server components read them via
      // getCountry()/getDisplayCurrency(). Mirrored to localStorage too (see
      // persist() above).
      persist(COUNTRY_COOKIE, c);
      persist(EUR_DISPLAY_COOKIE, "GBP");
      // Signed in? Remember this choice on the account too, so it follows the
      // user to their next device/session instead of just this browser's cookie.
      if (meUser) {
        fetch("/api/account/country", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: c }),
        }).catch(() => {
          /* best-effort */
        });
      }
      // Re-render server components (prices, store lists) for the new market.
      router.refresh();
    },
    [country, router, meUser]
  );

  const setEurDisplay = useCallback(
    (eur: boolean) => {
      if (country !== "UK") return;
      const next = eur ? "EUR" : "GBP";
      setCurrency(next);
      persist(EUR_DISPLAY_COOKIE, next);
      router.refresh();
    },
    [country, router]
  );

  const isEurDisplay = country === "UK" && currency === "EUR";
  const fmt = useCallback(
    (cents: number) => formatMoney(isEurDisplay ? gbpCentsToEur(cents) : cents, currency),
    [currency, isEurDisplay]
  );
  const secondaryFmt = useCallback((cents: number) => (isEurDisplay ? formatMoney(cents, "GBP") : null), [isEurDisplay]);
  const price = useCallback((card: PricedCard) => pickPrice(card, country), [country]);

  return <Ctx.Provider value={{ country, setCountry, currency, isEurDisplay, setEurDisplay, fmt, secondaryFmt, price }}>{children}</Ctx.Provider>;
}

export function useCountry(): CountryCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCountry must be used within <CountryProvider>");
  return ctx;
}
