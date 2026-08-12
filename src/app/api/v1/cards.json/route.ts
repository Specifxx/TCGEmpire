import { getBulkCardSummary } from "@/lib/public-api";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";

// Public, whole-catalog price summary — built for sibling sites (riftboundstocks)
// and third-party dashboards that need every tracked card's latest price plus a
// few deltas without a database connection. See DATA_INTEGRATION.md in the
// riftboundstocks repo for the consumer side of this contract.
export const revalidate = 172800;

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const cards = await getBulkCardSummary(market).catch(() => null);

  if (!cards) {
    return Response.json(
      { error: "unavailable", market },
      { status: 503, headers: { "X-Robots-Tag": "noindex" } },
    );
  }

  return Response.json(
    {
      market,
      currency: COUNTRIES[market].currency,
      note: "priceCents is the lowest live in-stock listing per card. dNCents is the nearest available point to N days ago (null when the window doesn't reach that far back).",
      generatedAt: new Date().toISOString(),
      cards,
    },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
