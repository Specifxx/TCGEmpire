import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { INTL_ENABLED } from "@/lib/country";
import { getCountry } from "@/lib/get-country";

// Card detail (incl. live retailer prices) for the quick-view modal. Resolves by
// slug or legacy id. Short CDN cache since prices refresh every ~3h.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // While NZ is off, hard-filter to AU so no NZ rows ever reach the client (the
  // client still filters by country, but this is defence-in-depth). When NZ is on
  // we return all markets and let the client switch without a re-fetch.
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
      lowestPriceCentsNz: true,
      lowestPriceCentsUs: true,
      retailerPrices: {
        where: priceWhere,
        orderBy: { priceCents: "asc" },
        // country is returned so the client can show just the selected market's
        // listings (keeps this response cacheable regardless of the viewer's country).
        select: { id: true, retailer: true, retailerName: true, priceCents: true, shippingCents: true, condition: true, url: true, inStock: true, country: true, isFoil: true },
      },
    },
  });

  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(card, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  });
}
