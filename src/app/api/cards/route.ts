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
import { normalizeCountry } from "@/lib/country";

// Paginated card feed for the Browse infinite-scroll (same filters/sort as the
// server-rendered first page, just the next slice) — and, with an explicit
// ?market= override, the same search deterministic and cacheable enough to
// document as a public API: without it, prices follow the country cookie (a
// signed-out agent has none, so results are undefined for it); with it, the
// response is the same for anyone requesting that market and safe to cache
// and share cross-origin. See /api/v1/openapi.json.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as CardQuery & { page?: string };
  const marketParam = url.searchParams.get("market");
  const country = marketParam ? normalizeCountry(marketParam) : getCountry();
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

  // Without an explicit market, the response depends on an invisible cookie, so
  // it must stay private/uncached. With one, it's the same response for every
  // caller in that market — safe to cache briefly and to expose cross-origin
  // for the documented public search use.
  return NextResponse.json(
    { cards, page },
    {
      headers: marketParam
        ? {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
            "Access-Control-Allow-Origin": "*",
          }
        : { "Cache-Control": "private, no-store" },
    }
  );
}
