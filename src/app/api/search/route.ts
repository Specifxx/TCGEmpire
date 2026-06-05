import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";

// Typeahead search for the navbar dropdown.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const nq = normalizeSearch(q);
  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { nameNormalized: { contains: nq } },
        { collectorNumber: { contains: q } },
      ],
    },
    // Priced cards first, then by name.
    orderBy: [{ lowestPriceCents: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    take: 8,
    select: {
      id: true,
      name: true,
      setCode: true,
      collectorNumber: true,
      variant: true,
      imageThumbUrl: true,
      lowestPriceCents: true,
    },
  });

  return NextResponse.json({ results: cards });
}
