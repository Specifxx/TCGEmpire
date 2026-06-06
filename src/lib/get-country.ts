// Server-only: read the selected market from the `country` cookie. Importing
// next/headers makes this module server-only (it errors if pulled into a client
// bundle), which is why it's split out from the pure country.ts.
import { cookies } from "next/headers";
import { COUNTRY_COOKIE, NZ_ENABLED, normalizeCountry, type Country } from "./country";

export function getCountry(): Country {
  // While NZ mode is disabled, the whole site is AU-only. Returning early (without
  // reading the cookie) also lets pages stay statically rendered / ISR.
  if (!NZ_ENABLED) return "AU";
  return normalizeCountry(cookies().get(COUNTRY_COOKIE)?.value);
}
