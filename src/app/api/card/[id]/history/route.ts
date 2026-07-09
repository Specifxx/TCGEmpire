import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPriceHistory } from "@/lib/price-history";
import type { Country } from "@/lib/country";
import { MARKETPLACE_COUNTRIES } from "@/lib/marketplace";

// Daily lowest-price history for one card in a given market (in that market's
// currency). Country comes from the URL (?country=US) so the CDN caches cleanly
// per (card, market) — not by cookie.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const c = (url.searchParams.get("country") ?? "AU").toUpperCase();
  const country: Country = ((MARKETPLACE_COUNTRIES as readonly string[]).includes(c) ? c : "AU") as Country;

  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: { id: true },
  });
  if (!card) return NextResponse.json({ points: [] }, { status: 404 });

  const points = await getPriceHistory(card.id, country);
  return NextResponse.json(
    { points, country },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } }
  );
}
