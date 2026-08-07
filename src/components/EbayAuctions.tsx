import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { COUNTRY_LIST, priceField } from "@/lib/country";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { EbayAuctionsLive, type AuctionRow } from "./EbayAuctionsLive";

/**
 * Server half of the live-auctions unit.
 *
 * Loads every market's rows at once and lets the client half pick the visitor's,
 * so the pages hosting it stay statically cacheable — the same split EbayPicks
 * and EbayAdCarousel use. The alternative (reading the country here) would force
 * every card page dynamic.
 *
 * It also joins each auction to OUR cheapest Buy It Now for that card in that
 * market, which is the number the whole feature exists for: eBay can show a bid,
 * but only we can say what fraction of the real market that bid is.
 */

const SELECT = {
  itemId: true,
  cardId: true,
  country: true,
  currentBidCents: true,
  bidCount: true,
  buyItNowCents: true,
  currency: true,
  endsAt: true,
  url: true,
  title: true,
  imageUrl: true,
  isGraded: true,
} as const;

/** Per-market cheapest tracked price for a set of cards, keyed `country|cardId`. */
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

async function load(where: { cardId?: string; setCode?: string }, take: number): Promise<AuctionRow[]> {
  const rows = await prisma.ebayAuction.findMany({
    where: {
      // Never serve an auction that has already closed. The importer sweeps
      // these, but a pass only runs daily and auctions close continuously, so
      // the read side enforces it too — as does the renderer. A stale affiliate
      // link to a finished auction is the one outcome this feature must not
      // produce, so all three layers check independently.
      endsAt: { gt: new Date() },
      ...(where.cardId ? { cardId: where.cardId } : {}),
      ...(where.setCode ? { card: { setCode: where.setCode } } : {}),
    },
    orderBy: { endsAt: "asc" },
    take,
    select: { ...SELECT, card: { select: { name: true } } },
  });

  const prices = await marketPrices([...new Set(rows.map((r) => r.cardId))]);
  return rows.map((r) => ({
    itemId: r.itemId,
    cardId: r.cardId,
    country: r.country,
    currentBidCents: r.currentBidCents,
    bidCount: r.bidCount,
    buyItNowCents: r.buyItNowCents,
    currency: r.currency,
    endsAt: r.endsAt.toISOString(),
    url: r.url,
    title: r.title,
    imageUrl: r.imageUrl,
    isGraded: r.isGraded,
    cardName: r.card?.name,
    marketCents: prices.get(`${r.country}|${r.cardId}`) ?? null,
  }));
}

export async function EbayAuctions({
  cardId,
  setCode,
  take = 12,
  heading,
  showCardName,
  className,
}: {
  /** Auctions for one card (the card page). */
  cardId?: string;
  /** …or across a set's chase cards (the set hub's "ending soon"). */
  setCode?: string;
  take?: number;
  heading?: string;
  showCardName?: boolean;
  className?: string;
}) {
  if (!cardId && !setCode) return null;

  let auctions: AuctionRow[] = [];
  try {
    // Short TTL by design. Everything else on these pages caches for an hour,
    // but an hour is a long time in an auction that ends in two — and the cache
    // key cannot expire a row mid-window on its own. Five minutes keeps the
    // countdown close to true without querying per request.
    auctions = await unstable_cache(
      () => load({ cardId, setCode }, take),
      ["ebay-auctions", cardId ?? "", setCode ?? "", String(take)],
      { revalidate: 300, tags: [CONTENT_TAG] },
    )();
  } catch {
    // A database blip must never take down a card page for a widget.
    auctions = [];
  }

  if (auctions.length === 0) return null;
  return (
    <EbayAuctionsLive
      auctions={auctions}
      showCardName={showCardName ?? Boolean(setCode)}
      className={className}
      {...(heading ? { heading } : {})}
    />
  );
}
