// Server-only: resolve the visitor's market. Importing next/headers makes this
// module server-only (it errors if pulled into a client bundle), which is why it's
// split out from the pure country.ts.
//
// Resolution order:
//   1. Explicit choice — the `country` cookie set by the switcher.
//   2. Geo default — Vercel's `x-vercel-ip-country` header (NZ → NZ, US → US).
//   3. Australia, for everyone else (and locally, where there's no geo header).
import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE, COUNTRY_LIST, DEFAULT_COUNTRY, INTL_ENABLED, normalizeCountry, type Country } from "./country";

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
