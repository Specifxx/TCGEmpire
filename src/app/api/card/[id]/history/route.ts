import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPriceHistory } from "@/lib/price-history";
import { COUNTRIES, type Country } from "@/lib/country";
import { olderFrom, recentWindow } from "@/lib/history-access";

// Daily lowest-price history for one card in a given market (in that market's
// currency): the last 30 days, the free window (lib/history-access.ts), plus when
// the older part starts. Plus and Premium read the whole series from ./full.
// Country comes from the URL (?country=US) so the CDN caches cleanly per
// (card, market) — not by cookie.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const c = (url.searchParams.get("country") ?? "AU").toUpperCase();
  // Validate against the real market registry (lib/country.ts), NOT the P2P
  // marketplace's launch-country list, which this used to read. Those are
  // different things: this endpoint is read-only price history for a MARKET, and
  // gating it on where we let people SELL meant any market missing from the
  // marketplace list silently fell back to AU — i.e. served Australian price
  // history under a CA/other label. Fallback stays "AU" (unchanged) for an
  // unrecognised value.
  const country: Country = (c in COUNTRIES ? c : "AU") as Country;

  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: { id: true },
  });
  if (!card) return NextResponse.json({ points: [] }, { status: 404 });

  const all = await getPriceHistory(card.id, country);
  return NextResponse.json(
    { points: recentWindow(all), olderFrom: olderFrom(all), country },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } }
  );
}
