// Server-only: resolve the visitor's market. Importing next/headers makes this
// module server-only (it errors if pulled into a client bundle), which is why it's
// split out from the pure country.ts.
//
// Resolution order:
//   1. Explicit choice — the `country` cookie set by the switcher.
//   2. Geo default — Vercel's `x-vercel-ip-country` header (NZ → NZ, US → US).
//   3. Australia, for everyone else (and locally, where there's no geo header).
import { cookies, headers } from "next/headers";
import { COUNTRIES, COUNTRY_COOKIE, COUNTRY_LIST, DEFAULT_COUNTRY, EUR_DISPLAY_COOKIE, INTL_ENABLED, isEuIso, normalizeCountry, type Country } from "./country";

// Only ever resolve to a market that's actually live in the picker. A country can be
// fully plumbed (e.g. UK) but not yet launched — without this clamp a geo-detected GB
// visitor would land in an empty UK market they can't see in the switcher.
function liveOrDefault(c: Country): Country {
  return COUNTRY_LIST.some((x) => x.code === c) ? c : DEFAULT_COUNTRY;
}

export function getCountry(): Country {
  if (!INTL_ENABLED) return "AU";
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
