import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { COUNTRIES, currencyOf, type Country } from "@/lib/country";
import { usdCentsToCountry } from "@/lib/fx";
import { gradedHistoryRows } from "@/lib/price-history-store";
import { compareGrades } from "@/lib/graded-history";

// A card's graded-slab price history, one series per grade, for Plus and Premium
// (lib/graded-history.ts). Stored in US cents; converted to the visitor's market
// currency here. Private: the answer depends on who asks.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  if (!isPremium(user)) return NextResponse.json({ error: "plus_required" }, { status: 403 });
  const c = (new URL(req.url).searchParams.get("country") ?? "US").toUpperCase();
  const country: Country = (c in COUNTRIES ? c : "US") as Country;
  const card = await prisma.card.findFirst({ where: { OR: [{ slug: params.id }, { id: params.id }] }, select: { id: true } });
  if (!card) return NextResponse.json({ grades: [] }, { status: 404 });
  const byGrade = new Map<string, { t: number; v: number }[]>();
  for (const r of gradedHistoryRows(card.id)) {
    const list = byGrade.get(r.grade) ?? byGrade.set(r.grade, []).get(r.grade)!;
    list.push({ t: r.day.getTime(), v: usdCentsToCountry(r.lowestPriceCents, country) });
  }
  const grades = [...byGrade.keys()].sort(compareGrades).map((grade) => ({ grade, points: byGrade.get(grade)! }));
  return NextResponse.json({ grades, currency: currencyOf(country), country }, { headers: { "Cache-Control": "private, no-store" } });
}
