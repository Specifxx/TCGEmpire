import { normalizeCountry } from "@/lib/country";
import { GUIDE_QUERY_KEYS, type RawSearchParams } from "@/lib/price-guide-query";
import { buildPriceGuideView } from "@/lib/price-guide-view";

// The /price-guide page's view for one market (2026-11-05, DECISIONS.md "The
// price guide becomes one CDN copy per URL"). The page's HTML carries the
// baseline market; the island (components/price-guide/PriceGuideMarketBoard.tsx)
// fetches this for a visitor in another market, or for the UK market shown in
// euros (`cur=EUR`), with the page's own filter, sort and paging query repeated.
// The same computation as the page (lib/price-guide-view.ts), from the same
// cached catalogue; the CDN keeps each (market, query) answer six hours, a day
// stale. Reads no cookie, header or session.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = normalizeCountry(url.searchParams.get("market"));
  const sp: RawSearchParams = {};
  for (const k of GUIDE_QUERY_KEYS) {
    if (k === "market") continue;
    const v = url.searchParams.get(k);
    if (v !== null) sp[k] = v;
  }
  const view = await buildPriceGuideView(market, sp, { eurDisplay: url.searchParams.get("cur") === "EUR" });
  if (!view) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(view, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
