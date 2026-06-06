import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildCardWhere,
  buildCardOrderBy,
  CARD_TILE_SELECT,
  CARD_PAGE_SIZE,
  CardQuery,
} from "@/lib/cards";

// Paginated card feed for the Browse infinite-scroll. Same filters/sort as the
// server-rendered first page, just the next slice.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as CardQuery & { page?: string };

  // Fetch-by-ids mode (used by the wishlist page so it always reflects the live
  // cookie). Returns the cards in the requested order, no caching (per-user).
  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = idsParam.split(",").filter(Boolean).slice(0, 500);
    if (!ids.length) return NextResponse.json({ cards: [] }, { headers: { "Cache-Control": "no-store" } });
    const found = await prisma.card.findMany({ where: { id: { in: ids } }, select: CARD_TILE_SELECT });
    const order = new Map(ids.map((id, i) => [id, i]));
    found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return NextResponse.json({ cards: found }, { headers: { "Cache-Control": "no-store" } });
  }

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where = buildCardWhere(sp);
  const orderBy = buildCardOrderBy(sp.sort);

  const cards = await prisma.card.findMany({
    where,
    orderBy,
    select: CARD_TILE_SELECT,
    skip: (page - 1) * CARD_PAGE_SIZE,
    take: CARD_PAGE_SIZE,
  });

  // Cache identical scroll/filter requests at the CDN for a couple of minutes
  // (prices refresh every ~3h) so repeated scrolling is instant.
  return NextResponse.json(
    { cards, page },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } }
  );
}
