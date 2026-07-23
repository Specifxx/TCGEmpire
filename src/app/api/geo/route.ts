import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { COUNTRIES, isEuIso, normalizeCountry } from "@/lib/country";

// Geo-detection endpoint for first-time visitors (no country cookie yet).
//
// The server render path no longer reads the x-vercel-ip-country header (a
// headers() read in the layout used to force every route dynamic, killing
// ISR). Instead CountryProvider calls this once after mount when no cookie
// exists, so an NZ/US/UK first-timer still lands on their local market. This
// route being dynamic is fine — route handlers don't affect page caching.
export const dynamic = "force-dynamic";

export async function GET() {
  const raw = headers().get("x-vercel-ip-country");
  const country = normalizeCountry(raw);
  // An EU visitor geo-defaults into the UK market (real GBP stores) but should see
  // EUR by default — see get-country.ts's getDisplayCurrency for the full story.
  const currency = country === "UK" && isEuIso(raw) ? "EUR" : COUNTRIES[country].currency;
  return NextResponse.json(
    { country, currency },
    // Private per-visitor result; let the browser reuse it for the session.
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
