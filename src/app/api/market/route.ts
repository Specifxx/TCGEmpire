import { NextResponse } from "next/server";
import { COUNTRIES, COUNTRY_COOKIE, COUNTRY_LIST, INTL_ENABLED, type Country } from "@/lib/country";
import { sanitizeNextPath } from "@/lib/next-param";

// GET /api/market?m=UK&to=/card/<slug>?utm_… — open a same-origin page IN A
// GIVEN MARKET. Sets the `country` cookie (the same one the switcher writes and
// getCountry()/CountryProvider read) and 307s to `to`.
//
// Why a route and not ?market= on the page: card pages are ISR
// (revalidate = 86400) and deliberately take no searchParams — reading one
// makes the page dynamic and every hit a database round trip. Price-alert
// emails link a UK watcher's card through here, so the page shows the UK
// stores and prices the email quoted even on a device with no cookie yet.
//
// No database, no session. `to` must be a same-origin, non-API path
// (sanitizeNextPath); anything else goes home. An unknown market is ignored.
export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function GET(req: Request) {
  const url = new URL(req.url);
  const to = sanitizeNextPath(url.searchParams.get("to")) ?? "/";
  const m = (url.searchParams.get("m") ?? "").toUpperCase();
  const res = NextResponse.redirect(new URL(to, url.origin), 307);
  res.headers.set("Cache-Control", "no-store");
  const live = INTL_ENABLED && Object.prototype.hasOwnProperty.call(COUNTRIES, m) && COUNTRY_LIST.some((c) => c.code === m);
  if (live) {
    // Not httpOnly: CountryProvider reads it client-side, like the switcher's own.
    res.cookies.set(COUNTRY_COOKIE, m as Country, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }
  return res;
}
