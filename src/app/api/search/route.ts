import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { cardTileSelect } from "@/lib/cards";
import { getSealedGroups } from "@/lib/sealed-import";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";

// Typeahead search for the navbar dropdown. Returns full tile data so a result can
// open the same instant quick-view modal as the browse grid, plus any matching
// sealed products (booster boxes/packs/etc.).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [], sealed: [] });

  const country = getCountry();
  const nq = normalizeSearch(q);
  const [cards, sealedAll] = await Promise.all([
    prisma.card.findMany({
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
    }),
    // Sealed groups load + group the whole sealed table — far too heavy to redo on
    // every keystroke. Cache per market; sealed prices only change on the import.
    unstable_cache(() => getSealedGroups(country), ["sealed-groups", country], { revalidate: 600 })(),
  ]);

  const ql = q.toLowerCase();
  const sealed = sealedAll
    .filter(
      (g) =>
        g.name.toLowerCase().includes(ql) ||
        g.productType.toLowerCase().includes(ql) ||
        (g.setCode ?? "").toLowerCase().includes(ql)
    )
    .slice(0, 4)
    .map((g) => ({
      groupKey: g.groupKey,
      name: g.name,
      productType: g.productType,
      setCode: g.setCode,
      imageUrl: g.imageUrl,
      lowestPriceCents: g.lowestPriceCents,
    }));

  return NextResponse.json({ results: cards, sealed });
}
