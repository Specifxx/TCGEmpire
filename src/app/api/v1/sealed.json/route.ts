import { getSealedGroups } from "@/lib/sealed-import";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";

// Public sealed-product groups (booster boxes, packs, bundles, ...) for one
// market — thin serialization of the same getSealedGroups() the /sealed page
// itself renders from.
export const revalidate = 21600;

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const groups = await getSealedGroups(market).catch(() => []);

  return Response.json(
    {
      market,
      currency: COUNTRIES[market].currency,
      generatedAt: new Date().toISOString(),
      groups,
    },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
