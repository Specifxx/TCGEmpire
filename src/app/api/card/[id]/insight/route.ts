import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPriceHistory } from "@/lib/price-history";
import { getInsight } from "@/lib/ai-insight";
import { COUNTRIES, currencyOf, type Country } from "@/lib/country";

// Market insight for a card (the "Price Take" panel), in a given market. The
// route path stays /insight: it is a cached URL, not user-facing branding, and
// renaming it would strand every cached response for no reader benefit. Country
// comes from the URL (?country=US) so the CDN caches per (card, market). Verdict is
// from our price data; prose is LLM-written when a key is set, else a rule fallback.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const c = (url.searchParams.get("country") ?? "AU").toUpperCase();
  // Real market registry, not the P2P marketplace's launch list — see the same
  // fix in ../history/route.ts for why.
  const country = (c in COUNTRIES ? c : "AU") as Country;

  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: { id: true, name: true, rarity: true, setCode: true },
  });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const points = await getPriceHistory(card.id, country);
  const insight = await getInsight(card, points, currencyOf(country), country);
  return NextResponse.json(insight, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
