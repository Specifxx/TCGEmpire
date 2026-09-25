import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, PORTFOLIO_FREE } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { pickPrice } from "@/lib/country";
import { cardTileSelect } from "@/lib/cards";
import { CONDITION_MULTIPLIER } from "@/lib/constants";
import { optimizeBasket, type BasketCard } from "@/lib/basket";
import { basketStoresFor, postageContextFor, postageOptionsFrom } from "@/lib/shipping";

export const dynamic = "force-dynamic";

// What it would cost to BUY this collection again today, delivered.
//
// ── The gap this closes ──────────────────────────────────────────────────────
// "Collection value" on /portfolio is the lowest in-stock ITEM price in the
// viewer's market, condition-adjusted. Postage is not in it, and a reader spotted
// exactly why that understates things (feedback cmu24pck9, 2026-09-15): the
// cheapest copy of a card is often at one far-off store, and a $2 card behind $12
// of postage is not a $2 card. Price a whole collection that way, one card per
// store, and the delivery you would actually pay is invisible.
//
// So this answers the OTHER question — replacement cost — and leaves the headline
// alone. Value (what the cards are worth) and replacement cost (what re-buying
// them costs) are different numbers, and quietly folding postage into the first
// would make the portfolio disagree with every other price on the site.
//
// ── Why it reuses the Best-Basket optimiser ──────────────────────────────────
// Postage is charged PER ORDER, not per card. Adding a shipping fee to each
// card's price would be wrong in the other direction — buy eight cards from one
// store and you pay postage once, and most stores ship free over a threshold.
// lib/basket.ts already minimises exactly that (consolidate onto fewer stores vs.
// chase each cheapest listing), so this hands the collection to the same solver
// the Best Basket tool uses rather than inventing a second, worse answer.
//
// ── Why this is a route and not part of the page render ──────────────────────
// It reads every in-stock listing for every card held, which is a far bigger
// query than the portfolio page's own. Behind a button it runs when someone asks
// for it; on the page it would run on every /portfolio view, for every visitor,
// forever. With RetailerPrice the standing suspect in the transfer burn (see the
// egress rules at the top of lib/db.ts) that is not a trade worth making. The
// read is still scoped the way those rules require: this user's card ids only,
// in-stock only, one market, an explicit `select`, and MAX_HOLDINGS as the cap.

// The optimiser is a greedy start plus a hill-climb over cards × stores, and the
// listing read grows with the collection. Best Basket caps its own input at 200
// lines for the same reason; a collection past this is priced on its dearest
// rows, which is where the money is, and the response says so rather than
// silently pricing part of it.
const MAX_HOLDINGS = 200;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // The same gate the rest of /portfolio uses, so this panel cannot end up
  // locked on a page whose other panels are open (PORTFOLIO_FREE is the one
  // flag that re-gates all of them together).
  if (!isPremium(user) && !PORTFOLIO_FREE) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }

  const country = getCountry();
  // The same postage model as Best Basket: each store's MEASURED checkout rate
  // (lib/shipping.ts) for the buyer's region — ?region=, remembered by the
  // panel from the Best Basket picker; absent = the highest regional figure —
  // and ?tracked=1 to skip untracked letters.
  const params = new URL(req.url).searchParams;
  const postageOpts = postageOptionsFrom(country, params.get("region"), params.get("tracked"));

  const rows = await prisma.collectionCard.findMany({
    where: { userId: user.id },
    select: {
      cardId: true,
      quantity: true,
      condition: true,
      card: { select: cardTileSelect(country) },
    },
  });
  // Same defensive filter getPortfolio() carries: a stale cardId left by a
  // database restore comes back with a null `card` despite the non-null type,
  // and one bad row must not fail the whole request.
  const valid = rows.filter((r) => r.card != null);
  if (!valid.length) return NextResponse.json({ error: "Nothing in your collection yet." }, { status: 400 });

  // Merge duplicate rows (the same printing in two conditions is two rows, but
  // one card to re-buy) and rank by what the collection says each is worth, so a
  // capped run prices the dearest holdings rather than an arbitrary 200.
  const merged = new Map<string, { cardId: string; name: string; slug: string | null; qty: number; valueCents: number }>();
  for (const r of valid) {
    const market = pickPrice(r.card, country);
    const unit = market != null ? Math.round(market * (CONDITION_MULTIPLIER[r.condition] ?? 1)) : 0;
    const ex = merged.get(r.cardId);
    if (ex) {
      ex.qty += r.quantity;
      ex.valueCents += unit * r.quantity;
    } else {
      merged.set(r.cardId, {
        cardId: r.cardId,
        name: r.card.name,
        slug: r.card.slug,
        qty: r.quantity,
        valueCents: unit * r.quantity,
      });
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.valueCents - a.valueCents);
  const wanted = ranked.slice(0, MAX_HOLDINGS);
  const skipped = ranked.length - wanted.length;

  // Stores serving this market. eBay is not in RETAILERS and is excluded on
  // purpose — its per-item postage is quoted per listing and is not comparable
  // with a store's per-order rate, which is the same call /api/basket makes.
  const storesMap = basketStoresFor(country, postageOpts);
  const allowed = Object.keys(storesMap);

  const listings = await prisma.retailerPrice
    .findMany({
      where: { cardId: { in: wanted.map((w) => w.cardId) }, country, inStock: true, retailer: { in: allowed } },
      select: { cardId: true, retailer: true, retailerName: true, priceCents: true, url: true },
    })
    .catch(() => []);

  // Cheapest listing per (card, store) — the optimiser wants one row per store,
  // not every copy a store has.
  const byCardStore = new Map<string, { cardId: string; retailer: string; retailerName: string; priceCents: number; url: string }>();
  for (const l of listings) {
    const k = `${l.cardId}|${l.retailer}`;
    const prev = byCardStore.get(k);
    if (!prev || l.priceCents < prev.priceCents) byCardStore.set(k, l);
  }
  const listingsByCard = new Map<string, BasketCard["listings"]>();
  for (const l of byCardStore.values()) {
    const arr = listingsByCard.get(l.cardId) ?? [];
    arr.push({ retailer: l.retailer, retailerName: l.retailerName, priceCents: l.priceCents, url: l.url });
    listingsByCard.set(l.cardId, arr);
  }

  const basketCards: BasketCard[] = wanted.map((w) => ({
    cardId: w.cardId,
    name: w.name,
    slug: w.slug,
    qty: w.qty,
    listings: listingsByCard.get(w.cardId) ?? [],
  }));

  const plan = optimizeBasket(basketCards, storesMap);

  return NextResponse.json({
    plan,
    // What the SAME cards contribute to the headline "Collection value", so the
    // panel compares like with like. Comparing the plan against the whole
    // portfolio total would charge the cap and the unbuyable rows to postage.
    valuedCents: wanted.reduce((s, w) => s + w.valueCents, 0),
    pricedHoldings: wanted.length,
    skippedHoldings: skipped,
    shipping: postageContextFor(country, postageOpts),
  });
}
