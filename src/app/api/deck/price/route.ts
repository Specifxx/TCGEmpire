import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { parseDeckList } from "@/lib/deck";
import { getCountry } from "@/lib/get-country";
import { pickPrice, priceField } from "@/lib/country";

export const dynamic = "force-dynamic";

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  nameNormalized: true,
  setCode: true,
  collectorNumber: true,
  variant: true,
  imageThumbUrl: true,
  imageUrl: true,
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsDe: true,
} as const;

type DeckCard = {
  id: string;
  slug: string | null;
  name: string;
  nameNormalized: string;
  setCode: string;
  collectorNumber: string;
  variant: string | null;
  imageThumbUrl: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
  lowestPriceCentsSg: number | null;
  lowestPriceCentsCa: number | null;
  lowestPriceCentsDe: number | null;
};

export async function POST(req: Request) {
  const country = getCountry();
  const orderByPrice = [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text : "";
  const lines = parseDeckList(text).slice(0, 200);

  // Batch all lookups into a few queries instead of one-or-two per line (which was
  // slow enough to feel like a hang on a full deck).
  const nqs = Array.from(new Set(lines.filter((l) => l.name).map((l) => normalizeSearch(l.name))));
  const numbers = Array.from(new Set(lines.filter((l) => l.number).map((l) => l.number!)));

  const [nameCards, numCards] = await Promise.all([
    nqs.length
      ? prisma.card.findMany({
          where: { nameNormalized: { in: nqs } },
          select: cardSelect,
          orderBy: orderByPrice,
        })
      : Promise.resolve([] as DeckCard[]),
    numbers.length
      ? prisma.card.findMany({
          where: { OR: numbers.map((n) => ({ collectorNumber: { startsWith: `${n}/` } })) },
          select: cardSelect,
          orderBy: orderByPrice,
        })
      : Promise.resolve([] as DeckCard[]),
  ]);

  // Cheapest printing per name / per number (orderBy already sorts cheapest first).
  const byName = new Map<string, DeckCard>();
  for (const c of nameCards) if (!byName.has(c.nameNormalized)) byName.set(c.nameNormalized, c);
  const byNum = new Map<string, DeckCard>();
  for (const c of numCards) {
    const k = c.collectorNumber.split("/")[0];
    if (!byNum.has(k)) byNum.set(k, c);
  }

  // Resolve lines; collect any still unmatched for a single contains-fallback query.
  const items = lines.map((l) => ({ line: l, card: null as DeckCard | null }));
  const unresolved: { idx: number; nq: string }[] = [];
  items.forEach((it, idx) => {
    const l = it.line;
    if (l.number) {
      const c = byNum.get(l.number);
      if (c && (!l.setCode || c.setCode === l.setCode)) it.card = c;
    }
    if (!it.card && l.name) {
      const nq = normalizeSearch(l.name);
      const c = byName.get(nq);
      if (c) it.card = c;
      else if (nq.length >= 3) unresolved.push({ idx, nq });
    }
  });

  if (unresolved.length) {
    const fallback = await prisma.card.findMany({
      where: { OR: unresolved.map((u) => ({ nameNormalized: { contains: u.nq } })) },
      select: cardSelect,
      orderBy: orderByPrice,
    });
    for (const u of unresolved) {
      const hit = fallback.find((c) => c.nameNormalized.includes(u.nq));
      if (hit) items[u.idx].card = hit;
    }
  }

  const out = items.map(({ line, card }) => {
    const unitPriceCents = card ? pickPrice(card, country) : null;
    return {
      raw: line.raw,
      qty: line.qty,
      name: line.name,
      card,
      unitPriceCents,
      lineCents: unitPriceCents != null ? unitPriceCents * line.qty : 0,
    };
  });

  const totalQty = out.reduce((n, i) => n + i.qty, 0);
  const totalCents = out.reduce((n, i) => n + i.lineCents, 0);
  const matchedCount = out.filter((i) => i.card).length;
  const pricedQty = out.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0);

  return NextResponse.json({
    items: out,
    totalQty,
    totalCents,
    matchedCount,
    unmatchedCount: out.length - matchedCount,
    pricedQty,
  });
}
