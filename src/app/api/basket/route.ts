import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";
import { normalizeSearch } from "@/lib/format";
import { parseDeckList } from "@/lib/deck";
import { RETAILERS } from "@/lib/retailers";
import { optimizeBasket, type BasketCard } from "@/lib/basket";

export const dynamic = "force-dynamic";

// Best-Basket optimiser (Premium). Resolve a pasted decklist OR the user's wishlist
// to cards, pull every in-stock STORE listing in the viewer's market (eBay excluded
// — its per-item postage isn't comparable), and return the cheapest landed plan.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isPremium(user)) {
    return NextResponse.json({ error: "Best Basket is a Premium feature", upgrade: true }, { status: 403 });
  }

  const country = getCountry();
  const body = await req.json().catch(() => null);
  const useWishlist = body?.wishlist === true;
  const text: string = typeof body?.text === "string" ? body.text : "";

  // 1. Resolve the requested cards → { cardId, name, slug, qty }.
  let wanted: { cardId: string; name: string; slug: string | null; qty: number }[] = [];
  if (useWishlist) {
    const wl = await prisma.wishlistItem.findMany({ where: { userId: user.id }, take: 300, select: { cardId: true } });
    const ids = wl.map((w) => w.cardId);
    const cards = ids.length
      ? await prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
      : [];
    wanted = cards.map((c) => ({ cardId: c.id, name: c.name, slug: c.slug, qty: 1 }));
  } else {
    const lines = parseDeckList(text).slice(0, 200).filter((l) => l.name);
    const nqs = [...new Set(lines.map((l) => normalizeSearch(l.name)))];
    if (!nqs.length) return NextResponse.json({ error: "Paste a decklist or pick your wishlist." }, { status: 400 });
    const cards = await prisma.card.findMany({
      where: { nameNormalized: { in: nqs } },
      select: { id: true, name: true, slug: true, nameNormalized: true },
      orderBy: [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput],
    });
    const byName = new Map<string, { id: string; name: string; slug: string | null }>();
    for (const c of cards) if (!byName.has(c.nameNormalized)) byName.set(c.nameNormalized, c);
    // Merge duplicate lines into a single qty per card.
    const merged = new Map<string, { cardId: string; name: string; slug: string | null; qty: number }>();
    for (const l of lines) {
      const c = byName.get(normalizeSearch(l.name));
      if (!c) continue;
      const ex = merged.get(c.id);
      if (ex) ex.qty += l.qty;
      else merged.set(c.id, { cardId: c.id, name: c.name, slug: c.slug, qty: l.qty });
    }
    wanted = [...merged.values()];
  }
  if (!wanted.length) return NextResponse.json({ error: "No matching cards found." }, { status: 400 });

  // 2. Stores serving this market (eBay isn't in RETAILERS, so it's excluded).
  const marketStores = Object.values(RETAILERS).filter((r) => (r.country ?? "AU") === country);
  const allowed = new Set(marketStores.map((r) => r.key));
  const storesMap = Object.fromEntries(
    marketStores.map((r) => [r.key, { name: r.name, ship: { shippingFlatCents: r.shippingFlatCents, freeOverCents: r.freeOverCents } }])
  );

  // 3. In-stock listings for the wanted cards at those stores.
  const cardIds = wanted.map((w) => w.cardId);
  const listings = await prisma.retailerPrice
    .findMany({
      where: { cardId: { in: cardIds }, country, inStock: true, retailer: { in: [...allowed] } },
      select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
    })
    .catch(() => []);

  // Cheapest listing per (card, store).
  const byCardStore = new Map<string, { retailer: string; retailerName: string; priceCents: number; url: string }>();
  for (const l of listings) {
    const k = `${l.cardId}|${l.retailer}`;
    const prev = byCardStore.get(k);
    if (!prev || l.priceCents < prev.priceCents) byCardStore.set(k, l);
  }
  const listingsByCard = new Map<string, BasketCard["listings"]>();
  for (const [k, l] of byCardStore) {
    const cardId = k.split("|")[0];
    const arr = listingsByCard.get(cardId) ?? [];
    arr.push({ retailer: l.retailer, retailerName: l.retailerName, priceCents: l.priceCents, url: l.url });
    listingsByCard.set(cardId, arr);
  }

  const basketCards: BasketCard[] = wanted.map((w) => ({
    cardId: w.cardId,
    name: w.name,
    slug: w.slug,
    qty: w.qty,
    listings: listingsByCard.get(w.cardId) ?? [],
  }));

  const plan = optimizeBasket(basketCards, storesMap);
  return NextResponse.json({ plan, totalRequested: wanted.length });
}
