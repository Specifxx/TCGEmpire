import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, PORTFOLIO_FREE } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { basketPreview, optimizeBasket, type BasketCard } from "@/lib/basket";
import { loadBinderHoldings, loadStoreListings, marketStores } from "@/lib/basket-server";

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
// the Best Basket tool uses rather than inventing a second, worse answer. The
// reads (the binder, its listings) are lib/basket-server.ts's, shared with
// /api/basket's source=binder.
//
// ── The total is free; the store-by-store plan is Premium (2026-09-25) ──────
// Every account that can see the panel gets the delivered total, the store
// count and the gap against the headline value. The per-store plan is Best
// Basket's output, so a non-Premium response carries only basketPreview()'s
// aggregate — no store names, lines or links — and the panel links to Best
// Basket (source=binder) for the plan.
//
// ── Why this is a route and not part of the page render ──────────────────────
// It reads every in-stock listing for every card held, which is a far bigger
// query than the portfolio page's own. Behind a button it runs when someone asks
// for it; on the page it would run on every /portfolio view, for every visitor,
// forever. With RetailerPrice the standing suspect in the transfer burn (see the
// egress rules at the top of lib/db.ts) that is not a trade worth making. The
// read is still scoped the way those rules require: this user's card ids only,
// in-stock only, one market, an explicit `select`, MAX_HOLDINGS as the cap —
// and, since 2026-09-25, a per-user rate limit.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // The same gate the rest of /portfolio uses, so this panel cannot end up
  // locked on a page whose other panels are open (PORTFOLIO_FREE is the one
  // flag that re-gates all of them together).
  if (!isPremium(user) && !PORTFOLIO_FREE) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }
  const rl = rateLimit(`replacement:${user.id}`, 12, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const full = isPremium(user, "premium");
  const country = getCountry();

  try {
    const { wanted, skipped, empty } = await loadBinderHoldings(user.id, country);
    if (empty) return NextResponse.json({ error: "Nothing in your collection yet." }, { status: 400 });

    const { allowed, stores } = marketStores(country);
    const listings = await loadStoreListings(
      wanted.map((w) => w.cardId),
      country,
      allowed
    );
    const basketCards: BasketCard[] = wanted.map((w) => ({
      cardId: w.cardId,
      name: w.name,
      slug: w.slug,
      setCode: w.setCode,
      collectorNumber: w.collectorNumber,
      qty: w.qty,
      listings: listings.get(w.cardId) ?? [],
    }));

    const plan = optimizeBasket(basketCards, stores, { loc: "/portfolio" });

    return NextResponse.json({
      ...basketPreview(plan),
      // Premium only: the store-by-store plan behind the total.
      ...(full ? { plan } : {}),
      // What the SAME cards contribute to the headline "Collection value", so the
      // panel compares like with like. Comparing the plan against the whole
      // portfolio total would charge the cap and the unbuyable rows to postage.
      valuedCents: wanted.reduce((s, w) => s + w.valueCents, 0),
      pricedHoldings: wanted.length,
      skippedHoldings: skipped,
    });
  } catch (e) {
    console.error("[portfolio/replacement] query failed", e);
    return NextResponse.json({ error: "Store prices are unavailable right now. Try again in a few minutes." }, { status: 503 });
  }
}
