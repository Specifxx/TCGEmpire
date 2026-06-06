import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Card detail (incl. live retailer prices) for the quick-view modal. Resolves by
// slug or legacy id. Short CDN cache since prices refresh every ~3h.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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
      retailerPrices: {
        orderBy: { priceCents: "asc" },
        select: { id: true, retailerName: true, priceCents: true, shippingCents: true, condition: true, url: true, inStock: true },
      },
    },
  });

  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(card, {
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  });
}
