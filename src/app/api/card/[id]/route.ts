import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { INTL_ENABLED } from "@/lib/country";
import { getCountry } from "@/lib/get-country";

// Card detail (incl. live retailer prices) for the quick-view modal. Resolves by
// slug or legacy id. Short CDN cache since prices refresh every ~3h.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // While intl is off, hard-filter to AU so no non-AU rows ever reach the client
  // (the client still filters by country, but this is defence-in-depth). When
  // intl is on we return all markets and let the client switch without a re-fetch.
  const priceWhere = INTL_ENABLED ? undefined : { country: getCountry() };
  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: {
      id: true,
      slug: true,
      name: true,
      setName: true,
      setCode: true,
      collectorNumber: true,
      domain: true,
      type: true,
      rarity: true,
      variant: true,
      isPromo: true,
      energyCost: true,
      might: true,
      power: true,
      imageUrl: true,
      imageThumbUrl: true,
      blurDataUrl: true,
      orientation: true,
      artSeed: true,
      lowestPriceCents: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
      // Last time the eBay pass reached this card — drives the "search eBay" fallback.
      ebayCheckedAt: true,
      retailerPrices: {
        where: priceWhere,
        orderBy: { priceCents: "asc" },
        // country is returned so the client can show just the selected market's
        // listings (keeps this response cacheable regardless of the viewer's country).
        select: { id: true, retailer: true, retailerName: true, priceCents: true, shippingCents: true, condition: true, url: true, inStock: true, country: true, isFoil: true, lastSeen: true },
      },
      // Cached eBay Ad carousel listings (same data the full card page shows) —
      // a handful of rows per market, so returning every country here is cheap
      // and keeps this response cacheable regardless of the viewer's market.
      ebayAdListings: {
        orderBy: [{ country: "asc" }, { rank: "asc" }],
        select: { country: true, rank: true, priceCents: true, shippingCents: true, currency: true, url: true, title: true, imageUrl: true },
      },
      // Graded slabs for the quick-view's eBay tabs — chase-tier only, so for
      // most cards these come back empty and the modal renders exactly the
      // single carousel it always did.
      //
      // Filtered HERE rather than in the client: a slab that stopped refreshing
      // must never reach the browser with an affiliate link on it. The renderer
      // checks again — two independent layers, because a pass runs on a
      // schedule and rows go stale continuously.
      ebayGradedListings: {
        where: { updatedAt: { gte: new Date(Date.now() - 72 * 3600 * 1000) } },
        orderBy: [{ grade: "desc" }, { priceCents: "asc" }],
        take: 24,
        select: {
          itemId: true, cardId: true, country: true, priceCents: true, shippingCents: true,
          currency: true, url: true, title: true, imageUrl: true, grader: true, grade: true,
        },
      },
    },
  });

  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(card, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  });
}
