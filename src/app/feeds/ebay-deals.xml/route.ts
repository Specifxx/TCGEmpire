import { getCheapestOnEbayPage } from "@/lib/arbitrage";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { EBAY_FEED_SIZE, buildEbayDealsFeed } from "@/lib/ebay-deals-feed";
import { SITE_URL } from "@/lib/site";

// RSS of the Deal Finder's free "Cheapest on eBay" tab, ?market=AU|UK|… (US by
// default). lib/ebay-deals-feed.ts says what it carries and why it links to our
// card pages. A plain function on Vercel caches only through its CDN header, so
// the header holds each market's feed six hours (CLAUDE.md); the one read per
// miss is getCheapestOnEbayPage's narrow card select over day-cached rankings.
export const dynamic = "force-dynamic";

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const page = await getCheapestOnEbayPage(market, 1, EBAY_FEED_SIZE);
  return new Response(buildEbayDealsFeed(SITE_URL, market, page.items), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
