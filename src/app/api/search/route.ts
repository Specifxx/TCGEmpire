import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { cardTileSelect } from "@/lib/cards";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";

// Typeahead search for the navbar dropdown. Returns full tile data so a result can
// open the same instant quick-view modal as the browse grid.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const country = getCountry();
  const nq = normalizeSearch(q);
  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { nameNormalized: { contains: nq } },
        { collectorNumber: { contains: q } },
      ],
    },
    // Priced cards first (in the selected market), then by name.
    orderBy: [
      { [priceField(country)]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
      { name: "asc" },
    ],
    take: 8,
    select: cardTileSelect(country),
  });

  return NextResponse.json({ results: cards });
}
