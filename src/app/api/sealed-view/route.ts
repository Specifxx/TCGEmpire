import { normalizeCountry } from "@/lib/country";
import { buildSealedView, SEALED_PARAM_KEYS, type SealedParams } from "@/lib/sealed-view";

// The /sealed page's grid for one market (2026-11-05, DECISIONS.md "The sealed page
// becomes one CDN copy per URL"). The page's HTML carries the baseline market; the
// island (components/SealedMarketBoard.tsx) fetches this for a visitor in another
// market, with the page's own filter query repeated. The same computation as the
// page (lib/sealed-view.ts), from the same cached loader; the CDN keeps each
// (market, query) answer six hours, a day stale, so a market's grid is one render
// per six hours however many visit. Reads no cookie, header or session.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = normalizeCountry(url.searchParams.get("market"));
  const sp: SealedParams = {};
  for (const k of SEALED_PARAM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) sp[k] = v;
  }
  const view = await buildSealedView(market, sp);
  return Response.json(view, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
