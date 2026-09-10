import { NextResponse } from "next/server";
import { DEFAULT_COUNTRY, normalizeCountry, COUNTRIES } from "@/lib/country";
import { getCachedTopDeals } from "@/lib/top-deals";

export const dynamic = "force-dynamic";

// Live value-proof numbers for the Premium upsell surfaces (the slide-in's
// "Deal Finder is showing N deals worth $X right now" line, the /premium proof
// strip) — a small public JSON endpoint rather than a server component so the
// CLIENT slide-in can fetch it lazily, only once it's actually about to show
// (never on mount — see PremiumSlideIn.tsx). Backed entirely by the SAME 1h
// unstable_cache the homepage already reads (getCachedTopDeals), so this adds
// no per-request DB work beyond what the homepage already pays for.
//
// No auth, no PII, no user-specific data — just the same numbers every visitor
// in that market already sees (or could see) on the homepage's Top Deals
// column, so there is nothing here to leak.
export async function GET(req: Request) {
  const headers = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
  try {
    // normalizeCountry() always resolves to a real, live Country (falls back to
    // DEFAULT_COUNTRY for anything it doesn't recognise), so no separate
    // membership check is needed on top of it.
    const raw = new URL(req.url).searchParams.get("country");
    const country = raw ? normalizeCountry(raw) : DEFAULT_COUNTRY;
    const deals = await getCachedTopDeals(country);
    return NextResponse.json(
      {
        deals: deals.savingsVsMarketTotal,
        savingsCents: deals.savingsVsMarketCents ?? 0,
        currency: COUNTRIES[country].currency,
      },
      { headers }
    );
  } catch {
    // Never let a proof-line fetch surface an error — the caller treats a
    // failed/empty response as "don't show the line" (see PremiumSlideIn.tsx).
    return NextResponse.json({ deals: 0, savingsCents: 0, currency: "USD" }, { headers });
  }
}
