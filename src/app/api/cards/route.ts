import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildCardWhere,
  buildCardOrderBy,
  cardTileSelect,
  CARD_PAGE_SIZE,
  CardQuery,
} from "@/lib/cards";
import { getCountry } from "@/lib/get-country";

// Paginated card feed for the Browse infinite-scroll. Same filters/sort as the
// server-rendered first page, just the next slice. Prices follow the country cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as CardQuery & { page?: string };
  const country = getCountry();
  const select = cardTileSelect(country);

  // Fetch-by-ids mode (used by the wishlist page so it always reflects the live
  // cookie). Returns the cards in the requested order, no caching (per-user).
  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = idsParam.split(",").filter(Boolean).slice(0, 500);
    if (!ids.length) return NextResponse.json({ cards: [] }, { headers: { "Cache-Control": "no-store" } });
    const found = await prisma.card.findMany({ where: { id: { in: ids } }, select });
    const order = new Map(ids.map((id, i) => [id, i]));
    found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return NextResponse.json({ cards: found }, { headers: { "Cache-Control": "no-store" } });
  }

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const where = buildCardWhere(sp, country);
  const orderBy = buildCardOrderBy(sp.sort, country);

  const cards = await prisma.card.findMany({
    where,
    orderBy,
    select,
    skip: (page - 1) * CARD_PAGE_SIZE,
    take: CARD_PAGE_SIZE,
  });

  // Response varies by the country cookie, so don't share it across viewers.
  return NextResponse.json(
    { cards, page },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
