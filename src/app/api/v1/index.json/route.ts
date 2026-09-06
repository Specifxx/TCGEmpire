import { getMarketIndex } from "@/lib/market-index";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { SITE_URL } from "@/lib/site";

// Public, machine-readable RiftCompare Index — the citable JSON an AI agent or a
// third-party dashboard can consume without scraping the page. Referenced as the
// Dataset `distribution` on /market and from llms.txt.
// `?market=AU|US|UK|SG|CA|EU`, defaults to US.
export const revalidate = 1800;

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  // Registry-driven so a new market can't silently fall through to the default.
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const index = await getMarketIndex(market).catch(() => null);

  // Sparse history (a brand-new market, or the index hasn't accumulated enough
  // days yet) used to be a 503 — a hard failure that reads as "this endpoint is
  // broken" to an agent that only checked llms.txt, which advertises this URL
  // unconditionally. It's a real, expected, temporary state, not an error: 200
  // with an explicit status field, so a caller can tell "not ready yet" from
  // "this URL doesn't work" without guessing from the HTTP status alone.
  if (!index) {
    return Response.json(
      {
        status: "warming",
        name: "The RiftCompare Index",
        market,
        asOf: new Date().toISOString(),
        entries: [],
        message: "Not enough price history for this market yet — check back soon.",
        source: `${SITE_URL}/market`,
      },
      {
        headers: {
          "X-Robots-Tag": "noindex",
          // Short TTL: unlike the ready payload below, this state is expected to
          // resolve on its own as history accumulates, so callers should recheck
          // sooner than the normal 30-minute index cache.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const body = {
    status: "ready",
    name: "The RiftCompare Index",
    description:
      "A search-weighted price index of the most-searched Riftbound: League of Legends TCG singles (base 100), updated weekly.",
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
    methodology: `${SITE_URL}/guides/understanding-the-riftcompare-index-methodology`,
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
