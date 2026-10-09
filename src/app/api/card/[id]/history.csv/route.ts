import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getPriceHistory } from "@/lib/price-history";
import { COUNTRIES, currencyOf, type Country } from "@/lib/country";
import { historyCsv } from "@/lib/history-access";

// A card's whole price history as CSV, for Plus and Premium (lib/history-access.ts).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  if (!isPremium(user)) return NextResponse.json({ error: "plus_required" }, { status: 403 });
  const c = (new URL(req.url).searchParams.get("country") ?? "AU").toUpperCase();
  const country: Country = (c in COUNTRIES ? c : "AU") as Country;
  const card = await prisma.card.findFirst({
    where: { OR: [{ slug: params.id }, { id: params.id }] },
    select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true },
  });
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const points = await getPriceHistory(card.id, country);
  const label = `${card.name} ${card.setCode} ${card.collectorNumber}`;
  const csv = historyCsv(points, { card: label, market: country, currency: currencyOf(country) });
  const file = `${(card.slug ?? card.id).replace(/[^a-z0-9-]/gi, "")}-${country}-price-history.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
