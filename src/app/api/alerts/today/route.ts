import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { COUNTRIES, pickPrice, type Country } from "@/lib/country";
import { getPriceHistory } from "@/lib/price-history";
import { recentWindow } from "@/lib/history-access";
import { dropBreakWindow } from "@/lib/methodology-breaks";
import { todayItems, TODAY_MAX } from "@/lib/your-cards-today";

// "Your cards today" (components/home/YourCardsToday.tsx, 2026-11-18): the signed-in account's newest watched cards with today's
// price in one market and a 30-day sparkline. Per user, uncached, select-limited and bounded: at most 40 watch rows (one indexed
// read, card fields only; the sparkline drops methodology-break windows like every comparing reader, no store-count subquery), cut to TODAY_MAX distinct cards; the sparklines come from the committed price
// history files (lib/price-history-store.ts), not Neon. Session cookie ⇒ never cacheable.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const c = (new URL(req.url).searchParams.get("country") ?? "AU").toUpperCase();
  const country: Country = (c in COUNTRIES ? c : "AU") as Country;

  const rows = await prisma.priceAlert
    .findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        cardId: true,
        card: {
          select: {
            id: true,
            slug: true,
            name: true,
            imageThumbUrl: true,
            imageUrl: true,
            lowestPriceCents: true,
            lowestPriceCentsUs: true,
            lowestPriceCentsUk: true,
            lowestPriceCentsSg: true,
            lowestPriceCentsCa: true,
            lowestPriceCentsEu: true,
          },
        },
      },
    })
    .catch(() => null);
  if (rows === null) return NextResponse.json({ error: "Couldn't read your watch list" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const cards = todayItems(rows.map((r) => r.card).filter((x): x is NonNullable<typeof x> => !!x));
  const items = await Promise.all(
    cards.map(async (card) => {
      const points = await getPriceHistory(card.id, country).then((all) => dropBreakWindow(recentWindow(all))).catch(() => []);
      return {
        id: card.id,
        slug: card.slug,
        name: card.name,
        image: card.imageThumbUrl ?? card.imageUrl ?? null,
        priceCents: pickPrice(card, country),
        spark: points.map((p) => p.v),
      };
    }),
  );
  return NextResponse.json({ items, country, max: TODAY_MAX }, { headers: { "Cache-Control": "no-store" } });
}
