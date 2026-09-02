import { prisma } from "@/lib/db";
import { getPriceHistory } from "@/lib/price-history";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

// Public price series for one card (weekly-bucketed — see price-history.ts's
// collapseToWeekly) — the per-card companion to /api/v1/cards.json's
// whole-catalog summary. Safe to return raw points here (unlike the bulk
// route) because it's scoped to one card, the same shape and cost profile as
// getPriceHistory's existing internal use.
export const revalidate = 172800;

const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

function parseMarket(v: string | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));

  const card = await prisma.card
    .findFirst({
      where: whereParam(params.id),
      select: { id: true, externalId: true, slug: true, name: true },
    })
    .catch(() => null);

  if (!card) {
    return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  }

  const points = await getPriceHistory(card.id, market, 120).catch(() => []);

  return Response.json(
    {
      externalId: card.externalId,
      slug: card.slug,
      name: card.name,
      market,
      currency: COUNTRIES[market].currency,
      url: `${SITE_URL}${cardHref(card)}`,
      points: points.map((p) => ({ day: new Date(p.t).toISOString().slice(0, 10), priceCents: p.v })),
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
