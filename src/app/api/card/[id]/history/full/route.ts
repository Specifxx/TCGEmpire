import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getPriceHistory } from "@/lib/price-history";
import { COUNTRIES, type Country } from "@/lib/country";

// A card's WHOLE price history for one market, for Plus and Premium
// (lib/history-access.ts). Private and uncached: the answer depends on who asks.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  if (!isPremium(user)) return NextResponse.json({ error: "plus_required" }, { status: 403 });
  const c = (new URL(req.url).searchParams.get("country") ?? "AU").toUpperCase();
  const country: Country = (c in COUNTRIES ? c : "AU") as Country;
  const card = await prisma.card.findFirst({ where: { OR: [{ slug: params.id }, { id: params.id }] }, select: { id: true } });
  if (!card) return NextResponse.json({ points: [] }, { status: 404 });
  const points = await getPriceHistory(card.id, country);
  return NextResponse.json({ points, country, full: true }, { headers: { "Cache-Control": "private, no-store" } });
}
