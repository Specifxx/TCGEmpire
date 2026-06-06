// Server-only: resolve the visitor's market. Importing next/headers makes this
// module server-only (it errors if pulled into a client bundle), which is why it's
// split out from the pure country.ts.
//
// Resolution order:
//   1. Explicit choice — the `country` cookie set by the switcher.
//   2. Geo default — Vercel's `x-vercel-ip-country` header (NZ → NZ, US → US).
//   3. Australia, for everyone else (and locally, where there's no geo header).
import { cookies, headers } from "next/headers";
import { COUNTRY_COOKIE, INTL_ENABLED, normalizeCountry, type Country } from "./country";

export function getCountry(): Country {
  if (!INTL_ENABLED) return "AU";
  const chosen = cookies().get(COUNTRY_COOKIE)?.value;
  if (chosen) return normalizeCountry(chosen);
  return normalizeCountry(headers().get("x-vercel-ip-country"));
}
