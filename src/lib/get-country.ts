// Server-only: resolve the visitor's market. Importing next/headers makes this
// module server-only (it errors if pulled into a client bundle), which is why it's
// split out from the pure country.ts.
//
// Resolution order:
//   1. Explicit choice — the `country` cookie set by the switcher.
//   2. Geo default — Vercel's `x-vercel-ip-country` header (AU → AU, NZ → NZ,
//      GB/EU → UK, SG → SG, CA → CA).
//   3. DEFAULT_COUNTRY (the United States) for everyone else — including any
//      undetected visitor and every local/preview request, where there is no geo
//      header at all.
//
// CAVEAT if the domain is ever routed through a reverse-proxy CDN in front of
// Vercel: Vercel derives x-vercel-ip-country from the IP of the connection it
// terminates, which would then be the proxy's edge, not the visitor's real IP —
// step 2 would stop reliably detecting anything and most visitors would
// silently fall through to step 3 (US). Not a concern while Vercel serves the
// domain directly, as it does now. Signed-in accounts have an extra layer of
// protection either way: they remember their real market on
// User.preferredCountry (see CountryProvider + POST /api/account/country), so
// a returning signed-in visitor lands correctly even on a first request before
// any geo/cookie signal is available.
//
// Step 3 said "Australia" until August 2026 and was wrong by then: country.ts had
// already moved DEFAULT_COUNTRY to US. A comment describing the opposite of what
// the code does is worse than none on the one module whose entire job is deciding
// which market — and therefore which currency and which stores — a visitor sees.
import { cookies, headers } from "next/headers";
import { COUNTRIES, COUNTRY_COOKIE, COUNTRY_LIST, DEFAULT_COUNTRY, EUR_DISPLAY_COOKIE, INTL_ENABLED, isEuIso, normalizeCountry, type Country } from "./country";

// Only ever resolve to a market that's actually live in the picker. A country can be
// fully plumbed (e.g. UK) but not yet launched — without this clamp a geo-detected GB
// visitor would land in an empty UK market they can't see in the switcher.
function liveOrDefault(c: Country): Country {
  return COUNTRY_LIST.some((x) => x.code === c) ? c : DEFAULT_COUNTRY;
}

export function getCountry(): Country {
  // The kill-switch collapses the site to ONE market. That market is
  // DEFAULT_COUNTRY, not a second hard-coded literal — this returned "AU" while
  // DEFAULT_COUNTRY was "US", so flipping the switch would silently have moved
  // every visitor to a market the rest of the app no longer treats as default.
  if (!INTL_ENABLED) return DEFAULT_COUNTRY;
  const chosen = cookies().get(COUNTRY_COOKIE)?.value;
  if (chosen) return liveOrDefault(normalizeCountry(chosen));
  return liveOrDefault(normalizeCountry(headers().get("x-vercel-ip-country")));
}

// The currency to DISPLAY prices in — distinct from `country` (which market's real,
// buyable inventory is shown). Only ever differs from the country's native currency
// for the UK market: an EU visitor browses the same real GBP store listings as a
// genuine UK visitor, but sees them converted to EUR by default (see lib/fx.ts's
// gbpCentsToEur — a reference conversion, never a second market or a real quote).
//
// Resolution order, mirroring getCountry(): an explicit switcher/preference cookie
// wins; otherwise infer from the geo header every request (so it self-corrects if
// the visitor's location changes, and works even before any cookie exists).
export function getDisplayCurrency(country?: Country): string {
  const c = country ?? getCountry();
  if (c !== "UK") return COUNTRIES[c].currency;
  const override = cookies().get(EUR_DISPLAY_COOKIE)?.value;
  if (override === "EUR" || override === "GBP") return override;
  return isEuIso(headers().get("x-vercel-ip-country")) ? "EUR" : "GBP";
}
