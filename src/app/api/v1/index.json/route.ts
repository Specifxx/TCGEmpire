import { getMarketIndex, type MarketScope } from "@/lib/market-index";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";

// Public, machine-readable RiftCompare Index — the citable JSON an AI agent or a
// third-party dashboard can consume without scraping the page. Referenced as the
// Dataset `distribution` on /market and from llms.txt.
// `?market=AU|NZ|US|UK|SG|CA|GLOBAL`.
export const revalidate = 1800;

function parseMarket(v: string | null): MarketScope {
  const up = (v ?? "").toUpperCase();
  // Registry-driven so a new market can't silently fall through to GLOBAL.
  return up in COUNTRIES ? (up as MarketScope) : "GLOBAL";
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const index = await getMarketIndex(market).catch(() => null);

  if (!index) {
    return Response.json(
      { error: "index_unavailable", market },
      { status: 503, headers: { "X-Robots-Tag": "noindex" } }
    );
  }

  const body = {
    name: "The RiftCompare Index",
    description:
      "A daily search-weighted price index of the most-searched Riftbound: League of Legends TCG singles (base 100).",
    market: index.market,
    base: 100,
    startDay: index.startDay,
    level: index.latest,
    currency: index.currency,
    change: { d1: index.d1, d7: index.d7, d30: index.d30, sinceStart: index.sinceStart },
    stats: index.stats,
    constituents: index.constituents.map((c) => ({
      name: c.name,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      weightPct: c.weightPct,
      priceCents: c.priceCents,
      d7pct: c.d7pct,
      url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    })),
    source: `${SITE_URL}/market`,
    license: `${SITE_URL}/market#cite`,
    generatedAt: new Date().toISOString(),
  };

  return Response.json(body, {
    headers: {
      // Crawlable by agents, but never indexed as a page.
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
