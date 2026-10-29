import { cachedEbayPicks, defaultPicksSet } from "@/components/EbayPicks";
import { cachedTcgPicks } from "@/components/TcgplayerPicks";
import { setByCode } from "@/lib/constants";

// The small eBay + TCGplayer pair (components/MiniPicks.tsx): a set's chase
// cards with their cheapest eBay listing per market and TCGplayer's market
// price, from the same day-long caches as EbayPicks and TcgplayerPicks. The
// client fetches it so the card page, the quick views and the footer stay
// free of new server reads; the CDN keeps each set's answer six hours.
export const dynamic = "force-dynamic";

const LIMIT = 10;

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("set") ?? "";
  const code = setByCode(asked) ? asked : defaultPicksSet();
  const [ebay, tcg] = await Promise.all([cachedEbayPicks(code, LIMIT).catch(() => []), cachedTcgPicks(code, LIMIT).catch(() => [])]);
  return Response.json(
    { set: code, ebay, tcg },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}
