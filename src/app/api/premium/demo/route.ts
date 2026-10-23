import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, priceField } from "@/lib/country";
import { parseDeckList, resolveDeckLines } from "@/lib/deck";
import { planBasket, type BasketCard } from "@/lib/basket";
import { loadStoreListings } from "@/lib/basket-server";
import { basketStoresFor, postageOptionsFrom } from "@/lib/shipping";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { DEMO_LINE_CAP, DEMO_QTY_CAP, demoAnswer } from "@/lib/premium-page";

export const dynamic = "force-dynamic";

// /premium's "Try it free" demo (2026-10-23, DECISIONS.md "/premium, rebuilt to
// convert, honestly"). READ-ONLY and additive: it reuses Best Basket's own
// parsing (lib/deck.ts), store listings read (lib/basket-server.ts) and solver
// (lib/basket.ts planBasket) exactly as /api/basket calls them, and changes
// none of them. It saves nothing and needs no account.
//
// WHAT IT ANSWERS: totals only — the cheapest one-store order, the cheapest
// delivered split and the gap (lib/premium-page.ts demoAnswer). No store name,
// line or link leaves this route; the store-by-store plan stays on
// /tools/best-basket (Premium, or a free account's metered plans), so this is a
// taste, not a free side door around the meter.
//
// EGRESS (lib/db.ts rules 1 and 3): at most DEMO_LINE_CAP (10) lines, so the two
// reads are per-entity scoped and narrow — the card lookup resolveDeckLines
// already does, and loadStoreListings for ≤10 cards. Rate limited per IP, 10 an
// hour (in-memory, soft, like every limiter in lib/rate-limit.ts).
const HOUR = 3_600_000;

export async function POST(req: Request) {
  const rl = rateLimit(`premium-demo:${clientIp(req)}`, 10, HOUR);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.slice(0, 4000) : "";
  const all = parseDeckList(text, { plainNames: true });
  if (!all.length) return NextResponse.json({ error: "Paste a few card names, one per line." }, { status: 400 });
  const lines = all.slice(0, DEMO_LINE_CAP).map((l) => ({ ...l, qty: Math.max(1, Math.min(DEMO_QTY_CAP, l.qty)) }));

  const country = getCountry();
  try {
    const orderBy = [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
    const resolved = await resolveDeckLines(lines, (args) =>
      prisma.card.findMany({
        ...args,
        select: { id: true, name: true, slug: true, nameNormalized: true, setCode: true, collectorNumber: true, variant: true, isPromo: true },
        orderBy,
      })
    );
    const wanted = new Map<string, { qty: number; card: (typeof resolved.matched)[number]["card"] }>();
    for (const m of resolved.matched) {
      const prev = wanted.get(m.card.id);
      wanted.set(m.card.id, { qty: Math.min(DEMO_QTY_CAP, (prev?.qty ?? 0) + m.line.qty), card: m.card });
    }
    const unmatched = resolved.unmatched.map((u) => ({ raw: u.raw, qty: u.qty }));
    const stores = basketStoresFor(country, postageOptionsFrom(country, null, null));
    const listings = await loadStoreListings([...wanted.keys()], country, Object.keys(stores), prisma);
    const cards: BasketCard[] = [...wanted].map(([cardId, { qty, card }]) => ({
      cardId,
      name: card.name,
      slug: card.slug,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      qty,
      listings: listings.get(cardId) ?? [],
    }));
    const answer = demoAnswer(planBasket(cards, stores, { loc: "/premium" }), unmatched, all.length - lines.length);
    return NextResponse.json({ ...answer, currency: COUNTRIES[country].currency, lineCap: DEMO_LINE_CAP }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[premium-demo] failed", e);
    return NextResponse.json({ error: "Store prices are unavailable right now. Try again in a few minutes." }, { status: 503 });
  }
}
