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

  // A transient build failure is a real, temporary state an agent should be able
  // to tell apart from "this URL is broken" — 200 + an explicit status, never a
  // 5xx for it.
  if (!cards) {
    return Response.json(
      { status: "warming", market, asOf: new Date().toISOString(), cards: [] },
      {
        headers: {
          "X-Robots-Tag": "noindex",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return Response.json(
    {
      status: "ready",
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
