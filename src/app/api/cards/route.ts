import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildCardWhere,
  buildCardOrderBy,
  CARD_TILE_SELECT,
  CARD_PAGE_SIZE,
  CardQuery,
} from "@/lib/cards";

export const dynamic = "force-dynamic";

// Paginated card feed for the Browse infinite-scroll. Same filters/sort as the
// server-rendered first page, just the next slice.
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries()) as CardQuery & { page?: string };
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

  return NextResponse.json({ cards, page });
}
