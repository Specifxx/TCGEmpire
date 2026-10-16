import { getCardListingsData } from "@/lib/public-api";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";

// Public per-store listing grid for one card — the full multi-vendor comparison
// table, not just the single lowest price /api/v1/card/[id]/prices.json gives.
// The query + response shape live in lib/public-api.ts's getCardListingsData. Six
// hours, at the CDN too (an hour until 2026-10-14, DECISIONS.md, "Cached pages
// refresh every 6 to 24 hours", 2026-10-14); it reads ?market, so the header is
// its only cache.
export const revalidate = 21600;

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const body = await getCardListingsData(params.id, market);

  if (!body) {
    return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }

  return Response.json(body, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
