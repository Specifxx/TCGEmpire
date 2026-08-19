import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import {
  canViewMarketplaceListings,
  getSellerRatings,
  MARKETPLACE_OFFERS,
  MARKETPLACE_PUBLIC,
  MARKETPLACE_RETAILER_KEYS,
} from "@/lib/marketplace";
import { MARKETPLACE_SHIP_DEADLINE_DAYS } from "@/lib/marketplace-policy";
import { ALL_FALLBACK_RETAILERS } from "@/lib/constants";
import { stripeEnabled } from "@/lib/stripe";
import { pageAlternates } from "@/lib/seo";
import { MarketplaceClient, type MktCard } from "@/components/MarketplaceClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace — buy Riftbound cards",
  description:
    "Buy Riftbound singles direct from verified sellers — browse live listings, compare them " +
    "against every store we track, and check out with buyer protection.",
  // Always canonicalize to the clean URL — ?cardId=… is just a client-side
  // "open this card" hint now (see the listings query below), not a
  // different page, so every arrival path (search, a card page's deep link,
  // a bookmark) points Google at the one real, indexable marketplace URL.
  alternates: pageAlternates("/marketplace"),
  // Indexable once the marketplace is publicly launched; noindex while the
  // private beta shows non-testers only a Coming-Soon teaser (NEXT_PUBLIC_ env
  // is baked at build time, so this resolves at build like the nav flag).
  ...(MARKETPLACE_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

// Shown right after a successful Stripe Checkout redirect back to the
// marketplace — previously the buyer landed on the bare grid with nothing but
// an email to confirm the purchase actually went through.
function PurchaseSuccessPanel() {
  return (
    <div className="card-surface mb-4 border-brand-500/30 p-5">
      <h2 className="font-display text-lg font-extrabold text-white">✅ Payment received — you&apos;re all set</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li>We&apos;ve notified the seller — they ship within {MARKETPLACE_SHIP_DEADLINE_DAYS} days or you&apos;re automatically refunded in full.</li>
        <li>You&apos;ll get an email with tracking the moment it ships, plus an estimated delivery window.</li>
        <li>Your money is held by RiftCompare and only released to the seller after delivery.</li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">Your order may take a few seconds to appear below while payment confirms.</p>
      <Link href="/marketplace/orders" className="btn-primary mt-3 inline-flex text-sm">Track it in My orders →</Link>
    </div>
  );
}

export default async function MarketplacePage({ searchParams }: { searchParams: { cardId?: string; purchase?: string } }) {
  const user = await getCurrentUser();
  const country = getCountry();
  const info = COUNTRIES[country];
  const cardId = searchParams?.cardId;

  // Private beta: only allow-listed testers see listings; everyone else gets the
  // Coming-Soon teaser (and verified sellers get their dashboard).
  if (!canViewMarketplaceListings(user?.email, user?.isAdmin)) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card-surface border-brand-500/30 p-8 text-center">
          <span className="chip mb-3 inline-flex bg-brand-500/15 font-bold uppercase tracking-wide text-brand-300">Coming soon</span>
          <h1 className="font-display text-3xl font-extrabold text-white">RiftCompare Marketplace</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">
            Buy Riftbound cards directly from verified sellers — fast, secure, with prices you can trust. We&apos;re
            putting the finishing touches on payments and shipping.
          </p>
          {user?.isVerifiedSeller && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/marketplace/sell" className="btn-primary">Open your seller dashboard →</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ?cardId=… (deep-linked from a card page's marketplace hero) used to FILTER
  // this query down to just that one card — which meant clicking through from
  // a card page landed on a thin single-card page instead of the real
  // marketplace, and made /marketplace?cardId=X a materially different (and
  // therefore unindexable/duplicate-content) variant of the canonical
  // /marketplace URL. It's now purely a client-side "scroll to and open this
  // card" hint (via `openCardId` below) — the query always returns the full
  // grid, so every visitor sees the real marketplace regardless of how they
  // arrived. Purchases stay same-region-only at launch (no cross-border
  // shipping surprises), but we don't hide OTHER regions' listings outright —
  // they're still useful price signal, so we fetch every region and mark each
  // offer `inRegion` for the client to gray out/disable instead of dropping
  // silently.
  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "ACTIVE", quantity: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 400, // egress rule: no unbounded reads on a per-request page

    include: {
      card: {
        select: {
          id: true, name: true, slug: true, setCode: true, collectorNumber: true,
          imageThumbUrl: true, variant: true, isPromo: true, rarity: true,
        },
      },
      seller: { select: { id: true, displayName: true, sellerProfile: { select: { shopName: true, isOfficial: true, shippingNote: true, handlingDays: true } } } },
    },
  });

  // Seller ratings in one query for every seller on the page.
  const ratings = await getSellerRatings([...new Set(listings.map((l) => l.sellerId))]);

  // "Under market" benchmark — the cheapest REAL, independent store price for
  // each card, in this market. Bug fixed here: this used to read
  // Card.lowestPriceCents* (pickPrice), the denormalised "cheapest price from
  // ANY source" column. That column is intentionally fed by
  // importMarketplaceListings() too (see price-import.ts) — the marketplace IS
  // meant to count as a source for the site's general "cheapest anywhere"
  // figure. But that makes it the WRONG source for THIS specific benchmark:
  // when a marketplace listing was itself the cheapest source, every listing
  // compared its price to a figure derived from marketplace listings (often its
  // own), landing on "at market" for nearly everything and backwards "more
  // expensive" results whenever a coincidentally-pricier listing set the floor.
  // A live, scoped query here instead: cheapest in-stock price excluding
  // MARKETPLACE_RETAILER_KEYS (obviously) and the AU/UK/SG converted-reference
  // retailers (TCGplayer-AU/UK/SG, Cardmarket — not real local stores, excluded
  // from every other "real store" comparison on the site; see market-rows.ts).
  const cardIds = [...new Set(listings.map((l) => l.cardId))];
  const realStoreLows = cardIds.length
    ? await prisma.retailerPrice.groupBy({
        by: ["cardId"],
        where: {
          cardId: { in: cardIds },
          country,
          inStock: true,
          retailer: { notIn: [...MARKETPLACE_RETAILER_KEYS, ...ALL_FALLBACK_RETAILERS] },
        },
        _min: { priceCents: true },
      })
    : [];
  const realMarketByCard = new Map(realStoreLows.map((r) => [r.cardId, r._min.priceCents ?? null]));

  // Group by card; sort each card's offers official-store-first, then cheapest.
  const byCard = new Map<string, MktCard>();
  for (const l of listings) {
    const r = ratings.get(l.sellerId);
    const offer = {
      id: l.id,
      priceCents: l.priceCents,
      condition: l.condition,
      isFoil: l.isFoil,
      quantity: l.quantity,
      currency: l.currency,
      sellerId: l.sellerId,
      sellerName: l.seller.sellerProfile?.shopName ?? l.seller.displayName,
      isOfficial: !!l.seller.sellerProfile?.isOfficial,
      shippingNote: l.seller.sellerProfile?.shippingNote ?? null,
      handlingDays: l.seller.sellerProfile?.handlingDays ?? 2,
      ratingAvg: r?.avg ?? null,
      ratingCount: r?.count ?? 0,
      country: l.country,
      inRegion: l.country === country,
      createdAt: l.createdAt.toISOString(),
    };
    const existing = byCard.get(l.cardId);
    if (existing) existing.offers.push(offer);
    else {
      // The cheapest REAL independent-store price for this card in this market
      // (see realMarketByCard above) — the delta benchmark ("12% under market")
      // shown against every offer. null when no real store carries it yet: never
      // fabricate a comparison against nothing.
      const marketCents = realMarketByCard.get(l.cardId) ?? null;
      byCard.set(l.cardId, { card: l.card, marketCents, offers: [offer] });
    }
  }
  // Buyable (in-region) offers first, then cross-region reference-only ones;
  // official-then-cheapest within each group.
  const cards: MktCard[] = [...byCard.values()].map((c) => {
    c.offers.sort(
      (a, b) => Number(b.inRegion) - Number(a.inRegion) || Number(b.isOfficial) - Number(a.isOfficial) || a.priceCents - b.priceCents
    );
    return c;
  });
  // The price a card sorts/displays by: cheapest offer a buyer can actually check out
  // with (in-region); only fall back to a cross-region price if nobody local sells it.
  const bestPrice = (c: MktCard) => {
    const inRegion = c.offers.filter((o) => o.inRegion);
    const pool = inRegion.length ? inRegion : c.offers;
    return Math.min(...pool.map((o) => o.priceCents));
  };
  cards.sort((a, b) => bestPrice(a) - bestPrice(b));

  return (
    <>
      {searchParams?.purchase === "success" && <PurchaseSuccessPanel />}
      {searchParams?.purchase === "cancelled" && (
        <div className="card-surface mb-4 p-4 text-sm text-slate-400">Checkout cancelled — nothing was charged; your items are still listed.</div>
      )}
      <MarketplaceClient
        cards={cards}
        place={info.place}
        country={country}
        stripeEnabled={stripeEnabled()}
        signedIn={!!user}
        currentUserId={user?.id ?? null}
        offersEnabled={MARKETPLACE_OFFERS}
        openCardId={cardId}
      />
    </>
  );
}
