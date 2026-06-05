import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { parseDeckList } from "@/lib/deck";

const cardSelect = {
  id: true,
  name: true,
  setCode: true,
  collectorNumber: true,
  variant: true,
  imageThumbUrl: true,
  lowestPriceCents: true,
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text : "";
  const lines = parseDeckList(text).slice(0, 200);

  const items = [];
  for (const l of lines) {
    let card = null;

    if (l.number) {
      card = await prisma.card.findFirst({
        where: {
          collectorNumber: { startsWith: `${l.number}/` },
          ...(l.setCode ? { setCode: l.setCode } : {}),
        },
        select: cardSelect,
      });
    }
    if (!card && l.name) {
      const nq = normalizeSearch(l.name);
      // Prefer an exact normalized-name match, falling back to a contains match.
      card =
        (await prisma.card.findFirst({
          where: { nameNormalized: nq },
          orderBy: [{ lowestPriceCents: { sort: "asc", nulls: "last" } }],
          select: cardSelect,
        })) ??
        (nq.length >= 3
          ? await prisma.card.findFirst({
              where: { nameNormalized: { contains: nq } },
              orderBy: [{ lowestPriceCents: { sort: "asc", nulls: "last" } }],
              select: cardSelect,
            })
          : null);
    }

    const unitPriceCents = card?.lowestPriceCents ?? null;
    items.push({
      raw: l.raw,
      qty: l.qty,
      name: l.name,
      card,
      unitPriceCents,
      lineCents: unitPriceCents != null ? unitPriceCents * l.qty : 0,
    });
  }

  const totalQty = items.reduce((n, i) => n + i.qty, 0);
  const totalCents = items.reduce((n, i) => n + i.lineCents, 0);
  const matchedCount = items.filter((i) => i.card).length;
  const pricedQty = items.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0);

  return NextResponse.json({
    items,
    totalQty,
    totalCents,
    matchedCount,
    unmatchedCount: items.length - matchedCount,
    pricedQty,
  });
}
