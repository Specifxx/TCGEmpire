import { prisma } from "@/lib/db";
import { affiliateUrl } from "@/lib/affiliate";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

// Public per-store listing grid for one card — the full multi-vendor comparison
// table, not just the single lowest price /api/v1/card/[id]/prices.json gives.
// Reuses the exact query + enrichment (affiliateUrl, shippingPolicyUrl,
// effectiveShippingCents) and the pure computeMarket() ranking that the card
// page itself renders from, so this is a thin serialization of the same data
// a visitor sees, not a second implementation of it.
export const revalidate = 3600;

const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));

  const card = await prisma.card
    .findFirst({
      where: whereParam(params.id),
      select: {
        id: true,
        slug: true,
        name: true,
        retailerPrices: {
          orderBy: { priceCents: "asc" },
          select: {
            id: true, country: true, retailer: true, retailerName: true, priceCents: true,
            shippingCents: true, condition: true, isFoil: true, inStock: true, lastSeen: true, url: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!card) {
    return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }

  const pageUrl = `${SITE_URL}${cardHref(card)}`;
  const rows: MarketRow[] = card.retailerPrices.map((p) => ({
    id: p.id,
    country: p.country,
    retailer: p.retailer,
    retailerName: p.retailerName,
    priceCents: p.priceCents,
    ship: effectiveShippingCents(p.shippingCents),
    condition: p.condition,
    isFoil: p.isFoil,
    inStock: p.inStock,
    lastSeen: p.lastSeen.toISOString(),
    buyHref: affiliateUrl(p.url, p.retailer, pageUrl),
    policyUrl: shippingPolicyUrl(p.retailer),
  }));

  const view = computeMarket(rows, market);

  return Response.json(
    {
      name: card.name,
      market,
      currency: view.currency,
      storeCount: view.storeCount,
      hasEbay: view.hasEbay,
      // In stock, cheapest ITEM price first (ties broken by delivered cost) — each
      // row also carries `delivered` (priceCents + shipping) for a consumer that
      // wants to rank by total cost instead; see each row's own `ship`/`delivered`.
      listings: view.prices,
      outOfStock: view.outOfStock,
      source: pageUrl,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
