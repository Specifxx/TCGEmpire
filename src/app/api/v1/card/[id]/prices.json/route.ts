import { prisma } from "@/lib/db";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

// Public, machine-readable per-region lowest prices for one card. Agent/dashboard
// friendly; referenced from the card page and llms.txt. `?id` accepts slug or id.
export const revalidate = 900;

const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const card = await prisma.card
    .findFirst({
      where: whereParam(params.id),
      select: {
        id: true,
        slug: true,
        name: true,
        setName: true,
        setCode: true,
        collectorNumber: true,
        imageUrl: true,
        lowestPriceCents: true,
        lowestPriceCentsNz: true,
        lowestPriceCentsUs: true,
        lowestPriceCentsUk: true,
        lowestPriceCentsSg: true,
        lowestPriceCentsCa: true,
      },
    })
    .catch(() => null);

  if (!card) {
    return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }

  const body = {
    card: {
      name: card.name,
      set: card.setName,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      url: `${SITE_URL}${cardHref(card)}`,
      image: card.imageUrl,
    },
    prices: {
      AU: { lowestCents: card.lowestPriceCents, currency: "AUD" },
      NZ: { lowestCents: card.lowestPriceCentsNz, currency: "NZD" },
      US: { lowestCents: card.lowestPriceCentsUs, currency: "USD" },
      UK: { lowestCents: card.lowestPriceCentsUk, currency: "GBP" },
      SG: { lowestCents: card.lowestPriceCentsSg, currency: "SGD" },
      CA: { lowestCents: card.lowestPriceCentsCa, currency: "CAD" },
    },
    note: "Prices are the lowest live in-stock listing per market, in integer cents. null = no tracked in-stock listing.",
    source: `${SITE_URL}${cardHref(card)}`,
    generatedAt: new Date().toISOString(),
  };

  return Response.json(body, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
