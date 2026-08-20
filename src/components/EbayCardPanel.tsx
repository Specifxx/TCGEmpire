import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { COUNTRY_LIST, priceField } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { EbayCardPanelLive } from "./EbayCardPanelLive";
import type { GradedRow } from "./EbayGradedLive";
import type { AdListing } from "./EbayAdCarouselLive";

/**
 * Server half of the card page's tabbed eBay panel: Listings / Graded.
 *
 * Loads EVERY market's rows and lets the client half select the visitor's, so
 * the card page stays statically cacheable — the same split EbayPicks and
 * EbayAdCarousel already use. Reading the country here would force the route
 * dynamic and undo the ISR work the page depends on.
 */

/** Rows not refreshed within this window are not served. */
const GRADED_MAX_AGE_HOURS = 72;

/** Per-market cheapest tracked RAW price, keyed `country|cardId`. */
async function marketPrices(cardIds: string[]): Promise<Map<string, number>> {
  if (cardIds.length === 0) return new Map();
  const cards = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: {
      id: true,
      ...Object.fromEntries(COUNTRY_LIST.map((c) => [priceField(c.code), true])),
    } as any,
  });
  const out = new Map<string, number>();
  for (const c of cards as any[]) {
    for (const info of COUNTRY_LIST) {
      const v = c[priceField(info.code)];
      if (typeof v === "number" && v > 0) out.set(`${info.code}|${c.id}`, v);
    }
  }
  return out;
}

async function loadGraded(cardId: string): Promise<GradedRow[]> {
  const rows = await prisma.ebayGradedListing.findMany({
    where: {
      cardId,
      // A fixed-price listing has no end time — it just sells — so freshness is
      // by age. A sold slab still on screen sends a buyer to a dead page with an
      // affiliate tag on it. The importer also sweeps rows that stop returning.
      updatedAt: { gte: new Date(Date.now() - GRADED_MAX_AGE_HOURS * 3600 * 1000) },
    },
    orderBy: [{ grade: "desc" }, { priceCents: "asc" }],
    take: 24,
    select: {
      itemId: true, cardId: true, country: true, priceCents: true, shippingCents: true,
      currency: true, url: true, title: true, imageUrl: true, grader: true, grade: true,
    },
  });
  const prices = await marketPrices([cardId]);
  return rows.map((r) => ({ ...r, marketCents: prices.get(`${r.country}|${r.cardId}`) ?? null }));
}

/** Ad-carousel rows — the Listings tab. Same query EbayAdCarousel used. */
async function loadListings(cardId: string): Promise<AdListing[]> {
  return (await prisma.ebayAdListing.findMany({
    where: { cardId },
    orderBy: [{ country: "asc" }, { rank: "asc" }],
    select: {
      country: true, rank: true, priceCents: true, shippingCents: true,
      currency: true, url: true, title: true, imageUrl: true,
    },
  })) as AdListing[];
}

export async function EbayCardPanel({
  cardId,
  query,
  className,
}: {
  cardId: string;
  /** Card name for the generic "search eBay" fallback in the Listings tab. */
  query: string;
  className?: string;
}) {
  let graded: GradedRow[] = [];
  let listings: AdListing[] = [];
  try {
    // ⚠ THIS TTL MUST NOT BE LOWER THAN THE PAGE'S OWN `revalidate` (86400, see
    // app/card/[id]/page.tsx). It was 300 until 2026-08-14, and that single
    // number was burning roughly 2 GB of Neon transfer a day — the reason five
    // consecutive database projects hit their monthly allowance in days.
    //
    // WHY, because it is not obvious and nothing warns you: an `unstable_cache`
    // revalidate does not only bound ITS OWN entry. Next.js applies it to the
    // whole route segment's static-generation store, taking the LOWER of the two
    // (next/dist/server/web/spec-extension/unstable-cache.js — `store.revalidate
    // = options.revalidate` unless the store's is already smaller). So this 300
    // silently overrode the page's 86400 and re-ran EVERY query on the card page
    // — ~10 uncached round trips, ~60 KB each — up to 288× a day per URL instead
    // of once. It was visible only in .next/prerender-manifest.json, where all
    // 200 prerendered /card/* routes carried initialRevalidateSeconds: 300.
    //
    // Freshness does not depend on this number anyway: revalidateContent()
    // purges CONTENT_TAG *and* the /card/[id] path after every price import
    // (lib/revalidate-content.ts), which is the site's actual freshness
    // mechanism. Matching 86400 keeps this panel exactly as fresh as every other
    // price on the page — refreshed on each import, capped at 24h if a purge is
    // missed. If anything here ever needs a shorter window than the page, fetch
    // it CLIENT-side so the TTL can never propagate to the segment again.
    [graded, listings] = await unstable_cache(
      () => Promise.all([loadGraded(cardId), loadListings(cardId)]),
      ["ebay-card-panel", cardId],
      { revalidate: 86400, tags: [CONTENT_TAG] },
    )();
  } catch {
    // A database blip must never take down a card page for a panel.
    graded = [];
    listings = [];
  }

  return (
    <EbayCardPanelLive
      cardId={cardId}
      query={query}
      listings={listings}
      graded={graded}
      className={className}
    />
  );
}
