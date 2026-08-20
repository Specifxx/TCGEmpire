import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice, priceField } from "@/lib/country";

export const dynamic = "force-dynamic";

// Random priced cards for the arcade games (/games/*): a sample of cards that
// have BOTH a live price in the viewer's market and a real image. One endpoint
// powers every game — Higher or Lower and Price Check use the prices, Zoomed In
// and Pairs just want the art. Prices are public on the site anyway, so shipping
// them to the client is fine (these are casual games, not contests).
const idsForMarket = unstable_cache(
  async (field: ReturnType<typeof priceField>) => {
    const where: Prisma.CardWhereInput = { imageThumbUrl: { not: null } };
    where[field] = { not: null };
    // ids only (~25 bytes/row) but cap anyway — egress rule: no unbounded reads.
    const rows = await prisma.card.findMany({ where, select: { id: true }, take: 5000 });
    return rows.map((r) => r.id);
  },
  ["games-card-ids"],
  { revalidate: 600 }
);

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.min(100, Math.max(8, parseInt(url.searchParams.get("n") ?? "60", 10) || 60));
  const country = getCountry();
  const field = priceField(country);

  try {
    const ids = await idsForMarket(field);
    const picked = sample(ids, n);
    const rows = await prisma.card.findMany({
      where: { id: { in: picked } },
      select: {
        id: true, slug: true, name: true, setCode: true, collectorNumber: true,
        imageThumbUrl: true,
        lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsDe: true,
      },
    });
    // findMany loses the random order — reshuffle, then strip to the game shape.
    const cards = sample(rows, rows.length)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        setCode: c.setCode,
        collectorNumber: c.collectorNumber,
        img: c.imageThumbUrl!,
        priceCents: pickPrice(c, country),
      }))
      .filter((c) => c.priceCents != null);
    return NextResponse.json(
      { currency: COUNTRIES[country].currency, cards },
      { headers: { "Cache-Control": "private, no-store" } } // every fetch = a fresh deal
    );
  } catch {
    return NextResponse.json({ error: "Couldn't deal the cards — try again." }, { status: 503 });
  }
}
