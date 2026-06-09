import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPriceHistory } from "@/lib/price-history";
import { getInsight } from "@/lib/ai-insight";

export const dynamic = "force-dynamic";

// AI market insight for a card (the "AI Tips" panel). Verdict is computed from our
// price data; the prose is Claude-written when ANTHROPIC_API_KEY is set, else a
// rule-based fallback. Cached per card per day.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: { id: true, name: true, rarity: true, setCode: true },
  });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const points = await getPriceHistory(card.id);
  const insight = await getInsight(card, points);
  return NextResponse.json(insight, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
